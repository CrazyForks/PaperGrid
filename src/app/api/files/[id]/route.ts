import { getMediaAccess } from '@/lib/media-access'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveMediaPath } from '@/lib/media'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import {
  getCachedMediaResolvedFile,
  removeCachedMediaResolvedFile,
  setCachedMediaResolvedFile,
  type MediaResolvedFile,
} from '@/lib/media-file-cache'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { Readable } from 'node:stream'

export const runtime = 'nodejs'

const GET_LIMIT = {
  windowMs: 60 * 1000,
  max: 240,
}

const HEAD_LIMIT = {
  windowMs: 60 * 1000,
  max: 600,
}

function buildHeaders(file: {
  mimeType: string
  size: number
  sha256: string | null
  createdAt: Date
}, access: 'public' | 'private') {
  const headers = new Headers()
  headers.set('Content-Type', file.mimeType)
  if (!file.mimeType.startsWith('image/')) headers.set('Content-Disposition', 'attachment')
  headers.set('Content-Length', String(file.size))
  // Public media can be retained only by the browser and must pass authorization
  // again before reuse. Protected media never enters the HTTP cache.
  headers.set('Cache-Control', access === 'public' ? 'private, no-cache, must-revalidate' : 'private, no-store')
  headers.set('Vary', 'Cookie, Authorization')
  headers.set('Last-Modified', file.createdAt.toUTCString())
  headers.set('X-Content-Type-Options', 'nosniff')

  if (file.sha256) {
    headers.set('ETag', `"${file.sha256}"`)
  }

  return headers
}

async function resolveFile(id: string): Promise<MediaResolvedFile | null> {
  const cached = getCachedMediaResolvedFile(id)
  if (cached) {
    try {
      await access(cached.absolutePath, constants.R_OK)
      return cached
    } catch {
      removeCachedMediaResolvedFile(id)
    }
  }

  const record = await prisma.mediaFile.findUnique({
    where: { id },
    select: {
      storagePath: true,
      mimeType: true,
      size: true,
      sha256: true,
      createdAt: true,
    },
  })

  if (!record) {
    return null
  }

  const absolutePath = resolveMediaPath(record.storagePath)
  await access(absolutePath, constants.R_OK)

  const resolved = {
    ...record,
    absolutePath,
  }

  setCachedMediaResolvedFile(id, resolved)
  return resolved
}

function createLimitedResponse(request: Request) {
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET'
  const ip = getClientIp(request)
  const limiter = rateLimit(`media:${method}:${ip}`, method === 'HEAD' ? HEAD_LIMIT : GET_LIMIT)

  if (limiter.ok) {
    return null
  }

  const headers = { ...rateLimitHeaders(limiter), 'Cache-Control': 'private, no-store' }
  if (method === 'HEAD') {
    return new NextResponse(null, { status: 429, headers })
  }

  return new NextResponse(JSON.stringify({ error: '请求过于频繁，请稍后重试' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}

export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const limitedResponse = createLimitedResponse(request)
    if (limitedResponse) return limitedResponse

    const access = id.length <= 64 ? await getMediaAccess(request, id) : null
    if (!access) {
      return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    }
    const file = await resolveFile(id)

    if (!file) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    }

    const headers = buildHeaders(file, access)
    const requestEtag = request.headers.get('if-none-match')
    if (requestEtag && headers.get('ETag') === requestEtag) {
      return new NextResponse(null, { status: 304, headers })
    }

    return new NextResponse(null, { status: 200, headers })
  } catch (error) {
    console.error('读取文件头失败:', error)
    return NextResponse.json({ error: '文件读取失败' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const limitedResponse = createLimitedResponse(request)
    if (limitedResponse) return limitedResponse

    const access = id.length <= 64 ? await getMediaAccess(request, id) : null
    if (!access) {
      return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    }
    const file = await resolveFile(id)

    if (!file) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    }

    const headers = buildHeaders(file, access)
    const requestEtag = request.headers.get('if-none-match')
    if (requestEtag && headers.get('ETag') === requestEtag) {
      return new NextResponse(null, { status: 304, headers })
    }

    const stream = createReadStream(file.absolutePath)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('读取文件失败:', error)
    return NextResponse.json({ error: '文件读取失败' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
