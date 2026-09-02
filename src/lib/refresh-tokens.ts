import { createHash, randomUUID } from 'crypto'
import { prisma } from './prisma.js'
import { REFRESH_TOKEN_TTL_MS, signRefreshToken, verifyRefreshToken } from './jwt.js'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

interface IssuedRefreshToken {
  token: string
  family: string
}

// Cree un tout nouveau couple (nouvelle famille) - utilise au login.
export async function issueRefreshToken(userId: string): Promise<IssuedRefreshToken> {
  const family = randomUUID()
  const token = signRefreshToken(userId, family)

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      family,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  })

  return { token, family }
}

interface RotateResult {
  ok: true
  token: string
  userId: string
}

interface RotateFailure {
  ok: false
  reason: 'invalid' | 'reused' | 'expired'
}

// Verifie un refresh token presente par le client, le revoque, et en emet un nouveau
// dans la meme famille. Si le token presente a deja ete revoque (reutilisation), c'est
// le signe qu'il a ete vole : on revoque toute la famille pour couper court.
export async function rotateRefreshToken(presentedToken: string): Promise<RotateFailure | RotateResult> {
  const payload = verifyRefreshToken(presentedToken)

  if (!payload) {
    return { ok: false, reason: 'invalid' }
  }

  const tokenHash = hashToken(presentedToken)
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } })

  if (!existing) {
    return { ok: false, reason: 'invalid' }
  }

  if (existing.revokedAt) {
    await revokeFamily(existing.family)
    return { ok: false, reason: 'reused' }
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' }
  }

  const nextToken = signRefreshToken(payload.sub, payload.family)
  const nextTokenHash = hashToken(nextToken)

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: nextTokenHash,
        family: payload.family,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        replacedByTokenId: existing.id,
      },
    }),
  ])

  return { ok: true, token: nextToken, userId: payload.sub }
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const tokenHash = hashToken(presentedToken)

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { family, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
