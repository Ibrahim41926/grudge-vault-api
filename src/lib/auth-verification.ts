import { createHash, randomBytes } from 'crypto'
import type { User } from '@prisma/client'
import { renderVerificationEmail } from '../emails/verification-email.js'
import { renderWelcomeEmail } from '../emails/welcome-email.js'
import { config } from './config.js'
import { prisma } from './prisma.js'
import { getResend } from './resend.js'

const TOKEN_TTL_HOURS = 24

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function normalizeFullName(fullName: unknown): string {
  return typeof fullName === 'string' ? fullName.trim() : ''
}

export function normalizePassword(password: unknown): string {
  return typeof password === 'string' ? password : ''
}

function getUserDisplayName(user: User | null, fallbackFullName = ''): string {
  if (fallbackFullName) {
    return fallbackFullName
  }

  return user?.fullName?.trim() || 'Archiviste'
}

function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function buildVerificationUrl(token: string): string {
  const verificationUrl = new URL('/api/auth/verify', config.apiUrl)
  verificationUrl.searchParams.set('token', token)
  return verificationUrl.toString()
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } })
}

export async function deleteVerificationTokensForUser(userId: string): Promise<void> {
  await prisma.emailVerificationToken.deleteMany({ where: { userId } })
}

export async function createVerificationToken(params: {
  email: string
  userId: string
}): Promise<{ expiresAt: Date; rawToken: string }> {
  const rawToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000)

  await prisma.emailVerificationToken.create({
    data: {
      userId: params.userId,
      email: params.email,
      tokenHash: hashVerificationToken(rawToken),
      expiresAt,
    },
  })

  return { expiresAt, rawToken }
}

export async function findVerificationToken(rawToken: string) {
  return prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashVerificationToken(rawToken) },
  })
}

export async function consumeVerificationToken(tokenId: string): Promise<void> {
  await prisma.emailVerificationToken.update({
    where: { id: tokenId },
    data: { consumedAt: new Date() },
  })
}

export async function sendVerificationEmail(params: {
  email: string
  fullName?: string
  user: User | null
  verificationUrl: string
}) {
  const { error } = await getResend().emails.send({
    from: config.resendFromEmail,
    to: params.email,
    subject: 'Confirmez votre adresse email - GrudgeVault',
    html: renderVerificationEmail({
      loginUrl: `${config.webAppUrl}/auth/login`,
      userName: getUserDisplayName(params.user, params.fullName),
      verificationUrl: params.verificationUrl,
    }),
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function sendWelcomeEmail(params: {
  email: string
  fullName?: string
  user: User | null
}) {
  const { error } = await getResend().emails.send({
    from: config.resendFromEmail,
    to: params.email,
    subject: 'Bienvenue dans vos archives - GrudgeVault',
    html: renderWelcomeEmail({
      dashboardUrl: `${config.webAppUrl}/dashboard`,
      userName: getUserDisplayName(params.user, params.fullName),
    }),
  })

  if (error) {
    throw new Error(error.message)
  }
}
