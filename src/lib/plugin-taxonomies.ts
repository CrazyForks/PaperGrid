import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { requireApiKey, type ApiKeyPermission } from './api-keys'
import { prisma } from './prisma'
import { pageNumber, pageSize } from './pagination'
import { readJsonBody, RequestBodyError, bodyErrorResponse } from './request-body'
import { generateTaxonomySlug } from './slug'
import { validateTaxonomyInput } from './taxonomy-input'
import { revalidatePublicTaxonomyPaths } from './post-revalidate'

type Kind = 'categories' | 'tags'
type Context = { params: Promise<{ id: string }> }

export function pluginTaxonomyRoutes(kind: Kind) {
  const category = kind === 'categories'
  const singular = category ? 'category' : 'tag'
  const prefix = category ? 'CATEGORY' : 'TAG'
  const revalidate = (slugs: string[]) => revalidatePublicTaxonomyPaths(category ? { categorySlugs: slugs } : { tagSlugs: slugs })

  async function handle(request: Request, action: 'READ' | 'CREATE' | 'UPDATE' | 'DELETE', context?: Context) {
    const auth = await requireApiKey(request, `${prefix}_${action}` as ApiKeyPermission)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: auth.headers })
    const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: auth.headers })
    try {
      const id = context ? (await context.params).id : undefined
      if (action === 'READ') {
        if (id) {
          const entity = category
            ? await prisma.category.findUnique({ where: { id }, include: { _count: { select: { posts: true } } } })
            : await prisma.tag.findUnique({ where: { id }, include: { _count: { select: { posts: true } } } })
          return entity ? respond({ [singular]: entity }) : respond({ error: '记录不存在' }, 404)
        }
        const params = new URL(request.url).searchParams
        const page = pageNumber(params.get('page'))
        const limit = Math.min(100, pageSize(params.get('limit'), 50))
        const search = params.get('search')?.trim()
        const slug = params.get('slug')
        const where = { ...(search ? { name: { contains: search } } : {}), ...(slug ? { slug } : {}) }
        const options = { where, skip: (page - 1) * limit, take: limit, orderBy: { name: 'asc' as const }, include: { _count: { select: { posts: true as const } } } }
        const [items, total] = category
          ? await Promise.all([prisma.category.findMany(options), prisma.category.count({ where })])
          : await Promise.all([prisma.tag.findMany(options), prisma.tag.count({ where })])
        return respond({ [kind]: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } })
      }
      if (action === 'DELETE') {
        const deleted = await prisma.$transaction(async tx => {
          const entity = category
            ? await tx.category.findUnique({ where: { id: id! } })
            : await tx.tag.findUnique({ where: { id: id! } })
          if (!entity) throw new RequestBodyError('记录不存在', 404)
          if (category) {
            if (await tx.post.count({ where: { categoryId: id } })) throw new RequestBodyError('该分类下还有文章，无法删除', 409)
            await tx.category.delete({ where: { id: id! } })
          } else {
            // Existing behavior: remove tag associations, never the articles.
            await tx.tag.delete({ where: { id: id! } })
          }
          return entity
        })
        revalidate([deleted.slug])
        return respond({ message: '删除成功' })
      }

      const body = await readJsonBody(request)
      if (action === 'CREATE' && body.slug === undefined && typeof body.name === 'string') {
        body.slug = generateTaxonomySlug(body.name)
      }
      validateTaxonomyInput(body, action === 'UPDATE')
      const data = {
        ...(body.name !== undefined ? { name: body.name as string } : {}),
        ...(body.slug !== undefined ? { slug: body.slug as string } : {}),
      }
      if (action === 'CREATE') {
        const required = { name: body.name as string, slug: body.slug as string }
        const entity = category
          ? await prisma.category.create({ data: { ...required, description: body.description as string | null | undefined } })
          : await prisma.tag.create({ data: required })
        revalidate([entity.slug])
        return respond({ [singular]: entity }, 201)
      }
      const result = await prisma.$transaction(async tx => {
        const previous = category ? await tx.category.findUnique({ where: { id: id! } }) : await tx.tag.findUnique({ where: { id: id! } })
        if (!previous) throw new RequestBodyError('记录不存在', 404)
        const entity = category
          ? await tx.category.update({ where: { id: id! }, data: { ...data, ...(body.description !== undefined ? { description: body.description as string | null } : {}) } })
          : await tx.tag.update({ where: { id: id! }, data })
        return { previous, entity }
      })
      revalidate([result.previous.slug, result.entity.slug])
      return respond({ [singular]: result.entity })
    } catch (error) {
      if (error instanceof RequestBodyError) {
        const response = bodyErrorResponse(error)
        for (const [key, value] of Object.entries(auth.headers)) response.headers.set(key, String(value))
        return response
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return respond({ error: '名称或 Slug 已存在' }, 409)
      }
      console.error('插件分类/标签操作失败:', error)
      return respond({ error: '操作失败' }, 500)
    }
  }

  return {
    list: (request: Request) => handle(request, 'READ'),
    get: (request: Request, context: Context) => handle(request, 'READ', context),
    create: (request: Request) => handle(request, 'CREATE'),
    update: (request: Request, context: Context) => handle(request, 'UPDATE', context),
    delete: (request: Request, context: Context) => handle(request, 'DELETE', context),
  }
}
