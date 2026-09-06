import { pageNumber } from '@/lib/pagination'
import { RequestBodyError, bodyErrorResponse } from '@/lib/request-body'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createRequestLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { MEDIA_MAX_UPLOAD_BYTES } from '@/lib/media'
import { handleMediaUpload, toFilePayload } from '@/lib/media-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const logger = createRequestLogger(request, { module: 'admin-files', action: 'list' })
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = pageNumber(searchParams.get('page'))
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '24', 10) || 24))
    const q = (searchParams.get('q') || '').trim()

    const imageOnly = searchParams.get('kind') === 'images'
    const where = q
      ? {
          ...(imageOnly ? { mimeType: { startsWith: 'image/' } } : {}),
          OR: [
            { originalName: { contains: q } },
            { ext: { contains: q } },
          ],
        }
      : (imageOnly ? { mimeType: { startsWith: 'image/' } } : {})

    const [total, files] = await Promise.all([
      prisma.mediaFile.count({ where }),
      prisma.mediaFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
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
      }),
    ])

    return NextResponse.json({
      files: files.map((file) => toFilePayload(file)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      limits: {
        maxUploadBytes: MEDIA_MAX_UPLOAD_BYTES,
      },
    })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    logger.error({ err: error }, '获取文件列表失败')
    return NextResponse.json({ error: '获取文件列表失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  return handleMediaUpload(request, { userId: session.user.id })
}
