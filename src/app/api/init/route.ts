import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

// Optional bootstrap endpoint; never creates a second administrator.
export async function POST(request: NextRequest) {
  const limit = rateLimit(`init:${getClientIp(request)}`, { windowMs: 300000, max: 5 })
  if (!limit.ok) return NextResponse.json({ error: '请稍后重试' }, { status: 429 })
  const expected = process.env.INIT_ADMIN_TOKEN || ''
  const provided = request.headers.get('x-init-token') || ''
  const password = process.env.ADMIN_INIT_PASSWORD || ''
  if (expected.length < 32 || password.length < 12 || Buffer.byteLength(password) > 72) {
    return NextResponse.json({ error: '初始化接口已禁用' }, { status: 403 })
  }
  const a = Buffer.from(expected), b = Buffer.from(provided)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const hash = await bcrypt.hash(password, 12)
    const admin = await prisma.$transaction(async (tx) => {
      if (await tx.user.findFirst({ where: { role: 'ADMIN' } }) ||
          await tx.setting.findUnique({ where: { key: 'admin.init.used' } })) return null
      const created = await tx.user.create({ data: {
        email: process.env.ADMIN_INIT_EMAIL || 'admin@example.com', name: 'Admin', password: hash, role: 'ADMIN',
      }, select: { id: true, email: true } })
      await tx.setting.create({ data: { key: 'admin.init.used', value: { used: true }, group: 'admin', editable: false } })
      return created
    })
    if (!admin) return NextResponse.json({ error: '站点已经初始化' }, { status: 409 })
    return NextResponse.json({ success: true, data: admin }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '初始化失败' }, { status: 500 })
  }
}
