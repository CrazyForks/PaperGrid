import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/admin/users/[id] - 更新用户角色
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
    const { role } = body

    if (!role || !['USER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: '无效的角色值' }, { status: 400 })
    }

    // 不允许修改自己的角色
    if (id === session.user.id) {
      return NextResponse.json({ error: '不能修改自己的角色' }, { status: 400 })
    }

    const user = await prisma.$transaction(async tx => {
      const current = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true } })
      const updated = await tx.user.update({
        where: { id },
        data: { role, ...(current.role !== role && { sessionVersion: { increment: 1 } }) },
        select: { id: true, name: true, email: true, role: true },
      })
      if (role !== 'ADMIN') {
        await tx.apiKey.updateMany({ where: { createdById: id }, data: { enabled: false } })
      }
      return updated
    })

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('更新用户失败:', error)
    return NextResponse.json({ error: '更新用户失败' }, { status: 500 })
  }
}

// DELETE /api/admin/users/[id] - 删除用户
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

    // 不允许删除自己
    if (id === session.user.id) {
      return NextResponse.json({ error: '不能删除自己的账号' }, { status: 400 })
    }

    await prisma.$transaction(async tx => {
      if (await tx.post.count({ where: { authorId: id } })) throw new RequestBodyError('此用户仍有文章，请先转移文章归属', 409)
      await tx.apiKey.updateMany({ where: { createdById: id }, data: { enabled: false } })
      await tx.user.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('删除用户失败:', error)
    return NextResponse.json({ error: '删除用户失败' }, { status: 500 })
  }
}
