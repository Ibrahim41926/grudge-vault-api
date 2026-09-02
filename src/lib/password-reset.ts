import { createHash, randomBytes } from 'crypto'
import type { User } from '@prisma/client'
import { renderResetPasswordEmail } from '../emails/reset-password-email.js'
import { config } from './config.js'
import { prisma } from './prisma.js'
import { getResend } from './resend.js'

const TOKEN_TTL_HOURS = 1

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function buildResetPasswordUrl(token: string): string {
  const url = new URL('/auth/reset-password', config.webAppUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

export async function createPasswordResetToken(userId: string): Promise<{ rawToken: string }> {
  const rawToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000)

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashResetToken(rawToken),
      expiresAt,
    },
  })

  return { rawToken }
}

export async function findPasswordResetToken(rawToken: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(rawToken) },
  })
}

export async function consumePasswordResetToken(tokenId: string): Promise<void> {
  await prisma.passwordResetToken.update({
    where: { id: tokenId },
    data: { consumedAt: new Date() },
  })
}

export async function sendPasswordResetEmail(params: { user: User; resetUrl: string }) {
  const { error } = await getResend().emails.send({
    from: config.resendFromEmail,
    to: params.user.email,
    subject: 'Reinitialisation de votre mot de passe - GrudgeVault',
    html: renderResetPasswordEmail({
      userName: params.user.fullName?.trim() || 'Archiviste',
      resetUrl: params.resetUrl,
    }),
  })

  if (error) {
    throw new Error(error.message)
  }
}
