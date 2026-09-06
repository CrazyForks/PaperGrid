import { pageNumber, pageSize } from '@/lib/pagination'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

// GET /api/admin/users - 获取所有用户
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
    const search = searchParams.get('search')
    const role = searchParams.get('role')
    const safePage = Number.isFinite(page) && page > 0 ? page : 1
    const skip = (safePage - 1) * limit

    if (role && !Object.values(Role).includes(role.toUpperCase() as Role)) return NextResponse.json({ error: '无效的用户角色' }, { status: 400 })
    const where = {
      ...(search && {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
        ],
      }),
      ...(role && { role: role.toUpperCase() as Role }),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              posts: true,
              comments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      users,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('获取用户列表失败:', error)
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 })
  }
}
