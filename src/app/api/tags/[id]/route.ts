import { Prisma } from '@prisma/client'
import { validateTaxonomyInput } from '@/lib/taxonomy-input'
import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { revalidatePublicTaxonomyPaths } from '@/lib/post-revalidate'

// PATCH /api/tags/[id] - 更新标签
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    const { id } = await params
    const body = await readJsonBody(req)
    validateTaxonomyInput(body, true)
    const { name, slug } = body

    // 检查标签是否存在
    const existingTag = await prisma.tag.findUnique({
      where: { id },
    })

    if (!existingTag) {
      return NextResponse.json({ error: '标签不存在' }, { status: 404 })
    }

    // 如果修改了 slug,检查新 slug 是否已存在
    if (slug && slug !== existingTag.slug) {
      const slugExists = await prisma.tag.findUnique({
        where: { slug },
      })

      if (slugExists) {
        return NextResponse.json(
          { error: '标签 slug 已存在' },
          { status: 400 }
        )
      }
    }

    // 更新标签
    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
      },
    })

    revalidatePublicTaxonomyPaths({
      tagSlugs: [existingTag.slug, tag.slug],
    })

    return NextResponse.json({ tag })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '名称或 Slug 已存在' }, { status: 409 })
    }
    console.error('更新标签失败:', error)
    return NextResponse.json({ error: '更新标签失败' }, { status: 500 })
  }
}

// DELETE /api/tags/[id] - 删除标签
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    const { id } = await params

    // 检查标签是否存在
    const existingTag = await prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
      },
    })

    if (!existingTag) {
      return NextResponse.json({ error: '标签不存在' }, { status: 404 })
    }

    // 删除标签(即使有关联文章也可以删除,Prisma 会自动解除关联)
    await prisma.tag.delete({
      where: { id },
    })

    revalidatePublicTaxonomyPaths({
      tagSlugs: [existingTag.slug],
    })

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('删除标签失败:', error)
    return NextResponse.json({ error: '删除标签失败' }, { status: 500 })
  }
}
