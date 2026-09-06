import type { Prisma } from '@prisma/client'
import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// PATCH /api/admin/account - 更新管理员账号/密码
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await readJsonBody(request)
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newEmail = String(body.newEmail || '').trim()
    const newPassword = String(body.newPassword || '')
    const confirmPassword = String(body.confirmPassword || '')

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    if (!newEmail && !newPassword) {
      return NextResponse.json({ error: '请至少修改邮箱或密码' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user || !user.password) {
      return NextResponse.json({ error: '无法验证当前密码' }, { status: 400 })
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      return NextResponse.json({ error: '当前密码不正确' }, { status: 400 })
    }

    const data: Prisma.UserUpdateInput = {}

    if (newEmail && newEmail !== user.email) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
      if (!emailOk) {
        return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
      }
      const existing = await prisma.user.findUnique({ where: { email: newEmail } })
      if (existing && existing.id !== user.id) {
        return NextResponse.json({ error: '邮箱已被占用' }, { status: 400 })
      }
      data.email = newEmail
    }

    if (newPassword) {
      if (newPassword.length < 12 || Buffer.byteLength(newPassword) > 72) {
        return NextResponse.json({ error: '新密码至少 12 位且不能超过 72 字节' }, { status: 400 })
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json({ error: '两次输入的新密码不一致' }, { status: 400 })
      }
      data.password = await bcrypt.hash(newPassword, 10)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '没有需要更新的内容' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { ...data, sessionVersion: { increment: 1 } },
      select: { id: true, email: true, name: true },
    })

    await prisma.setting.upsert({
      where: { key: 'admin.initialSetup' },
      update: { value: { enabled: false }, group: 'admin', editable: true },
      create: { key: 'admin.initialSetup', value: { enabled: false }, group: 'admin', editable: true },
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('更新管理员账号失败:', error)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
