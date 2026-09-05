import type { FastifyReply } from 'fastify'

export const REFRESH_COOKIE_NAME = 'grudgevault_refresh'
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

// Cookie httpOnly pour le web (le mobile continue de gerer le refresh token
// lui-meme via SecureStore, a partir du meme champ `refresh_token` en JSON).
// path: '/' (pas '/api/auth') - le cookie doit etre envoye sur TOUTES les requetes
// au domaine, y compris les pages Next.js (localhost:3000/dashboard/...) pour que
// src/proxy.ts cote web puisse le lire. Les cookies ne sont pas isoles par port.
export function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  })
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/' })
}
