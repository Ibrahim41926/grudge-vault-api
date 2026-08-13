import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { renderVerificationEmail } from '../emails/verification-email.js'
import { renderWelcomeEmail } from '../emails/welcome-email.js'
import { config } from './config.js'
import { getResend } from './resend.js'

const TOKEN_TTL_HOURS = 24

interface VerificationTokenRow {
  consumed_at: string | null
  email: string
  expires_at: string
  id: string
  user_id: string
}

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

  const metadataName = user?.user_metadata?.full_name
  return typeof metadataName === 'string' && metadataName.trim() ? metadataName.trim() : 'Archiviste'
}

function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function buildVerificationUrl(token: string): string {
  const verificationUrl = new URL('/api/auth/verify', config.apiUrl)
  verificationUrl.searchParams.set('token', token)
  return verificationUrl.toString()
}

export async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()

  if (profile?.id) {
    const { data, error } = await admin.auth.admin.getUserById(profile.id)

    if (!error && data.user?.email?.toLowerCase() === email) {
      return data.user
    }
  }

  let page = 1
  const perPage = 200

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })

    if (error) {
      break
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) {
      return match
    }

    if (data.users.length < perPage) {
      break
    }

    page += 1
  }

  return null
}

export async function syncProfile(admin: SupabaseClient, params: {
  email: string
  fullName: string
  userId: string
}) {
  const { error } = await admin
    .from('profiles')
    .upsert(
      {
        id: params.userId,
        email: params.email,
        full_name: params.fullName || null,
      },
      { onConflict: 'id' }
    )

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteVerificationTokensForUser(admin: SupabaseClient, userId: string) {
  const { error } = await admin
    .from('email_verification_tokens')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function createVerificationToken(admin: SupabaseClient, params: {
  email: string
  userId: string
}) {
  const rawToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString()

  const { error } = await admin
    .from('email_verification_tokens')
    .insert({
      user_id: params.userId,
      email: params.email,
      token_hash: hashVerificationToken(rawToken),
      expires_at: expiresAt,
    })

  if (error) {
    throw new Error(error.message)
  }

  return { expiresAt, rawToken }
}

export async function findVerificationToken(admin: SupabaseClient, rawToken: string): Promise<VerificationTokenRow | null> {
  const { data, error } = await admin
    .from('email_verification_tokens')
    .select('id, user_id, email, expires_at, consumed_at')
    .eq('token_hash', hashVerificationToken(rawToken))
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function consumeVerificationToken(admin: SupabaseClient, tokenId: string) {
  const { error } = await admin
    .from('email_verification_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', tokenId)

  if (error) {
    throw new Error(error.message)
  }
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
