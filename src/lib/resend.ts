import { Resend } from 'resend'
import { config } from './config.js'

let resend: Resend | null = null

export function getResend(): Resend {
  if (!resend) {
    resend = new Resend(config.resendApiKey)
  }

  return resend
}
