import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../plugins/authenticate.js'
import { prisma } from '../lib/prisma.js'
import { serializeNotification } from '../lib/serializers.js'

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: request.userId as string },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return reply.send(notifications.map(serializeNotification))
  })

  app.get('/api/notifications/unread-count', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const count = await prisma.notification.count({
      where: { userId: request.userId as string, isRead: false },
    })

    return reply.send({ count })
  })

  app.patch<{ Params: { id: string } }>('/api/notifications/:id', { preHandler: authenticate }, async (request, reply) => {
    const notification = await prisma.notification.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!notification) {
      return reply.code(404).send({ error: 'Notification introuvable.' })
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true },
    })

    return reply.send(serializeNotification(updated))
  })

  app.patch('/api/notifications/mark-all-read', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    await prisma.notification.updateMany({
      where: { userId: request.userId as string, isRead: false },
      data: { isRead: true },
    })

    return reply.send({ success: true })
  })
}
