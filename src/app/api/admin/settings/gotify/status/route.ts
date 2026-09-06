import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/settings/gotify/status - 检查是否存在 token（env 或 DB）
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const envToken = process.env.GOTIFY_TOKEN
    if (envToken) {
      return NextResponse.json({ hasToken: true })
    }

    const tokenSetting = await prisma.setting.findUnique({ where: { key: 'notifications.gotify.token' } })
    const tokenVal = tokenSetting?.value
    const hasToken = Boolean(tokenVal && typeof tokenVal === 'object' && !Array.isArray(tokenVal) && 'token' in tokenVal && tokenVal.token)

    return NextResponse.json({ hasToken })
  } catch (error) {
    console.error('检查 Gotify token 状态失败:', error)
    return NextResponse.json({ error: '检查失败' }, { status: 500 })
  }
}
