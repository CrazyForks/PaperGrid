import { revalidateForUpdatedSettings } from '@/lib/settings-revalidate'
import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/settings/gotify-token - 单独设置/更新 Gotify token (secret)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await readJsonBody(request)
    const token = body.token
    if (!token) {
      return NextResponse.json({ error: '缺少 token' }, { status: 400 })
    }

    // 使用 upsert 保证存在
    await prisma.setting.upsert({
      where: { key: 'notifications.gotify.token' },
      create: { key: 'notifications.gotify.token', value: { token }, group: 'notifications', secret: true, editable: false },
      update: { value: { token }, secret: true, editable: false },
    })

    revalidateForUpdatedSettings(['gotify.token'])
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('设置 Gotify token 失败:', error)
    return NextResponse.json({ error: '设置失败' }, { status: 500 })
  }
}
