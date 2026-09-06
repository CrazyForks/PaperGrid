'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TriangleLoader } from '@/components/loading/triangle-loader'
import { ChevronDown, ArrowUpRight, Lock } from 'lucide-react'
import type { ArchiveMonthPage, ArchivePostNode, ArchiveYearNode } from '@/types/archive'

interface ArchiveTimelineProps {
  years: ArchiveYearNode[]
}

interface MonthLoadState {
  posts: ArchivePostNode[]
  page: number
  hasMore: boolean
  loaded: boolean
  loading: boolean
  error: string | null
}

const DEFAULT_PAGE_SIZE = 20

function getMonthKey(year: number, month: number): string {
  return `${year}-${month}`
}

function createInitialMonthState(): MonthLoadState {
  return {
    posts: [],
    page: 0,
    hasMore: true,
    loaded: false,
    loading: false,
    error: null,
  }
}

async function requestMonthPosts(
  year: number,
  month: number,
  page: number,
  pageSize: number
): Promise<ArchiveMonthPage> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    page: String(page),
    pageSize: String(pageSize),
  })

  const response = await fetch(`/api/archive?${params.toString()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || '加载失败，请稍后重试')
  }

  return (await response.json()) as ArchiveMonthPage
}

export function ArchiveTimeline({ years }: ArchiveTimelineProps) {
  const defaultOpenYear = years[0]?.year
  const defaultOpenMonth = years[0]?.months[0]?.month
  const defaultMonthKey =
    defaultOpenYear && defaultOpenMonth ? getMonthKey(defaultOpenYear, defaultOpenMonth) : null

  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set(defaultOpenYear ? [defaultOpenYear] : [])
  )
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(
    () => new Set(defaultMonthKey ? [defaultMonthKey] : [])
  )
  const [monthStates, setMonthStates] = useState<Record<string, MonthLoadState>>({})

  const loadingMonthKeysRef = useRef<Set<string>>(new Set())
  const autoLoadedMonthKeyRef = useRef<string | null>(null)

  const allYearKeys = useMemo(() => years.map((year) => year.year), [years])
  const isCollapsedAll = expandedYears.size === 0

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) {
        next.delete(year)
      } else {
        next.add(year)
      }
      return next
    })
  }

  const loadMonthPosts = useCallback(
    async (year: number, month: number, page: number, append: boolean) => {
      const key = getMonthKey(year, month)
      if (loadingMonthKeysRef.current.has(key)) {
        return
      }

      loadingMonthKeysRef.current.add(key)
      setMonthStates((prev) => {
        const existing = prev[key] ?? createInitialMonthState()
        return {
          ...prev,
          [key]: {
            ...existing,
            loading: true,
            error: null,
          },
        }
      })

      try {
        const data = await requestMonthPosts(year, month, page, DEFAULT_PAGE_SIZE)

        setMonthStates((prev) => {
          const existing = prev[key] ?? createInitialMonthState()
          const posts = append ? [...existing.posts, ...data.posts] : data.posts

          return {
            ...prev,
            [key]: {
              posts,
              page: data.page,
              hasMore: data.hasMore,
              loaded: true,
              loading: false,
              error: null,
            },
          }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载失败，请稍后重试'
        setMonthStates((prev) => {
          const existing = prev[key] ?? createInitialMonthState()
          return {
            ...prev,
            [key]: {
              ...existing,
              loading: false,
              error: message,
            },
          }
        })
      } finally {
        loadingMonthKeysRef.current.delete(key)
      }
    },
    []
  )

  useEffect(() => {
    if (!defaultOpenYear || !defaultOpenMonth) {
      return
    }

    const key = getMonthKey(defaultOpenYear, defaultOpenMonth)
    if (autoLoadedMonthKeyRef.current === key) {
      return
    }

    autoLoadedMonthKeyRef.current = key
    void loadMonthPosts(defaultOpenYear, defaultOpenMonth, 1, false)
  }, [defaultOpenYear, defaultOpenMonth, loadMonthPosts])

  const toggleMonth = (year: number, month: number) => {
    const key = getMonthKey(year, month)
    const willOpen = !expandedMonths.has(key)

    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })

    const currentState = monthStates[key]
    if (willOpen && !currentState?.loaded && !currentState?.loading) {
      void loadMonthPosts(year, month, 1, false)
    }
  }

  return (
    <div className="ba-archive-timeline">
      <aside className="ba-year-index">
        <p>按年份翻阅</p>
        <nav aria-label="归档年份">
          {years.map((year) => (
            <a
              key={year.year}
              href={`#archive-year-${year.year}`}
              onClick={() => setExpandedYears((previous) => new Set([...previous, year.year]))}
            >
              <span>{year.year}</span>
              <small>{year.postCount} 篇</small>
            </a>
          ))}
        </nav>
        <div className="ba-archive-switches">
          <button
            aria-pressed={!isCollapsedAll}
            onClick={() => setExpandedYears(new Set(allYearKeys))}
          >
            展开年份
          </button>
          <button
            aria-pressed={isCollapsedAll}
            onClick={() => {
              setExpandedYears(new Set())
              setExpandedMonths(new Set())
            }}
          >
            全部折叠
          </button>
        </div>
      </aside>
      <div className="ba-archive-years">
        {years.map((year) => {
          const yearOpen = expandedYears.has(year.year)
          return (
            <section key={year.year} id={`archive-year-${year.year}`} className="ba-archive-year">
              <button
                className="ba-year-heading"
                onClick={() => toggleYear(year.year)}
                aria-expanded={yearOpen}
                aria-controls={`archive-months-${year.year}`}
              >
                <span className="ba-year-number">{year.year}</span>
                <span className="ba-year-count">{year.postCount} 篇记录</span>
                <ChevronDown className={yearOpen ? '' : 'ba-chevron-closed'} size={22} />
              </button>
              {yearOpen && (
                <div id={`archive-months-${year.year}`} className="ba-archive-months">
                  {year.months.map((month) => {
                    const key = getMonthKey(year.year, month.month)
                    const monthOpen = expandedMonths.has(key)
                    const state = monthStates[key] ?? createInitialMonthState()
                    return (
                      <div key={key} className="ba-archive-month">
                        <button
                          className="ba-month-heading"
                          onClick={() => toggleMonth(year.year, month.month)}
                          aria-expanded={monthOpen}
                          aria-controls={`archive-entries-${key}`}
                        >
                          <span className="ba-month-number">
                            {String(month.month).padStart(2, '0')}
                            <small>月</small>
                          </span>
                          <span>{month.postCount} 篇</span>
                          <ChevronDown size={18} className={monthOpen ? '' : 'ba-chevron-closed'} />
                        </button>
                        {monthOpen && (
                          <div
                            id={`archive-entries-${key}`}
                            className="ba-month-entries"
                            aria-busy={state.loading}
                          >
                            {state.loading && !state.loaded && (
                              <p className="ba-archive-message" role="status">
                                <TriangleLoader />
                                正在加载文章…
                              </p>
                            )}
                            {state.loaded && !state.posts.length && (
                              <p className="ba-archive-message">本月暂无文章</p>
                            )}
                            <ol>
                              {state.posts.map((post) => (
                                <li key={post.id}>
                                  <Link href={`/posts/${post.slug}`} className="ba-archive-entry">
                                    <time dateTime={post.publishedAt || undefined}>
                                      {post.publishedAt
                                        ? new Date(post.publishedAt)
                                            .getUTCDate()
                                            .toString()
                                            .padStart(2, '0')
                                        : '—'}
                                      <small>日</small>
                                    </time>
                                    <span>{post.title}</span>
                                    {post.isProtected && <Lock size={14} aria-label="加密文章" />}
                                    <ArrowUpRight size={17} />
                                  </Link>
                                </li>
                              ))}
                            </ol>
                            {state.error && (
                              <p className="ba-archive-message ba-error" role="alert">
                                {state.error}
                              </p>
                            )}
                            {(state.error || (state.loaded && state.hasMore)) && (
                              <button
                                className="ba-archive-more"
                                disabled={state.loading}
                                onClick={() =>
                                  void loadMonthPosts(
                                    year.year,
                                    month.month,
                                    state.loaded ? state.page + 1 : 1,
                                    state.loaded
                                  )
                                }
                              >
                                {state.loading
                                  ? '正在加载…'
                                  : state.error
                                    ? '重新加载'
                                    : '继续翻阅本月文章'}
                                <ChevronDown size={16} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
