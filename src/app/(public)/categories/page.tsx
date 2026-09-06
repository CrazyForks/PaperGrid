import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FolderOpen } from 'lucide-react'
import Link from 'next/link'
import { ArchiveHeading } from '@/components/layout/archive-heading'

export const revalidate = 60

export const metadata: Metadata = {
  title: '文章分类',
  description: '浏览所有文章分类，快速定位你感兴趣的主题。',
  alternates: {
    canonical: '/categories',
  },
}

export default async function CategoriesPage() {
  const [categories, totalPosts] = await Promise.all([
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
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
      },
    }),
  ])

  return (
    <div className="ba-categories-page">
      {/* 页面头部 */}
      <ArchiveHeading
        title="分类收藏"
        description="从感兴趣的主题，开始阅读。"
      />

      {/* 主要内容区 */}
      <section className="ba-archive-body">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              共{' '}
              <span className="pg-public-stat-emphasis font-semibold text-gray-900 dark:text-white">
                {categories.length}
              </span>{' '}
              个分类,
              <span className="pg-public-stat-emphasis font-semibold text-gray-900 dark:text-white">
                {totalPosts}
              </span>{' '}
              篇文章
            </p>
          </div>

          {categories.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-12 text-center">
                <FolderOpen className="mb-4 h-16 w-16 text-gray-400" />
                <p className="text-lg text-gray-500 dark:text-gray-400">暂无分类</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Link key={category.id} href={`/categories/${category.slug}`}>
                  <Card className="cursor-pointer transition-shadow hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl hover:text-blue-600 dark:hover:text-blue-400">
                            {category.name}
                          </CardTitle>
                          {category.description && (
                            <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                              {category.description}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary" className="pg-public-badge-secondary ml-2">
                          {category._count.posts}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
