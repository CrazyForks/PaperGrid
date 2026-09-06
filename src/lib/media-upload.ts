import { tryAcquireJob } from './concurrency'
import { RequestBodyError, bodyErrorResponse, readFormBody } from './request-body'
import { NextResponse } from 'next/server'
import { createRequestLogger } from './logger'
import { prisma } from './prisma'
import { getClientIp, rateLimit, rateLimitHeaders } from './rate-limit'
import { ALLOWED_IMAGE_TYPES, MEDIA_MAX_INPUT_PIXELS, MEDIA_MAX_UPLOAD_BYTES, ensureMediaDir, getStoragePath, mediaUrlById, parseCompressionMode, sha256Hex } from './media'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import type { MediaCompressionMode } from '@prisma/client'
import { unlink, writeFile } from 'node:fs/promises'

sharp.cache({ memory: 8, files: 0, items: 16 })
sharp.concurrency(1)

type CompressionOutput = {
  content: Buffer
  ext: string
  mimeType: string
  width: number | null
  height: number | null
}

class UploadValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function buildImagePipeline(input: Buffer, mode: MediaCompressionMode, ext: string) {
  const pipeline = sharp(input, {
    failOn: 'error',
    limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
  }).rotate()

  if (ext === 'jpg') {
    return pipeline.jpeg({ quality: mode === 'HIGH' ? 68 : 82, mozjpeg: true })
  }

  if (ext === 'png') {
    return pipeline.png({
      compressionLevel: 9,
      palette: true,
      quality: mode === 'HIGH' ? 70 : 85,
      effort: mode === 'HIGH' ? 10 : 8,
    })
  }

  if (ext === 'avif') {
    return pipeline.avif({
      quality: mode === 'HIGH' ? 45 : 58,
      effort: mode === 'HIGH' ? 6 : 4,
    })
  }

  return pipeline.webp({ quality: mode === 'HIGH' ? 65 : 78, effort: mode === 'HIGH' ? 6 : 4 })
}

async function processImageUpload(input: Buffer, mode: MediaCompressionMode, imagesOnly: boolean): Promise<CompressionOutput> {
  const type = await fileTypeFromBuffer(input)

  if (!imagesOnly && type && ['application/pdf', 'application/zip'].includes(type.mime)) {
    return { content: input, ext: type.ext, mimeType: type.mime, width: null, height: null }
  }
  if (!type || !ALLOWED_IMAGE_TYPES.has(type.mime)) {
    throw new UploadValidationError(imagesOnly ? '只支持 JPG、PNG、WebP、AVIF 图片' : '只支持 JPG、PNG、WebP、AVIF 图片和 PDF、ZIP 附件')
  }

  const targetExt = ALLOWED_IMAGE_TYPES.get(type.mime) || 'jpg'
  const metadata = await sharp(input, {
    failOn: 'error',
    limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
  }).metadata()

  if (metadata.pages && metadata.pages > 1) {
    throw new UploadValidationError('暂不支持动图上传')
  }

  if (mode === 'ORIGINAL') {
    return {
      content: input,
      ext: targetExt,
      mimeType: type.mime,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    }
  }

  const transformed = buildImagePipeline(input, mode, targetExt)
  const { data, info } = await transformed.toBuffer({ resolveWithObject: true })

  return {
    content: data,
    ext: targetExt,
    mimeType: type.mime,
    width: info.width ?? metadata.width ?? null,
    height: info.height ?? metadata.height ?? null,
  }
}

export function toFilePayload(file: {
  id: string
  originalName: string
  mimeType: string
  ext: string
  size: number
  width: number | null
  height: number | null
  compressionMode: MediaCompressionMode
  createdAt: Date
  uploadedBy: { id: string; name: string | null; email: string | null } | null
}) {
  return {
    ...file,
    url: mediaUrlById(file.id),
  }
}

export async function handleMediaUpload(request: Request, options: { userId: string; apiKeyId?: string; imagesOnly?: boolean; defaultPrivate?: boolean }) {
  let release: (() => void) | null = null
  let logger = createRequestLogger(request, { module: 'admin-files', action: 'upload' })
  try {
    logger = logger.child({ userId: options.userId, apiKeyId: options.apiKeyId })

    const clientIp = getClientIp(request)
    const limiter = rateLimit(`upload:${options.userId}:${clientIp}`, {
      windowMs: 60 * 1000,
      max: 20,
    })

    if (!limiter.ok) {
      const headers = rateLimitHeaders(limiter)
      return new NextResponse(JSON.stringify({ error: '上传过于频繁，请稍后重试' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...headers,
        },
      })
    }

    release = tryAcquireJob('image-upload')
    if (!release) return NextResponse.json({ error: '正在处理图片，请稍后重试' }, { status: 503, headers: { 'Retry-After': '2' } })
    const formData = await readFormBody(request, MEDIA_MAX_UPLOAD_BYTES + 1024 * 1024)
    const file = formData.get('file')
    const mode = parseCompressionMode(formData.get('compressionMode'))

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择图片文件' }, { status: 400 })
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: '文件为空' }, { status: 400 })
    }

    if (file.size > MEDIA_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `文件超过 ${MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024}MB 限制` }, { status: 400 })
    }

    const input = Buffer.from(await file.arrayBuffer())

    if (input.length > MEDIA_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `文件超过 ${MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024}MB 限制` }, { status: 400 })
    }

    const visibility = formData.get('visibility')
    if (visibility !== null && visibility !== 'private' && visibility !== 'public') {
      throw new UploadValidationError('visibility 只能是 private 或 public')
    }
    let processed: CompressionOutput
    try {
      processed = await processImageUpload(input, mode, options.imagesOnly === true)
    } catch (error) {
      if (error instanceof UploadValidationError) throw error
      throw new UploadValidationError('图片无法解码或尺寸超过限制')
    }
    const storagePath = getStoragePath(processed.ext)
    const absolutePath = await ensureMediaDir(storagePath)

    await writeFile(absolutePath, processed.content, { flag: 'wx' })

    let record
    try {
      record = await prisma.mediaFile.create({
        data: {
          private: visibility === 'private' || (visibility === null && options.defaultPrivate === true),
          uploadedByApiKeyId: options.apiKeyId ?? null,
          originalName: file.name || 'image',
          storagePath,
          mimeType: processed.mimeType,
          ext: processed.ext,
          size: processed.content.length,
          width: processed.width,
          height: processed.height,
          sha256: sha256Hex(processed.content),
          compressionMode: mode,
          uploadedById: options.userId,
        },
        select: {
          id: true,
          private: true,
          originalName: true,
          mimeType: true,
          ext: true,
          size: true,
          width: true,
          height: true,
          compressionMode: true,
          createdAt: true,
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })
    } catch (dbError) {
      try {
        await unlink(absolutePath)
      } catch (cleanupError) {
        const nodeError = cleanupError as NodeJS.ErrnoException
        if (nodeError.code !== 'ENOENT') {
          logger.error({ err: cleanupError }, '回滚上传文件失败')
        }
      }

      throw dbError
    }

    return NextResponse.json({ file: toFilePayload(record) }, { status: 201 })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    logger.error({ err: error }, '上传文件失败')

    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code === 'EEXIST') {
      return NextResponse.json({ error: '文件名冲突，请重试上传' }, { status: 409 })
    }

    return NextResponse.json({ error: '上传文件失败' }, { status: 500 })
  } finally { release?.() }
}
