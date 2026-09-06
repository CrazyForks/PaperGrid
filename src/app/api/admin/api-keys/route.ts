import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { ApiKeyPermission } from '@/lib/api-keys'
import { API_KEY_PERMISSION_LIST, generateApiKey, hashApiKey } from '@/lib/api-keys'

function normalizePermissions(input: unknown) {
  const allowed = new Set(API_KEY_PERMISSION_LIST)
  if (!Array.isArray(input)) return []
  return input.filter((p) => typeof p === 'string' && allowed.has(p as ApiKeyPermission)) as ApiKeyPermission[]
}

function normalizeExpiresAt(input: unknown): Date | null | undefined {
  if (input === undefined) return undefined
  if (input === null || input === '') return null
  if (typeof input !== 'string') return undefined
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

// GET /api/admin/api-keys - 获取 API Key 列表
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const apiKeys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdById: true,
        permissions: true,
        enabled: true,
        lastUsedAt: true,
        lastUsedIp: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ apiKeys })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('获取 API Key 失败:', error)
    return NextResponse.json({ error: '获取 API Key 失败' }, { status: 500 })
  }
}

// POST /api/admin/api-keys - 创建 API Key
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await readJsonBody(request)
    const name = typeof body.name === 'string' && body.name.trim().length > 0
      ? body.name.trim()
      : `API Key ${new Date().toISOString()}`
    const permissions = normalizePermissions(body.permissions)
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true
    const expiresAt = normalizeExpiresAt(body.expiresAt)

    if (body.expiresAt !== undefined && expiresAt === undefined) {
      return NextResponse.json({ error: 'expiresAt 格式错误' }, { status: 400 })
    }

    if (expiresAt && expiresAt <= new Date()) {
      return NextResponse.json({ error: 'expiresAt 必须是未来时间' }, { status: 400 })
    }

    const rawKey = generateApiKey()
    const keyHash = hashApiKey(rawKey)
    const keyPrefix = rawKey.slice(0, 8)

    const apiKey = await prisma.$transaction(async tx => {
      const creator = await tx.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
      if (creator?.role !== 'ADMIN') throw new RequestBodyError('未授权', 401)
      return tx.apiKey.create({
        data: {
          name,
          keyHash,
          keyPrefix,
          createdById: session.user.id,
          permissions: permissions.length > 0 ? permissions : ['POST_READ'],
          enabled,
          expiresAt: expiresAt ?? null,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          createdById: true,
          permissions: true,
          enabled: true,
          lastUsedAt: true,
          lastUsedIp: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    })

    return NextResponse.json({ apiKey, plainKey: rawKey }, { status: 201 })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('创建 API Key 失败:', error)
    return NextResponse.json({ error: '创建 API Key 失败' }, { status: 500 })
  }
}
