import path from 'path'
import type { FileType } from '@prisma/client'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../plugins/authenticate.js'
import { prisma } from '../lib/prisma.js'
import { buildSignedFileUrl } from '../lib/signed-url.js'
import { buildStoragePath, deleteFile, saveFile } from '../lib/storage.js'

const VALID_FILE_TYPES: FileType[] = ['image', 'audio', 'pdf', 'screenshot', 'other']

function isValidFileType(value: string): value is FileType {
  return (VALID_FILE_TYPES as string[]).includes(value)
}

export async function registerUploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userId as string

    let fileBuffer: Buffer | null = null
    let originalFilename = ''
    let mimeType = 'application/octet-stream'
    const fields: Record<string, string> = {}

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
        originalFilename = part.filename
        mimeType = part.mimetype || mimeType
      } else {
        fields[part.fieldname] = String(part.value)
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({ error: 'Aucun fichier recu.' })
    }

    const grudgeId = fields.grudge_id
    const fileType = fields.file_type

    if (!grudgeId || !fileType || !isValidFileType(fileType)) {
      return reply.code(400).send({ error: 'grudge_id et file_type (image/audio/pdf/screenshot/other) sont requis.' })
    }

    const grudge = await prisma.grudge.findFirst({ where: { id: grudgeId, userId } })

    if (!grudge) {
      return reply.code(404).send({ error: 'Rancune introuvable.' })
    }

    const extension = path.extname(originalFilename).replace('.', '') || 'bin'
    const storagePath = buildStoragePath(userId, grudgeId, extension)

    // Le fichier est ecrit AVANT la ligne DB : si l'insert echoue, on supprime le
    // fichier orphelin en compensation (pas de transaction possible entre disque et DB).
    await saveFile(storagePath, fileBuffer)

    try {
      const upload = await prisma.upload.create({
        data: {
          userId,
          grudgeId,
          fileName: fields.file_name || originalFilename || 'fichier',
          fileType,
          fileSize: fileBuffer.byteLength,
          storagePath,
          mimeType,
        },
      })

      return reply.send({
        id: upload.id,
        grudge_id: upload.grudgeId,
        file_name: upload.fileName,
        file_type: upload.fileType,
        file_size: upload.fileSize,
        mime_type: upload.mimeType,
        created_at: upload.createdAt,
        signed_url: buildSignedFileUrl(storagePath),
      })
    } catch (error) {
      await deleteFile(storagePath).catch(() => null)
      app.log.error({ err: error }, 'Upload insert error')
      return reply.code(500).send({ error: 'Enregistrement du fichier impossible.' })
    }
  })

  app.get<{ Params: { id: string } }>('/api/uploads/:id/signed-url', { preHandler: authenticate }, async (request, reply) => {
    const upload = await prisma.upload.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!upload) {
      return reply.code(404).send({ error: 'Fichier introuvable.' })
    }

    return reply.send({ url: buildSignedFileUrl(upload.storagePath) })
  })

  app.delete<{ Params: { id: string } }>('/api/uploads/:id', { preHandler: authenticate }, async (request, reply) => {
    const upload = await prisma.upload.findFirst({
      where: { id: request.params.id, userId: request.userId as string },
    })

    if (!upload) {
      return reply.code(404).send({ error: 'Fichier introuvable.' })
    }

    await deleteFile(upload.storagePath)
    await prisma.upload.delete({ where: { id: upload.id } })

    return reply.send({ success: true })
  })
}
