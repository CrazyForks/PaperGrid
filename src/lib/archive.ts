import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  ArchiveMonthNode,
  ArchiveMonthPage,
  ArchivePostNode,
  ArchiveYearNode,
} from '@/types/archive'

interface ArchiveTimelineResult {
  years: ArchiveYearNode[]
  totalPosts: number
}

interface ArchiveMonthPostsOptions {
  year: number
  month: number
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

function getArchiveDate(post: { publishedAt: Date | null; createdAt: Date }): Date {
  return post.publishedAt ?? post.createdAt
}

function getUtcYearMonth(date: Date): { year: number; month: number } {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  }
}

function getMonthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new Error('归档年份不合法')
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('归档月份不合法')
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))

  return { start, end }
}

function createMonthWhere(year: number, month: number): Prisma.PostWhereInput {
  const { start, end } = getMonthRangeUtc(year, month)

  return {
    status: 'PUBLISHED',
    OR: [
      {
        publishedAt: {
          gte: start,
          lt: end,
        },
      },
      {
        publishedAt: null,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    ],
  }
}

export async function getArchiveTimeline(): Promise<ArchiveTimelineResult> {
  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
    },
    select: {
      publishedAt: true,
      createdAt: true,
    },
  })

  const timelineMap = new Map<number, Map<number, number>>()

  posts.forEach((post) => {
    const date = getArchiveDate(post)
    const { year, month } = getUtcYearMonth(date)

    if (!timelineMap.has(year)) {
      timelineMap.set(year, new Map<number, number>())
    }

    const monthMap = timelineMap.get(year)
    if (!monthMap) {
      return
    }

    monthMap.set(month, (monthMap.get(month) ?? 0) + 1)
  })

  const years: ArchiveYearNode[] = Array.from(timelineMap.entries())
    .sort(([yearA], [yearB]) => yearB - yearA)
    .map(([year, monthMap]) => {
      const months: ArchiveMonthNode[] = Array.from(monthMap.entries())
        .sort(([monthA], [monthB]) => monthB - monthA)
        .map(([month, postCount]) => ({
          month,
          postCount,
        }))

      return {
        year,
        months,
        postCount: months.reduce((total, monthItem) => total + monthItem.postCount, 0),
      }
    })

  return {
    years,
    totalPosts: posts.length,
  }
}

export async function getArchiveMonthPosts({
  year,
  month,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: ArchiveMonthPostsOptions): Promise<ArchiveMonthPage> {
  const nextPage = Number.isInteger(page) && page > 0 ? page : 1
  const nextPageSize = Number.isInteger(pageSize)
    ? Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE

  const where = createMonthWhere(year, month)
  const skip = (nextPage - 1) * nextPageSize

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        createdAt: true,
        isProtected: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: nextPageSize,
    }),
  ])

  const result: ArchivePostNode[] = posts.map((post) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
    isProtected: post.isProtected,
  }))

  return {
    posts: result,
    total,
    page: nextPage,
    pageSize: nextPageSize,
    hasMore: skip + result.length < total,
  }
}
