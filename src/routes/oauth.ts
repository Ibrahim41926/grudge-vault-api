import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { isAppleOAuthConfigured, isGoogleOAuthConfigured, verifyAppleIdToken, verifyGoogleIdToken } from '../lib/oauth.js'
import { prisma } from '../lib/prisma.js'
import { issueSession, publicUser } from '../lib/session.js'
import { toTrimmedString } from '../lib/validation.js'

interface OAuthBody {
  full_name?: unknown
  id_token?: unknown
}

export async function registerOAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: OAuthBody; Params: { provider: string } }>(
    '/api/auth/oauth/:provider',
    async (request: FastifyRequest<{ Body: OAuthBody; Params: { provider: string } }>, reply: FastifyReply) => {
      const provider = request.params.provider
      const idToken = toTrimmedString(request.body?.id_token)
      const suppliedFullName = toTrimmedString(request.body?.full_name)

      if (provider !== 'google' && provider !== 'apple') {
        return reply.code(404).send({ error: 'Fournisseur inconnu.' })
      }

      if (!idToken) {
        return reply.code(400).send({ error: 'id_token requis.' })
      }

      if (provider === 'google' && !isGoogleOAuthConfigured()) {
        return reply.code(501).send({ error: 'Connexion Google non configuree.' })
      }

      if (provider === 'apple' && !isAppleOAuthConfigured()) {
        return reply.code(501).send({ error: 'Connexion Apple non configuree.' })
      }

      const verified = provider === 'google' ? await verifyGoogleIdToken(idToken) : await verifyAppleIdToken(idToken)

      if (!verified) {
        return reply.code(401).send({ error: 'Jeton invalide.' })
      }

      if (!verified.emailVerified) {
        return reply.code(400).send({ error: 'Email non verifie par le fournisseur.' })
      }

      const existingIdentity = await prisma.oAuthIdentity.findUnique({
        where: { provider_providerUserId: { provider, providerUserId: verified.sub } },
        include: { user: true },
      })

      if (existingIdentity) {
        const session = await issueSession(existingIdentity.user.id)
        return reply.send({ ...session, user: publicUser(existingIdentity.user) })
      }

      const fullName = verified.name || suppliedFullName || null

      const user = await prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({ where: { email: verified.email } })

        const linkedUser =
          existingUser ??
          (await tx.user.create({
            data: {
              email: verified.email,
              passwordHash: null,
              fullName,
              emailConfirmedAt: new Date(),
            },
          }))

        await tx.oAuthIdentity.create({
          data: {
            userId: linkedUser.id,
            provider,
            providerUserId: verified.sub,
            email: verified.email,
          },
        })

        return linkedUser
      })

      const session = await issueSession(user.id)
      return reply.send({ ...session, user: publicUser(user) })
    }
  )
}
