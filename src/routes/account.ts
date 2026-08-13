import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../lib/config.js'
import { createAdminClient, createTokenVerifierClient } from '../lib/supabase.js'

const STORAGE_DELETE_BATCH_SIZE = 100

function getBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

async function getAuthenticatedUserId(request: FastifyRequest): Promise<string | null> {
  const bearerToken = getBearerToken(request)

  if (!bearerToken) {
    return null
  }

  const supabase = createTokenVerifierClient()
  const { data, error } = await supabase.auth.getUser(bearerToken)

  if (error || !data.user) {
    return null
  }

  return data.user.id
}

function chunkPaths(paths: string[]): string[][] {
  const batches: string[][] = []

  for (let i = 0; i < paths.length; i += STORAGE_DELETE_BATCH_SIZE) {
    batches.push(paths.slice(i, i + STORAGE_DELETE_BATCH_SIZE))
  }

  return batches
}

export async function registerAccountRoutes(app: FastifyInstance) {
  app.post('/api/account/delete', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await getAuthenticatedUserId(request)

    if (!userId) {
      return reply.code(401).send({ error: 'Non authentifie.' })
    }

    const admin = createAdminClient()

    const { data: uploads, error: uploadsError } = await admin
      .from('uploads')
      .select('storage_path')
      .eq('user_id', userId)

    if (uploadsError) {
      app.log.error({ err: uploadsError }, 'Account deletion upload lookup error')
      return reply.code(500).send({ error: 'Impossible de recuperer les fichiers du compte.' })
    }

    const storagePaths = (uploads ?? [])
      .map((upload) => upload.storage_path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0)

    try {
      for (const batch of chunkPaths(storagePaths)) {
        const { error: storageError } = await admin.storage.from(config.storageBucket).remove(batch)
        if (storageError) {
          throw storageError
        }
      }
    } catch (error) {
      app.log.error({ err: error }, 'Account deletion storage cleanup error')
      return reply.code(500).send({ error: 'Impossible de supprimer les fichiers du compte.' })
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)

    if (deleteUserError) {
      app.log.error({ err: deleteUserError }, 'Account deletion auth error')
      return reply.code(500).send({ error: 'Impossible de supprimer le compte.' })
    }

    return reply.send({ success: true })
  })
}
