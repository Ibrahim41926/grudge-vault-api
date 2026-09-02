import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { authenticate } from '../plugins/authenticate.js'
import { prisma } from '../lib/prisma.js'
import { serializeGrudge } from '../lib/serializers.js'
import { deleteFile } from '../lib/storage.js'
import {
  isValidCategory,
  isValidSeverity,
  toNullableString,
  toStringArray,
  toTrimmedString,
  toValidDate,
} from '../lib/validation.js'

const GRUDGE_INCLUDE = {
  grudgeTags: { include: { tag: true } },
  uploads: true,
} satisfies Prisma.GrudgeInclude

const SORT_FIELDS: Record<string, keyof Prisma.GrudgeOrderByWithRelationInput> = {
  created_at: 'createdAt',
  incident_date: 'incidentDate',
  severity: 'severity',
  title: 'title',
}

interface GrudgeBody {
  category?: unknown
  description?: unknown
  email?: unknown
  first_name?: unknown
  incident_date?: unknown
  last_name?: unknown
  nickname?: unknown
  phone?: unknown
  severity?: unknown
  social_handle?: unknown
  tag_ids?: unknown
  title?: unknown
}

async function searchGrudgeIds(userId: string, search: string): Promise<string[]> {
  const terms = search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `+${term.replace(/[+\-<>()~*"@]/g, '')}*`)
    .join(' ')

  if (!terms) {
    return []
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM grudges
    WHERE user_id = ${userId}
      AND MATCH(first_name, last_name, nickname, title, description) AGAINST(${terms} IN BOOLEAN MODE)
  `

  return rows.map((row) => row.id)
}

async function assertTagsOwnedByUser(tagIds: string[], userId: string): Promise<boolean> {
  if (tagIds.length === 0) {
    return true
  }

  const count = await prisma.tag.count({ where: { id: { in: tagIds }, userId } })
  return count === tagIds.length
}

async function fetchFullGrudge(id: string) {
  const grudge = await prisma.grudge.findUnique({ where: { id }, include: GRUDGE_INCLUDE })
  if (!grudge) {
    return null
  }

  return serializeGrudge(grudge, { tags: grudge.grudgeTags.map((gt) => gt.tag), uploads: grudge.uploads })
}

export async function registerGrudgeRoutes(app: FastifyInstance) {
  app.get('/api/grudges', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userId as string
    const query = request.query as Record<string, unknown>
    const where: Prisma.GrudgeWhereInput = { userId }

    if (typeof query.category === 'string' && isValidCategory(query.category)) {
      where.category = query.category
    }

    if (query.is_archived === 'true') {
      where.isArchived = true
    } else if (query.is_archived !== 'all') {
      where.isArchived = false
    }

    if (query.is_favorite === 'true') {
      where.isFavorite = true
    }

    const severityMin = Number(query.severity_min)
    const severityMax = Number(query.severity_max)
    if (!Number.isNaN(severityMin) || !Number.isNaN(severityMax)) {
      where.severity = {
        ...(Number.isNaN(severityMin) ? {} : { gte: severityMin }),
        ...(Number.isNaN(severityMax) ? {} : { lte: severityMax }),
      }
    }

    if (typeof query.tag_id === 'string' && query.tag_id) {
      where.grudgeTags = { some: { tagId: query.tag_id } }
    }

    if (typeof query.search === 'string' && query.search.trim()) {
      where.id = { in: await searchGrudgeIds(userId, query.search) }
    }

    const sortField = typeof query.sort === 'string' ? SORT_FIELDS[query.sort] : undefined
    const sortOrder = query.order === 'asc' ? 'asc' : 'desc'

    const grudges = await prisma.grudge.findMany({
      where,
      include: GRUDGE_INCLUDE,
      orderBy: { [sortField ?? 'createdAt']: sortOrder },
    })

    return reply.send(
      grudges.map((grudge) =>
        serializeGrudge(grudge, { tags: grudge.grudgeTags.map((gt) => gt.tag), uploads: grudge.uploads })
      )
    )
  })

  app.get<{ Params: { id: string } }>('/api/grudges/:id', { preHandler: authenticate }, async (request, reply) => {
    const grudge = await prisma.grudge.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
      include: { ...GRUDGE_INCLUDE, reminders: true },
    })

    if (!grudge) {
      return reply.code(404).send({ error: 'Rancune introuvable.' })
    }

    return reply.send(
      serializeGrudge(grudge, {
        tags: grudge.grudgeTags.map((gt) => gt.tag),
        uploads: grudge.uploads,
        reminders: grudge.reminders,
      })
    )
  })

  app.post<{ Body: GrudgeBody }>('/api/grudges', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.userId as string
    const body = request.body ?? {}

    const firstName = toTrimmedString(body.first_name)
    const title = toTrimmedString(body.title)
    const description = toTrimmedString(body.description)
    const category = body.category
    const severity = body.severity
    const incidentDate = toValidDate(body.incident_date)
    const tagIds = toStringArray(body.tag_ids)

    if (!firstName || !title || !description || !isValidCategory(category) || !isValidSeverity(severity) || !incidentDate) {
      return reply.code(400).send({
        error: 'first_name, title, description, category, severity (1-10) et incident_date valides sont requis.',
      })
    }

    if (!(await assertTagsOwnedByUser(tagIds, userId))) {
      return reply.code(400).send({ error: 'tag_ids invalides.' })
    }

    const created = await prisma.$transaction(async (tx) => {
      const grudge = await tx.grudge.create({
        data: {
          userId,
          firstName,
          lastName: toNullableString(body.last_name),
          nickname: toNullableString(body.nickname),
          phone: toNullableString(body.phone),
          email: toNullableString(body.email),
          socialHandle: toNullableString(body.social_handle),
          title,
          description,
          category,
          severity,
          incidentDate,
        },
      })

      if (tagIds.length > 0) {
        await tx.grudgeTag.createMany({ data: tagIds.map((tagId) => ({ grudgeId: grudge.id, tagId })) })
      }

      return grudge
    })

    return reply.send(await fetchFullGrudge(created.id))
  })

  app.patch<{ Body: GrudgeBody; Params: { id: string } }>('/api/grudges/:id', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.userId as string
    const grudge = await prisma.grudge.findFirst({ where: { id: request.params.id, userId } })

    if (!grudge) {
      return reply.code(404).send({ error: 'Rancune introuvable.' })
    }

    const body = request.body ?? {}
    const data: Prisma.GrudgeUpdateInput = {}

    if (typeof body.first_name === 'string') data.firstName = toTrimmedString(body.first_name)
    if (typeof body.last_name === 'string') data.lastName = toNullableString(body.last_name)
    if (typeof body.nickname === 'string') data.nickname = toNullableString(body.nickname)
    if (typeof body.phone === 'string') data.phone = toNullableString(body.phone)
    if (typeof body.email === 'string') data.email = toNullableString(body.email)
    if (typeof body.social_handle === 'string') data.socialHandle = toNullableString(body.social_handle)
    if (typeof body.title === 'string') data.title = toTrimmedString(body.title)
    if (typeof body.description === 'string') data.description = toTrimmedString(body.description)
    if (isValidCategory(body.category)) data.category = body.category
    if (isValidSeverity(body.severity)) data.severity = body.severity

    const incidentDate = toValidDate(body.incident_date)
    if (incidentDate) data.incidentDate = incidentDate

    if (typeof (body as Record<string, unknown>).is_archived === 'boolean') {
      data.isArchived = (body as Record<string, unknown>).is_archived as boolean
    }

    if (typeof (body as Record<string, unknown>).is_favorite === 'boolean') {
      data.isFavorite = (body as Record<string, unknown>).is_favorite as boolean
    }

    const tagIds = body.tag_ids !== undefined ? toStringArray(body.tag_ids) : null

    if (tagIds !== null && !(await assertTagsOwnedByUser(tagIds, userId))) {
      return reply.code(400).send({ error: 'tag_ids invalides.' })
    }

    await prisma.$transaction(async (tx) => {
      await tx.grudge.update({ where: { id: grudge.id }, data })

      if (tagIds !== null) {
        await tx.grudgeTag.deleteMany({ where: { grudgeId: grudge.id } })

        if (tagIds.length > 0) {
          await tx.grudgeTag.createMany({ data: tagIds.map((tagId) => ({ grudgeId: grudge.id, tagId })) })
        }
      }
    })

    return reply.send(await fetchFullGrudge(grudge.id))
  })

  app.delete<{ Params: { id: string } }>('/api/grudges/:id', { preHandler: authenticate }, async (request, reply) => {
    const grudge = await prisma.grudge.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
      include: { uploads: true },
    })

    if (!grudge) {
      return reply.code(404).send({ error: 'Rancune introuvable.' })
    }

    // Le cascade DB supprime les lignes uploads/reminders/grudge_tags, mais pas les
    // fichiers physiques : a effacer explicitement avant de couper le grudge.
    await Promise.all(grudge.uploads.map((upload) => deleteFile(upload.storagePath).catch(() => null)))
    await prisma.grudge.delete({ where: { id: grudge.id } })

    return reply.send({ success: true })
  })
}
