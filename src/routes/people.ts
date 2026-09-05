import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { authenticate } from '../plugins/authenticate.js'
import { prisma } from '../lib/prisma.js'
import { serializeGrudge, serializePerson } from '../lib/serializers.js'
import { toNullableString, toTrimmedString } from '../lib/validation.js'

interface PersonBody {
  email?: unknown
  first_name?: unknown
  last_name?: unknown
  nickname?: unknown
  phone?: unknown
  social_handle?: unknown
}

export async function registerPeopleRoutes(app: FastifyInstance) {
  app.get('/api/people', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const people = await prisma.person.findMany({
      where: { userId: request.userId as string },
      orderBy: { firstName: 'asc' },
    })

    return reply.send(people.map(serializePerson))
  })

  app.get<{ Params: { id: string } }>('/api/people/:id', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.userId as string
    const person = await prisma.person.findFirst({ where: { id: request.params.id, userId } })

    if (!person) {
      return reply.code(404).send({ error: 'Personne introuvable.' })
    }

    const grudges = await prisma.grudge.findMany({
      where: { personId: person.id, userId },
      include: { grudgeTags: { include: { tag: true } }, uploads: true },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({
      ...serializePerson(person),
      grudges: grudges.map((grudge) =>
        serializeGrudge(grudge, { tags: grudge.grudgeTags.map((gt) => gt.tag), uploads: grudge.uploads })
      ),
    })
  })

  app.post<{ Body: PersonBody }>('/api/people', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body ?? {}
    const firstName = toTrimmedString(body.first_name)

    if (!firstName) {
      return reply.code(400).send({ error: 'first_name est requis.' })
    }

    const person = await prisma.person.create({
      data: {
        userId: request.userId as string,
        firstName,
        lastName: toNullableString(body.last_name),
        nickname: toNullableString(body.nickname),
        phone: toNullableString(body.phone),
        email: toNullableString(body.email),
        socialHandle: toNullableString(body.social_handle),
      },
    })

    return reply.send(serializePerson(person))
  })

  app.patch<{ Body: PersonBody; Params: { id: string } }>('/api/people/:id', { preHandler: authenticate }, async (request, reply) => {
    const person = await prisma.person.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!person) {
      return reply.code(404).send({ error: 'Personne introuvable.' })
    }

    const body = request.body ?? {}
    const data: Prisma.PersonUpdateInput = {}

    if (typeof body.first_name === 'string') data.firstName = toTrimmedString(body.first_name)
    if (typeof body.last_name === 'string') data.lastName = toNullableString(body.last_name)
    if (typeof body.nickname === 'string') data.nickname = toNullableString(body.nickname)
    if (typeof body.phone === 'string') data.phone = toNullableString(body.phone)
    if (typeof body.email === 'string') data.email = toNullableString(body.email)
    if (typeof body.social_handle === 'string') data.socialHandle = toNullableString(body.social_handle)

    const updated = await prisma.person.update({ where: { id: person.id }, data })
    return reply.send(serializePerson(updated))
  })

  app.delete<{ Params: { id: string } }>('/api/people/:id', { preHandler: authenticate }, async (request, reply) => {
    const person = await prisma.person.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!person) {
      return reply.code(404).send({ error: 'Personne introuvable.' })
    }

    // Les rancunes liees ne sont pas supprimees, juste deliees (Grudge.personId -> SetNull).
    await prisma.person.delete({ where: { id: person.id } })
    return reply.send({ success: true })
  })
}
