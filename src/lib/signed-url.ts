import jwt from 'jsonwebtoken'
import { config } from './config.js'

const DEFAULT_TTL_SECONDS = 3600

interface FileTokenPayload {
  path: string
}

// Emule les URLs signees de Supabase Storage : un token courte duree encode le
// chemin, verifiable sans header Authorization (necessaire pour <img src>/<Image>).
export function createSignedDownloadToken(storagePath: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  return jwt.sign({ path: storagePath } satisfies FileTokenPayload, config.fileTokenSecret, {
    expiresIn: ttlSeconds,
  })
}

export function verifySignedDownloadToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.fileTokenSecret)

    if (typeof decoded === 'object' && decoded !== null && typeof decoded.path === 'string') {
      return decoded.path
    }

    return null
  } catch {
    return null
  }
}

export function buildSignedFileUrl(storagePath: string, ttlSeconds?: number): string {
  const token = createSignedDownloadToken(storagePath, ttlSeconds)
  return new URL(`/api/files/${token}`, config.apiUrl).toString()
}
