import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required.`)
  }

  return value
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function parseCommaList(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseOrigins(value: string | undefined): string[] {
  const parsed = parseCommaList(value)
  return parsed.length > 0 ? parsed : ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19006']
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  apiUrl: trimTrailingSlash(process.env.API_URL?.trim() || 'http://localhost:4000'),
  cronSecret: process.env.CRON_SECRET?.trim() || '',
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
  openAiReminderModel: process.env.OPENAI_REMINDER_MODEL?.trim() || 'gpt-4o-mini',
  webAppUrl: trimTrailingSlash(process.env.WEB_APP_URL?.trim() || 'http://localhost:3000'),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  resendApiKey: requireEnv('RESEND_API_KEY'),
  resendFromEmail: process.env.RESEND_FROM_EMAIL?.trim() || 'GrudgeVault <onboarding@resend.dev>',
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseUrl: requireEnv('SUPABASE_URL'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  fileTokenSecret: requireEnv('FILE_TOKEN_SECRET'),
  storageRoot: path.resolve(process.env.STORAGE_ROOT?.trim() || path.join(process.cwd(), 'storage')),
  maxUploadSizeBytes: Number.parseInt(process.env.MAX_UPLOAD_SIZE_BYTES ?? '', 10) || 25 * 1024 * 1024,
  // Optionnelles : l'app doit demarrer meme sans OAuth configure (fonctionnalite desactivee).
  googleOAuthClientIds: parseCommaList(process.env.GOOGLE_OAUTH_CLIENT_IDS),
  appleOAuthClientIds: parseCommaList(process.env.APPLE_OAUTH_CLIENT_IDS),
} as const
