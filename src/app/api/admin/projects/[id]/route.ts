import type { Prisma } from '@prisma/client'
import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/admin/projects/[id] - 更新作品
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

    const data: Prisma.ProjectUpdateInput = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 })
      }
      data.name = name
    }

    if (typeof body.url === 'string') {
      const url = body.url.trim()
      if (!url) {
        return NextResponse.json({ error: '项目链接不能为空' }, { status: 400 })
      }
      data.url = url
    }

    if (typeof body.description === 'string') {
      const description = body.description.trim()
      data.description = description || null
    }

    if (typeof body.image === 'string') {
      const image = body.image.trim()
      data.image = image || null
    }

    const project = await prisma.project.update({
      where: { id },
      data,
    })

    return NextResponse.json({ project })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('更新作品失败:', error)
    return NextResponse.json({ error: '更新作品失败' }, { status: 500 })
  }
}

// DELETE /api/admin/projects/[id] - 删除作品
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

    await prisma.project.delete({ where: { id } })

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('删除作品失败:', error)
    return NextResponse.json({ error: '删除作品失败' }, { status: 500 })
  }
}
