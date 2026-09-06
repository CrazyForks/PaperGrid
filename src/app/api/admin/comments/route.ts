import { pageNumber, pageSize } from '@/lib/pagination'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CommentStatus } from '@prisma/client'

// GET /api/admin/comments - 获取所有评论（分页）
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = pageNumber(searchParams.get('page'))
    const rawLimit = parseInt(searchParams.get('limit') || '20')
    const limit = Math.min(pageSize(rawLimit), 50)
    const status = searchParams.get('status')
    const safePage = Number.isFinite(page) && page > 0 ? page : 1
    const skip = (safePage - 1) * limit

    if (status && !Object.values(CommentStatus).includes(status.toUpperCase() as CommentStatus)) return NextResponse.json({ error: '无效的评论状态' }, { status: 400 })
    const where = status ? { status: status.toUpperCase() as CommentStatus } : {}

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          post: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.comment.count({ where }),
    ])

    return NextResponse.json({
      comments,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('获取评论列表失败:', error)
    return NextResponse.json({ error: '获取评论列表失败' }, { status: 500 })
  }
}
