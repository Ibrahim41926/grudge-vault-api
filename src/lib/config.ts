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

function parseOrigins(value: string | undefined): string[] {
  if (!value) {
    return ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19006']
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
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
  storageBucket: 'grudge-media',
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseUrl: requireEnv('SUPABASE_URL'),
} as const
