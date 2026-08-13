import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { renderReminderEmail } from '../emails/reminder-email.js'
import { config } from '../lib/config.js'
import { rewriteReminderMessageWithOpenAI } from '../lib/reminder-rewrite.js'
import { getResend } from '../lib/resend.js'
import { createAdminClient } from '../lib/supabase.js'

interface ReminderRow {
  custom_interval_days: number | null
  frequency: string
  grudge: null | {
    description: string | null
    first_name: string
    id: string
    incident_date: string
    last_name: string | null
    title: string
  }
  id: string
  message: string | null
  title: string
  user_id: string
}

interface ProfileRow {
  email: string | null
  full_name: string | null
  id: string
}

function isAuthorized(request: FastifyRequest): boolean {
  if (!config.cronSecret) {
    return true
  }

  return request.headers.authorization === `Bearer ${config.cronSecret}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function getNextTriggerDate(frequency: string, customDays?: number | null): Date {
  const now = new Date()

  switch (frequency) {
    case 'daily':
      return addDays(now, 1)
    case 'weekly':
      return addDays(now, 7)
    case 'monthly':
      return addMonths(now, 1)
    case 'yearly':
      return addYears(now, 1)
    case 'custom':
      return addDays(now, customDays ?? 7)
    default:
      return addDays(now, 1)
  }
}

function formatIncidentDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

export async function registerCronRoutes(app: FastifyInstance) {
  app.get('/api/cron/reminders', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data: reminders, error } = await supabase
      .from('reminders')
      .select(`
        *,
        grudge:grudges(id, title, description, first_name, last_name, incident_date)
      `)
      .eq('is_active', true)
      .lte('next_trigger_at', now)

    if (error) {
      app.log.error({ err: error }, 'Cron reminders query error')
      return reply.code(500).send({ error: error.message })
    }

    if (!reminders || reminders.length === 0) {
      return reply.send({ sent: 0, message: 'Aucun rappel a envoyer.' })
    }

    const typedReminders = reminders as ReminderRow[]
    const userIds = [...new Set(typedReminders.map((reminder) => reminder.user_id))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)

    const profileMap = new Map((profilesData as ProfileRow[] | null ?? []).map((profile) => [profile.id, profile]))

    for (const userId of userIds) {
      const profile = profileMap.get(userId)

      if (!profile?.email) {
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)

        if (authUser?.email) {
          profileMap.set(userId, {
            email: authUser.email,
            full_name: profile?.full_name ?? null,
            id: userId,
          })
        }
      }
    }

    let sent = 0
    let errors = 0
    const results: string[] = []

    for (const reminder of typedReminders) {
      const profile = profileMap.get(reminder.user_id)
      const userEmail = profile?.email
      const userName = profile?.full_name || 'Archiviste'
      const grudge = reminder.grudge

      if (!userEmail || !grudge) {
        results.push(`[SKIP] Reminder ${reminder.id} - email ou rancune manquant`)
        continue
      }

      const traitorName = `${grudge.first_name} ${grudge.last_name || ''}`.trim()
      const incidentDate = formatIncidentDate(grudge.incident_date)
      const grudgeDescription = grudge.description?.trim()
      const reminderMessageHint = reminder.message?.trim() || null
      const baseMessage = grudgeDescription || reminderMessageHint || `Rappelle-toi ce que ${traitorName} t a fait.`
      let message = baseMessage

      try {
        message = await rewriteReminderMessageWithOpenAI({
          userId: reminder.user_id,
          reminderTitle: reminder.title,
          grudgeTitle: grudge.title,
          grudgeDescription: grudgeDescription || baseMessage,
          traitorName,
          incidentDate,
          originalMessage: baseMessage,
          reminderMessageHint,
        })
      } catch (openAIError) {
        app.log.warn({ err: openAIError, reminderId: reminder.id }, 'OpenAI rewrite failed')
      }

      const { error: sendError } = await getResend().emails.send({
        from: config.resendFromEmail,
        to: userEmail,
        subject: `Rappel GrudgeVault - ${reminder.title}`,
        html: renderReminderEmail({
          userName,
          traitorName,
          grudgeTitle: grudge.title,
          message,
          incidentDate,
          dashboardUrl: `${config.webAppUrl}/dashboard`,
        }),
      })

      if (sendError) {
        app.log.error({ err: sendError, reminderId: reminder.id }, 'Reminder email failed')
        errors += 1
        results.push(`[ERROR] Reminder ${reminder.id} - ${sendError.message}`)
        continue
      }

      sent += 1

      await supabase.from('notifications').insert({
        user_id: reminder.user_id,
        grudge_id: grudge.id,
        reminder_id: reminder.id,
        title: reminder.title,
        message,
        type: 'reminder',
      })

      if (reminder.frequency === 'once') {
        await supabase
          .from('reminders')
          .update({ is_active: false, last_triggered_at: now })
          .eq('id', reminder.id)
      } else {
        const nextDate = getNextTriggerDate(reminder.frequency, reminder.custom_interval_days)
        await supabase
          .from('reminders')
          .update({ next_trigger_at: nextDate.toISOString(), last_triggered_at: now })
          .eq('id', reminder.id)
      }

      results.push(`[OK] Reminder ${reminder.id} -> ${userEmail}`)
    }

    return reply.send({
      sent,
      errors,
      total: typedReminders.length,
      results,
    })
  })
}
