import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { ApiKeyPermission } from '@/lib/api-keys'
import { API_KEY_PERMISSION_LIST } from '@/lib/api-keys'

function normalizePermissions(input: unknown) {
  const allowed = new Set(API_KEY_PERMISSION_LIST)
  if (!Array.isArray(input)) return null
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

// PATCH /api/admin/api-keys/[id] - 更新 API Key
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params
    const body = await readJsonBody(request)

    const data: Prisma.ApiKeyUpdateInput = {}

    if (typeof body.name === 'string') {
      data.name = body.name.trim()
    }

    if (typeof body.enabled === 'boolean') {
      data.enabled = body.enabled
    }

    const normalizedPermissions = normalizePermissions(body.permissions)
    if (normalizedPermissions) {
      data.permissions = normalizedPermissions
    }

    const expiresAt = normalizeExpiresAt(body.expiresAt)
    if (body.expiresAt !== undefined && expiresAt === undefined) {
      return NextResponse.json({ error: 'expiresAt 格式错误' }, { status: 400 })
    }

    if (expiresAt && expiresAt <= new Date()) {
      return NextResponse.json({ error: 'expiresAt 必须是未来时间' }, { status: 400 })
    }

    if (expiresAt !== undefined) {
      data.expiresAt = expiresAt
    }

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data,
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

    return NextResponse.json({ apiKey })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('更新 API Key 失败:', error)
    return NextResponse.json({ error: '更新 API Key 失败' }, { status: 500 })
  }
}

// DELETE /api/admin/api-keys/[id] - 删除 API Key
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params

    await prisma.apiKey.delete({ where: { id } })

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('删除 API Key 失败:', error)
    return NextResponse.json({ error: '删除 API Key 失败' }, { status: 500 })
  }
}
