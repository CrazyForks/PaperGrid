import { JournalCard } from '@/components/posts/journal-card'
import { ArchiveHeading } from '@/components/layout/archive-heading'
import { pageNumber, pageSize as boundedPageSize } from '@/lib/pagination'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { PostFilters } from '@/components/posts/post-filters'
import { getSetting } from '@/lib/settings'
import { Suspense } from 'react'
import { toCanonicalPath } from '@/lib/seo'

export const revalidate = 60

interface PostsPageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    category?: string
    tag?: string
  }>
}

export async function generateMetadata({ searchParams }: PostsPageProps): Promise<Metadata> {
  const params = await searchParams
  const page = pageNumber(params.page)
  const search = params.search?.trim() || ''
  const category = params.category?.trim() || ''
  const tag = params.tag?.trim() || ''

  const canonical = toCanonicalPath('/posts', {
    ...(page > 1 ? { page: String(page) } : {}),
    ...(category ? { category } : {}),
    ...(tag ? { tag } : {}),
  })

  const hasNonPaginationFilter = Boolean(search || category || tag)
  return {
    title: '文章列表',
    description: '浏览所有已发布的技术文章、生活记录和作品展示。',
    alternates: {
      canonical,
    },
    robots: hasNonPaginationFilter
      ? {
          index: false,
          follow: true,
        }
      : undefined,
  }
}

export default async function PostsPage({ searchParams }: PostsPageProps) {
  const params = await searchParams
  const page = pageNumber(params.page)
  const pageSize = boundedPageSize(await getSetting<number>('posts.perPage', 12), 12)
  const skip = (page - 1) * pageSize

  // 获取筛选参数
  const search = params.search || ''
  const categorySlug = params.category || ''
  const tagSlug = params.tag || ''

  // 构建查询条件
  const where: Prisma.PostWhereInput = {
    status: 'PUBLISHED',
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { excerpt: { contains: search } },
      { AND: [{ isProtected: false }, { content: { contains: search } }] },
    ]
  }

  if (categorySlug) {
    where.category = {
      slug: categorySlug,
    }
  }

  if (tagSlug) {
    where.postTags = {
      some: {
        tag: {
          slug: tagSlug,
        },
      },
    }
  }

  const [totalPosts, posts, categories, tags] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        publishedAt: true,
        readingTime: true,
        isProtected: true,
        author: {
          select: {
            name: true,
            image: true,
          },
        },
        category: {
          select: {
            name: true,
            slug: true,
          },
        },
        postTags: {
          take: 5,
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        viewCount: {
          select: {
            count: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      skip,
      take: pageSize,
    }),
    prisma.category.findMany({
      include: {
        _count: {
          select: {
            posts: {
              where: {
                status: 'PUBLISHED',
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
    prisma.tag.findMany({
      include: {
        _count: {
          select: {
            posts: {
              where: {
                post: {
                  status: 'PUBLISHED',
                },
              },
            },
          },
        },
      },
      orderBy: {
        posts: {
          _count: 'desc',
        },
      },
      take: 20,
    }),
  ])

  // 计算总页数
  const totalPages = Math.ceil(totalPosts / pageSize)

  const pages = Array.from(
    { length: Math.min(totalPages, 5) },
    (_, index) => Math.max(1, Math.min(page - 2, totalPages - 4)) + index
  )
  const href = (target: number) => ({
    pathname: '/posts',
    query: { ...params, page: String(target) },
  })
  return (
    <div className="ba-archive-page">
      <ArchiveHeading title="文章手记" />
      <section className="ba-container ba-archive-body">
        <div className="ba-filter-panel">
          <Suspense fallback={<div className="bg-muted h-12 animate-pulse" />}>
            <PostFilters key={JSON.stringify(params)} categories={categories} tags={tags} />
          </Suspense>
        </div>
        <p className="ba-results-count" aria-live="polite">
          找到 {totalPosts} 篇文章{totalPosts > pageSize && ` · 第 ${page} / ${totalPages} 页`}
        </p>
        {posts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <p>没有找到相关文章</p>
              <Button asChild variant="outline" className="mt-5">
                <Link href="/posts">清除筛选条件</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="ba-post-grid">
            {posts.map((post) => (
              <JournalCard key={post.id} post={post} />
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <nav className="ba-pagination" aria-label="文章分页">
            {page > 1 && (
              <Link href={href(page - 1)} aria-label="上一页">
                ←
              </Link>
            )}
            {pages.map((n) => (
              <Link key={n} href={href(n)} aria-current={n === page ? 'page' : undefined}>
                {n}
              </Link>
            ))}
            {page < totalPages && (
              <Link href={href(page + 1)} aria-label="下一页">
                →
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  )
}
