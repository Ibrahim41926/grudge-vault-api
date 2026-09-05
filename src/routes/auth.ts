import { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
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
} from '../lib/auth-verification.js'
import { config } from '../lib/config.js'
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from '../lib/cookies.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import {
  buildResetPasswordUrl,
  consumePasswordResetToken,
  createPasswordResetToken,
  findPasswordResetToken,
  sendPasswordResetEmail,
} from '../lib/password-reset.js'
import { prisma } from '../lib/prisma.js'
import { signAccessToken } from '../lib/jwt.js'
import { revokeAllForUser, revokeRefreshToken, rotateRefreshToken } from '../lib/refresh-tokens.js'
import { issueSession, publicUser } from '../lib/session.js'

interface SignupBody {
  email?: unknown
  full_name?: unknown
  password?: unknown
}

interface LoginBody {
  email?: unknown
  password?: unknown
}

interface RefreshBody {
  refresh_token?: unknown
}

interface ForgotPasswordBody {
  email?: unknown
}

interface ResetPasswordBody {
  token?: unknown
  password?: unknown
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

    const existingUser = await findUserByEmail(email)

    if (existingUser?.emailConfirmedAt) {
      return reply.code(409).send({ error: 'Un compte existe deja avec cet email.' })
    }

    const passwordHash = await hashPassword(password)
    const resolvedFullName = fullName || existingUser?.fullName || ''

    try {
      const user = existingUser
        ? await prisma.user.update({
            where: { id: existingUser.id },
            data: { passwordHash, fullName: resolvedFullName || null },
          })
        : await prisma.user.create({
            data: { email, passwordHash, fullName: resolvedFullName || null },
          })

      await deleteVerificationTokensForUser(user.id)

      const { rawToken } = await createVerificationToken({ email, userId: user.id })

      await sendVerificationEmail({
        email,
        fullName: resolvedFullName,
        user,
        verificationUrl: buildVerificationUrl(rawToken),
      })

      return reply.send({ success: true })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send({ error: 'Un compte existe deja avec cet email.' })
      }

      app.log.error({ err: error }, 'Signup route error')
      return reply.code(500).send({ error: 'Inscription impossible.' })
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

    try {
      const verification = await findVerificationToken(rawToken)

      if (!verification) {
        return reply.redirect(buildVerifyRedirect('invalid'))
      }

      if (verification.consumedAt) {
        return reply.redirect(buildVerifyRedirect('already'))
      }

      if (verification.expiresAt.getTime() <= Date.now()) {
        return reply.redirect(buildVerifyRedirect('expired'))
      }

      const user = await prisma.user.findUnique({ where: { id: verification.userId } })

      if (!user) {
        return reply.redirect(buildVerifyRedirect('invalid'))
      }

      const alreadyConfirmed = Boolean(user.emailConfirmedAt)

      if (!alreadyConfirmed) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailConfirmedAt: new Date() },
        })
      }

      await consumeVerificationToken(verification.id)

      if (!alreadyConfirmed) {
        sendWelcomeEmail({ email: user.email, user }).catch((welcomeError) => {
          app.log.error({ err: welcomeError }, 'Welcome email error')
        })
      }

      return reply.redirect(buildVerifyRedirect(alreadyConfirmed ? 'already' : 'success'))
    } catch (error) {
      app.log.error({ err: error }, 'Verification error')
      return reply.redirect(buildVerifyRedirect('error'))
    }
  })

  app.post('/api/auth/login', async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const email = normalizeEmail(request.body?.email)
    const password = normalizePassword(request.body?.password)

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email et mot de passe requis.' })
    }

    const user = await findUserByEmail(email)

    if (!user) {
      return reply.code(401).send({ error: 'Email ou mot de passe incorrect.' })
    }

    if (!user.passwordHash) {
      return reply.code(400).send({ error: 'Ce compte utilise Google ou Apple pour se connecter.' })
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Email ou mot de passe incorrect.' })
    }

    if (!user.emailConfirmedAt) {
      return reply.code(403).send({ error: 'Veuillez confirmer votre email avant de vous connecter.' })
    }

    const session = await issueSession(user.id)
    setRefreshCookie(reply, session.refresh_token)
    return reply.send({ ...session, user: publicUser(user) })
  })

  app.post('/api/auth/refresh', async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    const refreshToken =
      (typeof request.body?.refresh_token === 'string' ? request.body.refresh_token : '') ||
      request.cookies[REFRESH_COOKIE_NAME] ||
      ''

    if (!refreshToken) {
      return reply.code(400).send({ error: 'Refresh token requis.' })
    }

    const result = await rotateRefreshToken(refreshToken)

    if (!result.ok) {
      clearRefreshCookie(reply)
      return reply.code(401).send({ error: 'Session expiree, veuillez vous reconnecter.' })
    }

    setRefreshCookie(reply, result.token)
    return reply.send({
      access_token: signAccessToken(result.userId),
      refresh_token: result.token,
    })
  })

  app.post('/api/auth/logout', async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    const refreshToken =
      (typeof request.body?.refresh_token === 'string' ? request.body.refresh_token : '') ||
      request.cookies[REFRESH_COOKIE_NAME] ||
      ''

    if (refreshToken) {
      await revokeRefreshToken(refreshToken)
    }

    clearRefreshCookie(reply)
    return reply.send({ success: true })
  })

  app.post('/api/auth/forgot-password', async (request: FastifyRequest<{ Body: ForgotPasswordBody }>, reply: FastifyReply) => {
    const email = normalizeEmail(request.body?.email)

    if (email) {
      const user = await findUserByEmail(email)

      if (user) {
        const { rawToken } = await createPasswordResetToken(user.id)

        try {
          await sendPasswordResetEmail({ user, resetUrl: buildResetPasswordUrl(rawToken) })
        } catch (error) {
          app.log.error({ err: error }, 'Forgot password email error')
        }
      }
    }

    // Reponse identique que l'email existe ou non, pour ne pas reveler l'existence d'un compte.
    return reply.send({ success: true })
  })

  app.post('/api/auth/reset-password', async (request: FastifyRequest<{ Body: ResetPasswordBody }>, reply: FastifyReply) => {
    const rawToken = typeof request.body?.token === 'string' ? request.body.token.trim() : ''
    const newPassword = normalizePassword(request.body?.password)

    if (!rawToken) {
      return reply.code(400).send({ error: 'Token invalide.' })
    }

    if (newPassword.length < 8) {
      return reply.code(400).send({ error: 'Le mot de passe doit faire au moins 8 caracteres.' })
    }

    const verification = await findPasswordResetToken(rawToken)

    if (!verification || verification.consumedAt) {
      return reply.code(400).send({ error: 'Ce lien de reinitialisation est invalide ou deja utilise.' })
    }

    if (verification.expiresAt.getTime() <= Date.now()) {
      return reply.code(400).send({ error: 'Ce lien de reinitialisation a expire.' })
    }

    const passwordHash = await hashPassword(newPassword)

    await prisma.user.update({
      where: { id: verification.userId },
      data: { passwordHash },
    })

    await consumePasswordResetToken(verification.id)
    await revokeAllForUser(verification.userId)
    clearRefreshCookie(reply)

    return reply.send({ success: true })
  })
}
