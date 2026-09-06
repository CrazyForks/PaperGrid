import { Card, CardContent } from '@/components/ui/card'
import type { Metadata } from 'next'
import { CalendarDays } from 'lucide-react'
import { ArchiveTimeline } from '@/components/posts/archive-timeline'
import { getArchiveTimeline } from '@/lib/archive'
import { ArchiveHeading } from '@/components/layout/archive-heading'

export const revalidate = 60

export const metadata: Metadata = {
  title: '文章归档',
  description: '按时间轴回顾全部文章，快速定位历史内容。',
  alternates: {
    canonical: '/archive',
  },
}

export default async function ArchivePage() {
  const { years, totalPosts } = await getArchiveTimeline()

  return (
    <div className="pg-archive-page">
      <ArchiveHeading title="文章归档" />

      <section className="ba-archive-body">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="pg-archive-stats mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span>
              共{' '}
              <strong className="pg-archive-emphasis font-semibold text-gray-900 dark:text-white">
                {totalPosts}
              </strong>{' '}
              篇文章
            </span>
            <span className="pg-archive-divider h-1 w-1 rounded-full bg-gray-400" />
            <span>
              覆盖{' '}
              <strong className="pg-archive-emphasis font-semibold text-gray-900 dark:text-white">
                {years.length}
              </strong>{' '}
              个年份
            </span>
          </div>

          {totalPosts === 0 ? (
            <Card>
              <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-12 text-center">
                <CalendarDays className="mb-4 h-14 w-14 text-gray-400" />
                <p className="text-lg text-gray-500 dark:text-gray-400">暂无可归档文章</p>
              </CardContent>
            </Card>
          ) : (
            <ArchiveTimeline years={years} />
          )}
        </div>
      </section>
    </div>
  )
}
