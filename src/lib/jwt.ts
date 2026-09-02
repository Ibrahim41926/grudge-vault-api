import jwt from 'jsonwebtoken'
import { config } from './config.js'

export const ACCESS_TOKEN_TTL = '15m'
export const REFRESH_TOKEN_TTL = '30d'
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface AccessTokenPayload {
  sub: string
}

interface RefreshTokenPayload {
  sub: string
  family: string
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, config.jwtAccessSecret, {
    expiresIn: ACCESS_TOKEN_TTL,
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtAccessSecret)

    if (typeof decoded === 'object' && decoded !== null && typeof decoded.sub === 'string') {
      return { sub: decoded.sub }
    }

    return null
  } catch {
    return null
  }
}

export function signRefreshToken(userId: string, family: string): string {
  return jwt.sign({ sub: userId, family } satisfies RefreshTokenPayload, config.jwtRefreshSecret, {
    expiresIn: REFRESH_TOKEN_TTL,
  })
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtRefreshSecret)

    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof decoded.sub === 'string' &&
      typeof (decoded as Record<string, unknown>).family === 'string'
    ) {
      return { sub: decoded.sub, family: (decoded as Record<string, unknown>).family as string }
    }

    return null
  } catch {
    return null
  }
}
