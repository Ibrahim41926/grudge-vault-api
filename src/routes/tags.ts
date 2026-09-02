import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { authenticate } from '../plugins/authenticate.js'
import { prisma } from '../lib/prisma.js'
import { serializeTag } from '../lib/serializers.js'
import { toTrimmedString } from '../lib/validation.js'

interface CreateTagBody {
  color?: unknown
  name?: unknown
}

export async function registerTagRoutes(app: FastifyInstance) {
  app.get('/api/tags', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tags = await prisma.tag.findMany({
      where: { userId: request.userId as string },
      orderBy: { name: 'asc' },
    })

    return reply.send(tags.map(serializeTag))
  })

  app.post<{ Body: CreateTagBody }>('/api/tags', { preHandler: authenticate }, async (request, reply) => {
    const name = toTrimmedString(request.body?.name)
    const color = toTrimmedString(request.body?.color) || '#8b5cf6'

    if (!name) {
      return reply.code(400).send({ error: 'Le nom du tag est requis.' })
    }

    try {
      const tag = await prisma.tag.create({
        data: { userId: request.userId as string, name, color },
      })

      return reply.send(serializeTag(tag))
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send({ error: 'Un tag avec ce nom existe deja.' })
      }

      app.log.error({ err: error }, 'Tag creation error')
      return reply.code(500).send({ error: 'Creation du tag impossible.' })
    }
  })

  app.delete<{ Params: { id: string } }>('/api/tags/:id', { preHandler: authenticate }, async (request, reply) => {
    const tag = await prisma.tag.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!tag) {
      return reply.code(404).send({ error: 'Tag introuvable.' })
    }

    await prisma.tag.delete({ where: { id: tag.id } })
    return reply.send({ success: true })
  })
}
