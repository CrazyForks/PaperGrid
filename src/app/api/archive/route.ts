import { pageNumber } from '@/lib/pagination'
import { NextRequest, NextResponse } from 'next/server'
import { getArchiveMonthPosts } from '@/lib/archive'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

function parseIntParam(value: string | null): number | null {
  if (!value) {
    return null
  }

  const num = Number.parseInt(value, 10)
  return Number.isNaN(num) ? null : num
}

export async function GET(request: NextRequest) {
  try {
    const limitResult = rateLimit(`archive:${getClientIp(request)}`, {
      windowMs: 60 * 1000,
      max: 60,
    })

    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const year = parseIntParam(searchParams.get('year'))
    const month = parseIntParam(searchParams.get('month'))
    const page = pageNumber(searchParams.get('page'))
    const pageSizeRaw = parseIntParam(searchParams.get('pageSize'))
    const pageSize =
      pageSizeRaw === null
        ? DEFAULT_PAGE_SIZE
        : Math.min(Math.max(pageSizeRaw, 1), MAX_PAGE_SIZE)

    if (year === null || month === null) {
      return NextResponse.json(
        { error: '缺少 year 或 month 参数' },
        { status: 400, headers: rateLimitHeaders(limitResult) }
      )
    }

    if (year < 1970 || year > 9999) {
      return NextResponse.json(
        { error: 'year 参数不合法' },
        { status: 400, headers: rateLimitHeaders(limitResult) }
      )
    }

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'month 参数不合法' },
        { status: 400, headers: rateLimitHeaders(limitResult) }
      )
    }

    if (page < 1) {
      return NextResponse.json(
        { error: 'page 参数不合法' },
        { status: 400, headers: rateLimitHeaders(limitResult) }
      )
    }

    const result = await getArchiveMonthPosts({ year, month, page, pageSize })

    return NextResponse.json(result, {
      headers: {
        ...rateLimitHeaders(limitResult),
        'Cache-Control': 'public, max-age=30',
      },
    })
  } catch (error) {
    console.error('获取归档数据失败:', error)
    return NextResponse.json({ error: '获取归档数据失败' }, { status: 500 })
  }
}
