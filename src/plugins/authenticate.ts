import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAccessToken } from '../lib/jwt.js'

function getBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

// preHandler a poser sur chaque route protegee : `{ preHandler: authenticate }`.
// Attache `request.userId` si le token est valide, sinon repond 401 directement.
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = getBearerToken(request)
  const payload = token ? verifyAccessToken(token) : null

  if (!payload) {
    return reply.code(401).send({ error: 'Non authentifie.' })
  }

  request.userId = payload.sub
}
