import { Prisma } from '@prisma/client'
import { validateTaxonomyInput } from '@/lib/taxonomy-input'
import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { revalidatePublicTaxonomyPaths } from '@/lib/post-revalidate'
import { getPublicCategories } from '@/lib/public-categories'
import { prisma } from '@/lib/prisma'

// GET /api/categories - 获取分类列表
export async function GET() {
  try {
    const categories = await getPublicCategories()

    return NextResponse.json({ categories })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('获取分类失败:', error)
    return NextResponse.json({ error: '获取分类失败' }, { status: 500 })
  }
}

// POST /api/categories - 创建分类
export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    const body = await readJsonBody(req)
    validateTaxonomyInput(body, false)
    const { name, slug, description } = body

    if (!name || !slug) {
      return NextResponse.json(
        { error: '名称和 slug 不能为空' },
        { status: 400 }
      )
    }

    // 检查 slug 是否已存在
    const existingCategory = await prisma.category.findUnique({
      where: { slug },
    })

    if (existingCategory) {
      return NextResponse.json(
        { error: '分类 slug 已存在' },
        { status: 400 }
      )
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
      },
    })

    revalidatePublicTaxonomyPaths({
      categorySlugs: [category.slug],
    })

    return NextResponse.json({ category }, { status: 201 })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '名称或 Slug 已存在' }, { status: 409 })
    }
    console.error('创建分类失败:', error)
    return NextResponse.json({ error: '创建分类失败' }, { status: 500 })
  }
}
