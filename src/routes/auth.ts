import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { User } from '@supabase/supabase-js'
import {
  buildVerificationUrl,
  consumeVerificationToken,
  createVerificationToken,
  deleteVerificationTokensForUser,
  findUserByEmail,
  findVerificationToken,
  normalizeEmail,
  normalizeFullName,
  normalizePassword,
  sendVerificationEmail,
  sendWelcomeEmail,
  syncProfile,
} from '../lib/auth-verification.js'
import { config } from '../lib/config.js'
import { createAdminClient } from '../lib/supabase.js'

interface SignupBody {
  email?: unknown
  full_name?: unknown
  password?: unknown
}

function getPublicAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Inscription impossible.'
  }

  const normalized = error.message.toLowerCase()

  if (normalized.includes('fetch failed')) {
    return 'Le backend ne parvient pas a joindre Supabase. Verifiez que le serveur a bien acces a Internet.'
  }

  return error.message
}

function getSignupErrorStatus(message: string): number {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('already') ||
    normalized.includes('email_exists') ||
    normalized.includes('already registered')
  ) {
    return 409
  }

  if (normalized.includes('password') || normalized.includes('weak_password')) {
    return 400
  }

  return 500
}

function buildVerifyRedirect(status: 'already' | 'error' | 'expired' | 'invalid' | 'success'): string {
  const redirectUrl = new URL('/auth/verify', config.webAppUrl)
  redirectUrl.searchParams.set('status', status)
  return redirectUrl.toString()
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/signup', async (request: FastifyRequest<{ Body: SignupBody }>, reply: FastifyReply) => {
    const email = normalizeEmail(request.body?.email)
    const fullName = normalizeFullName(request.body?.full_name)
    const password = normalizePassword(request.body?.password)

    if (!email || !email.includes('@')) {
      return reply.code(400).send({ error: 'Adresse email invalide.' })
    }

    if (password.length < 8) {
      return reply.code(400).send({ error: 'Le mot de passe doit faire au moins 8 caracteres.' })
    }

    let admin
    let existingUser: User | null

    try {
      admin = createAdminClient()
      existingUser = await findUserByEmail(admin, email)
    } catch (error) {
      app.log.error({ err: error }, 'Signup bootstrap error')
      const message = getPublicAuthErrorMessage(error)
      return reply.code(500).send({ error: message })
    }

    const existingFullName = typeof existingUser?.user_metadata?.full_name === 'string'
      ? existingUser.user_metadata.full_name.trim()
      : ''
    const resolvedFullName = fullName || existingFullName

    if (existingUser?.email_confirmed_at) {
      return reply.code(409).send({ error: 'Un compte existe deja avec cet email.' })
    }

    let user = existingUser
    let shouldDeleteUserOnFailure = false

    try {
      if (user) {
        const attributes: {
          email_confirm: boolean
          password: string
          user_metadata?: { full_name: string }
        } = {
          password,
          email_confirm: false,
        }

        if (resolvedFullName) {
          attributes.user_metadata = { full_name: resolvedFullName }
        }

        const { data, error } = await admin.auth.admin.updateUserById(user.id, attributes)

        if (error || !data.user) {
          throw new Error(error?.message ?? 'Mise a jour du compte impossible.')
        }

        user = data.user
      } else {
        const attributes: {
          email: string
          email_confirm: boolean
          password: string
          user_metadata?: { full_name: string }
        } = {
          email,
          password,
          email_confirm: false,
        }

        if (resolvedFullName) {
          attributes.user_metadata = { full_name: resolvedFullName }
        }

        const { data, error } = await admin.auth.admin.createUser(attributes)

        if (error || !data.user) {
          throw new Error(error?.message ?? 'Creation du compte impossible.')
        }

        user = data.user
        shouldDeleteUserOnFailure = true
      }

      await syncProfile(admin, {
        email,
        fullName: resolvedFullName,
        userId: user.id,
      })

      await deleteVerificationTokensForUser(admin, user.id)

      const { rawToken } = await createVerificationToken(admin, {
        email,
        userId: user.id,
      })

      await sendVerificationEmail({
        email,
        fullName: resolvedFullName,
        user,
        verificationUrl: buildVerificationUrl(rawToken),
      })

      return reply.send({ success: true })
    } catch (error) {
      if (user) {
        await deleteVerificationTokensForUser(admin, user.id).catch(() => null)
      }

      if (shouldDeleteUserOnFailure && user) {
        await admin.auth.admin.deleteUser(user.id).catch(() => null)
      }

      app.log.error({ err: error }, 'Signup route error')
      const message = getPublicAuthErrorMessage(error)
      return reply.code(getSignupErrorStatus(message)).send({ error: message })
    }
  })

  app.get('/api/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = typeof request.query === 'object' && request.query !== null
      ? Reflect.get(request.query, 'token')
      : null
    const rawToken = typeof token === 'string' ? token.trim() : ''

    if (!rawToken) {
      return reply.redirect(buildVerifyRedirect('invalid'))
    }

    const admin = createAdminClient()

    try {
      const verification = await findVerificationToken(admin, rawToken)

      if (!verification) {
        return reply.redirect(buildVerifyRedirect('invalid'))
      }

      if (verification.consumed_at) {
        return reply.redirect(buildVerifyRedirect('already'))
      }

      if (new Date(verification.expires_at).getTime() <= Date.now()) {
        return reply.redirect(buildVerifyRedirect('expired'))
      }

      const { data, error } = await admin.auth.admin.getUserById(verification.user_id)
      const user = data.user

      if (error || !user) {
        return reply.redirect(buildVerifyRedirect('invalid'))
      }

      const alreadyConfirmed = Boolean(user.email_confirmed_at)

      if (!alreadyConfirmed) {
        const { error: confirmError } = await admin.auth.admin.updateUserById(user.id, {
          email_confirm: true,
        })

        if (confirmError) {
          return reply.redirect(buildVerifyRedirect('error'))
        }
      }

      await consumeVerificationToken(admin, verification.id)

      if (!alreadyConfirmed && user.email) {
        sendWelcomeEmail({
          email: user.email,
          user,
        }).catch((welcomeError) => {
          app.log.error({ err: welcomeError }, 'Welcome email error')
        })
      }

      return reply.redirect(buildVerifyRedirect(alreadyConfirmed ? 'already' : 'success'))
    } catch (error) {
      app.log.error({ err: error }, 'Verification error')
      return reply.redirect(buildVerifyRedirect('error'))
    }
  })
}
