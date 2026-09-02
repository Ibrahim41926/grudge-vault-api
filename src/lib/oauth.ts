import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { config } from './config.js'

const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys'

export interface VerifiedOAuthUser {
  email: string
  emailVerified: boolean
  name: string | null
  sub: string
}

let googleClient: OAuth2Client | null = null

function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    googleClient = new OAuth2Client()
  }

  return googleClient
}

export function isGoogleOAuthConfigured(): boolean {
  return config.googleOAuthClientIds.length > 0
}

export function isAppleOAuthConfigured(): boolean {
  return config.appleOAuthClientIds.length > 0
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedOAuthUser | null> {
  if (!isGoogleOAuthConfigured()) {
    return null
  }

  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken,
      audience: config.googleOAuthClientIds,
    })

    const payload = ticket.getPayload()

    if (!payload?.sub || !payload.email) {
      return null
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
    }
  } catch {
    return null
  }
}

const appleJwks = jwksClient({
  jwksUri: APPLE_JWKS_URI,
  cache: true,
  cacheMaxAge: 12 * 60 * 60 * 1000,
})

function getAppleSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    appleJwks.getSigningKey(kid, (error, key) => {
      if (error || !key) {
        reject(error ?? new Error('Cle Apple introuvable.'))
        return
      }

      resolve(key.getPublicKey())
    })
  })
}

export async function verifyAppleIdToken(idToken: string): Promise<VerifiedOAuthUser | null> {
  if (!isAppleOAuthConfigured()) {
    return null
  }

  try {
    const decodedHeader = jwt.decode(idToken, { complete: true })
    const kid = decodedHeader && typeof decodedHeader === 'object' ? decodedHeader.header.kid : null

    if (!kid) {
      return null
    }

    const publicKey = await getAppleSigningKey(kid)
    const payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: config.appleOAuthClientIds as [string, ...string[]],
    })

    if (typeof payload !== 'object' || payload === null || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      return null
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: null,
    }
  } catch {
    return null
  }
}
