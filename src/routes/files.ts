import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { resolveStoragePath } from '../lib/storage.js'
import { verifySignedDownloadToken } from '../lib/signed-url.js'

// Route PUBLIQUE (pas de preHandler authenticate) : <img src>/<Image> ne peuvent pas
// envoyer de header Authorization. La protection vient uniquement du token signe,
// courte duree, embarque dans l'URL - meme comportement que createSignedUrl Supabase.
export async function registerFileRoutes(app: FastifyInstance) {
  app.get('/api/files/:token', async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const storagePath = verifySignedDownloadToken(request.params.token)

    if (!storagePath) {
      return reply.code(403).send({ error: 'Lien invalide ou expire.' })
    }

    let absolutePath: string

    try {
      absolutePath = resolveStoragePath(storagePath)
      await stat(absolutePath)
    } catch {
      return reply.code(404).send({ error: 'Fichier introuvable.' })
    }

    const upload = await prisma.upload.findFirst({ where: { storagePath } })
    const mimeType = upload?.mimeType || 'application/octet-stream'

    reply.header('X-Content-Type-Options', 'nosniff')
    reply.type(mimeType)
    return reply.send(createReadStream(absolutePath))
  })
}
