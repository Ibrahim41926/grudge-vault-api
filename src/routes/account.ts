import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../plugins/authenticate.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { prisma } from '../lib/prisma.js'
import { revokeAllForUser } from '../lib/refresh-tokens.js'
import { deleteFile } from '../lib/storage.js'

interface UpdateProfileBody {
  full_name?: unknown
  notifications_email?: unknown
  notifications_frequency?: unknown
  theme?: unknown
  username?: unknown
}

interface ChangePasswordBody {
  current_password?: unknown
  new_password?: unknown
}

function publicProfile(user: {
  avatarUrl: string | null
  email: string
  fullName: string | null
  id: string
  notificationsEmail: boolean
  notificationsFrequency: string
  theme: string
  username: string | null
}) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    username: user.username,
    avatar_url: user.avatarUrl,
    notifications_email: user.notificationsEmail,
    notifications_frequency: user.notificationsFrequency,
    theme: user.theme,
  }
}

export async function registerAccountRoutes(app: FastifyInstance) {
  app.post('/api/account/delete', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userId as string

    try {
      const uploads = await prisma.upload.findMany({ where: { userId }, select: { storagePath: true } })

      // Le cascade Prisma supprime les lignes DB mais pas les fichiers physiques :
      // il faut les effacer explicitement, avant de couper l'utilisateur.
      await Promise.all(uploads.map((upload) => deleteFile(upload.storagePath).catch(() => null)))

      await prisma.user.delete({ where: { id: userId } })
    } catch (error) {
      app.log.error({ err: error }, 'Account deletion error')
      return reply.code(500).send({ error: 'Impossible de supprimer le compte.' })
    }

    return reply.send({ success: true })
  })

  app.get('/api/account/profile', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId as string } })

    if (!user) {
      return reply.code(404).send({ error: 'Compte introuvable.' })
    }

    return reply.send(publicProfile(user))
  })

  app.patch<{ Body: UpdateProfileBody }>('/api/account/profile', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body ?? {}
    const data: Record<string, unknown> = {}

    if (typeof body.full_name === 'string') {
      data.fullName = body.full_name.trim() || null
    }

    if (typeof body.username === 'string') {
      data.username = body.username.trim() || null
    }

    if (typeof body.notifications_email === 'boolean') {
      data.notificationsEmail = body.notifications_email
    }

    if (
      typeof body.notifications_frequency === 'string' &&
      ['daily', 'weekly', 'monthly', 'custom'].includes(body.notifications_frequency)
    ) {
      data.notificationsFrequency = body.notifications_frequency
    }

    if (typeof body.theme === 'string' && ['dark', 'light'].includes(body.theme)) {
      data.theme = body.theme
    }

    try {
      const user = await prisma.user.update({
        where: { id: request.userId as string },
        data,
      })

      return reply.send(publicProfile(user))
    } catch (error) {
      app.log.error({ err: error }, 'Profile update error')
      return reply.code(500).send({ error: 'Mise a jour du profil impossible.' })
    }
  })

  app.post<{ Body: ChangePasswordBody }>('/api/account/change-password', { preHandler: authenticate }, async (request, reply) => {
    const currentPassword = typeof request.body?.current_password === 'string' ? request.body.current_password : ''
    const newPassword = typeof request.body?.new_password === 'string' ? request.body.new_password : ''

    if (newPassword.length < 8) {
      return reply.code(400).send({ error: 'Le mot de passe doit faire au moins 8 caracteres.' })
    }

    const user = await prisma.user.findUnique({ where: { id: request.userId as string } })

    if (!user) {
      return reply.code(404).send({ error: 'Compte introuvable.' })
    }

    // Compte cree via Google/Apple sans mot de passe : on autorise a en definir un
    // premier directement, sans exiger un "mot de passe actuel" qui n'existe pas.
    if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
      return reply.code(401).send({ error: 'Mot de passe actuel incorrect.' })
    }

    const passwordHash = await hashPassword(newPassword)

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
    await revokeAllForUser(user.id)

    return reply.send({ success: true })
  })
}
