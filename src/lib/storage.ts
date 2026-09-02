import { randomBytes } from 'crypto'
import { mkdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { config } from './config.js'

// Convention identique a l'ancien bucket Supabase Storage : {userId}/{grudgeId}/{fichier}
export function buildStoragePath(userId: string, grudgeId: string, extension: string): string {
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'bin'
  const fileName = `${Date.now()}_${randomBytes(8).toString('hex')}.${safeExtension}`
  return `${userId}/${grudgeId}/${fileName}`
}

// Resout un storage_path (venant de la DB, jamais de l'utilisateur directement) en
// chemin absolu, en verifiant qu'il reste bien sous STORAGE_ROOT - anti path-traversal,
// important car la route de lecture (`GET /api/files/:token`) est publique.
export function resolveStoragePath(storagePath: string): string {
  const resolved = path.resolve(config.storageRoot, storagePath)

  if (resolved !== config.storageRoot && !resolved.startsWith(config.storageRoot + path.sep)) {
    throw new Error('Chemin de stockage invalide.')
  }

  return resolved
}

export async function saveFile(storagePath: string, data: Buffer): Promise<void> {
  const absolutePath = resolveStoragePath(storagePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, data)
}

export async function deleteFile(storagePath: string): Promise<void> {
  const absolutePath = resolveStoragePath(storagePath)
  await rm(absolutePath, { force: true })
}
