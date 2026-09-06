import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/projects - 获取作品列表
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ projects })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('获取作品失败:', error)
    return NextResponse.json({ error: '获取作品失败' }, { status: 500 })
  }
}

// POST /api/admin/projects - 创建作品
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await readJsonBody(request)
    const name = String(body.name || '').trim()
    const url = String(body.url || '').trim()
    const description = String(body.description || '').trim()
    const image = String(body.image || '').trim()

    if (!name) {
      return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 })
    }
    if (!url) {
      return NextResponse.json({ error: '项目链接不能为空' }, { status: 400 })
    }

    const project = await prisma.project.create({
      data: {
        name,
        url,
        description: description || null,
        image: image || null,
      },
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('创建作品失败:', error)
    return NextResponse.json({ error: '创建作品失败' }, { status: 500 })
  }
}
