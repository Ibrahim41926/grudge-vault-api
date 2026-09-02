import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { renderReminderEmail } from '../emails/reminder-email.js'
import { config } from '../lib/config.js'
import { prisma } from '../lib/prisma.js'
import { rewriteReminderMessageWithOpenAI } from '../lib/reminder-rewrite.js'
import { getResend } from '../lib/resend.js'

function isAuthorized(request: FastifyRequest): boolean {
  if (!config.cronSecret) {
    // Pas de secret configure = route fermee, jamais ouverte par defaut.
    return false
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

function formatIncidentDate(value: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

export async function registerCronRoutes(app: FastifyInstance) {
  app.get('/api/cron/reminders', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const now = new Date()

    const reminders = await prisma.reminder.findMany({
      where: { isActive: true, nextTriggerAt: { lte: now } },
      include: {
        grudge: {
          select: { id: true, title: true, description: true, firstName: true, lastName: true, incidentDate: true },
        },
      },
    })

    if (reminders.length === 0) {
      return reply.send({ sent: 0, message: 'Aucun rappel a envoyer.' })
    }

    const userIds = [...new Set(reminders.map((reminder) => reminder.userId))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, fullName: true },
    })
    const userMap = new Map(users.map((user) => [user.id, user]))

    let sent = 0
    let errors = 0
    const results: string[] = []

    for (const reminder of reminders) {
      const user = userMap.get(reminder.userId)
      const userEmail = user?.email
      const userName = user?.fullName || 'Archiviste'
      const grudge = reminder.grudge

      if (!userEmail || !grudge) {
        results.push(`[SKIP] Reminder ${reminder.id} - email ou rancune manquant`)
        continue
      }

      const traitorName = `${grudge.firstName} ${grudge.lastName || ''}`.trim()
      const incidentDate = formatIncidentDate(grudge.incidentDate)
      const grudgeDescription = grudge.description?.trim()
      const reminderMessageHint = reminder.message?.trim() || null
      const baseMessage = grudgeDescription || reminderMessageHint || `Rappelle-toi ce que ${traitorName} t a fait.`
      let message = baseMessage

      try {
        message = await rewriteReminderMessageWithOpenAI({
          userId: reminder.userId,
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

      await prisma.notification.create({
        data: {
          userId: reminder.userId,
          grudgeId: grudge.id,
          reminderId: reminder.id,
          title: reminder.title,
          message,
          type: 'reminder',
        },
      })

      if (reminder.frequency === 'once') {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { isActive: false, lastTriggeredAt: now },
        })
      } else {
        const nextDate = getNextTriggerDate(reminder.frequency, reminder.customIntervalDays)
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { nextTriggerAt: nextDate, lastTriggeredAt: now },
        })
      }

      results.push(`[OK] Reminder ${reminder.id} -> ${userEmail}`)
    }

    return reply.send({
      sent,
      errors,
      total: reminders.length,
      results,
    })
  })
}
