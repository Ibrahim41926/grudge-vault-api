import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { authenticate } from '../plugins/authenticate.js'
import { prisma } from '../lib/prisma.js'
import { serializeReminder } from '../lib/serializers.js'
import { isValidFrequency, toNullableString, toTrimmedString, toValidDate } from '../lib/validation.js'

const GRUDGE_SUMMARY_SELECT = { id: true, firstName: true, lastName: true, title: true } as const

interface CreateReminderBody {
  custom_interval_days?: unknown
  frequency?: unknown
  grudge_id?: unknown
  message?: unknown
  next_trigger_at?: unknown
  title?: unknown
}

interface UpdateReminderBody {
  custom_interval_days?: unknown
  frequency?: unknown
  is_active?: unknown
  message?: unknown
  next_trigger_at?: unknown
  title?: unknown
}

export async function registerReminderRoutes(app: FastifyInstance) {
  app.get('/api/reminders', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>
    const where: Prisma.ReminderWhereInput = { userId: request.userId as string }

    if (typeof query.grudge_id === 'string') {
      where.grudgeId = query.grudge_id
    }

    if (query.is_active === 'true') {
      where.isActive = true
    } else if (query.is_active === 'false') {
      where.isActive = false
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: { grudge: { select: GRUDGE_SUMMARY_SELECT } },
      orderBy: { nextTriggerAt: 'asc' },
    })

    return reply.send(reminders.map((reminder) => serializeReminder(reminder)))
  })

  app.post<{ Body: CreateReminderBody }>('/api/reminders', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.userId as string
    const grudgeId = toTrimmedString(request.body?.grudge_id)
    const title = toTrimmedString(request.body?.title)
    const frequency = request.body?.frequency
    const nextTriggerAt = toValidDate(request.body?.next_trigger_at)
    const customIntervalDays = typeof request.body?.custom_interval_days === 'number' ? request.body.custom_interval_days : null

    if (!grudgeId || !title || !isValidFrequency(frequency) || !nextTriggerAt) {
      return reply.code(400).send({ error: 'grudge_id, title, frequency et next_trigger_at valides sont requis.' })
    }

    const grudge = await prisma.grudge.findFirst({ where: { id: grudgeId, userId } })

    if (!grudge) {
      return reply.code(404).send({ error: 'Rancune introuvable.' })
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId,
        grudgeId,
        title,
        message: toNullableString(request.body?.message),
        frequency,
        customIntervalDays,
        nextTriggerAt,
      },
      include: { grudge: { select: GRUDGE_SUMMARY_SELECT } },
    })

    return reply.send(serializeReminder(reminder))
  })

  app.patch<{ Body: UpdateReminderBody; Params: { id: string } }>('/api/reminders/:id', { preHandler: authenticate }, async (request, reply) => {
    const reminder = await prisma.reminder.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!reminder) {
      return reply.code(404).send({ error: 'Rappel introuvable.' })
    }

    const data: Prisma.ReminderUpdateInput = {}
    const body = request.body ?? {}

    if (typeof body.title === 'string') {
      data.title = toTrimmedString(body.title)
    }

    if (typeof body.message === 'string') {
      data.message = toNullableString(body.message)
    }

    if (isValidFrequency(body.frequency)) {
      data.frequency = body.frequency
    }

    if (typeof body.custom_interval_days === 'number') {
      data.customIntervalDays = body.custom_interval_days
    }

    const nextTriggerAt = toValidDate(body.next_trigger_at)
    if (nextTriggerAt) {
      data.nextTriggerAt = nextTriggerAt
    }

    if (typeof body.is_active === 'boolean') {
      data.isActive = body.is_active
    }

    const updated = await prisma.reminder.update({
      where: { id: reminder.id },
      data,
      include: { grudge: { select: GRUDGE_SUMMARY_SELECT } },
    })

    return reply.send(serializeReminder(updated))
  })

  app.delete<{ Params: { id: string } }>('/api/reminders/:id', { preHandler: authenticate }, async (request, reply) => {
    const reminder = await prisma.reminder.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!reminder) {
      return reply.code(404).send({ error: 'Rappel introuvable.' })
    }

    await prisma.reminder.delete({ where: { id: reminder.id } })
    return reply.send({ success: true })
  })
}
