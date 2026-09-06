'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FileText,
  MessageSquare,
  Folder,
  Eye,
  AlertCircle,
  TrendingUp,
  PenLine,
  ArrowUpRight,
} from 'lucide-react'
import Link from 'next/link'
import { StatsCard } from '@/components/admin/stats-card'
import { ViewsChart } from '@/components/admin/views-chart'
import { RecentComments, PopularPosts } from '@/components/admin/recent-items'
import { Button } from '@/components/ui/button'

interface DashboardStats {
  posts: {
    total: number
    published: number
    draft: number
    thisWeek: number
  }
  comments: {
    total: number
    pending: number
  }
  categories: number
  tags: number
  views: {
    total: number
    trend: Array<{ date: string; views: number }>
  }
  recentPosts: Array<{
    id: string
    title: string
    slug: string
    createdAt: Date
    viewCount: { count: number | null } | null
  }>
  popularPosts: Array<{
    id: string
    title: string
    slug: string
    viewCount: { count: number | null } | null
  }>
  recentComments: Array<{
    id: string
    content: string
    createdAt: Date
    author: { name: string | null }
    post: { title: string }
  }>
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defaultAvatarUrl, setDefaultAvatarUrl] = useState('')

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetch('/api/settings/public')
      .then((res) => res.json())
      .then((data) => setDefaultAvatarUrl(data?.['site.defaultAvatarUrl'] || ''))
      .catch((err) => console.error('Failed to load settings', err))
  }, [])

  const fetchStats = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/admin/stats')
      const data = await response.json()

      if (response.ok) {
        setStats(data)
      } else {
        setError(data.error || '获取统计数据失败')
      }
    } catch (err) {
      console.error('获取统计数据失败:', err)
      setError('获取统计数据失败')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="ba-dashboard space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">仪表板</h1>
          <p className="text-muted-foreground">欢迎来到您的博客管理后台</p>
        </div>
        <div className="ba-stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="ba-dashboard space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">仪表板</h1>
          <p className="text-muted-foreground">欢迎来到您的博客管理后台</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
            <p className="mb-2 text-lg font-medium">加载失败</p>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{error}</p>
            <Button onClick={fetchStats}>重试</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="ba-dashboard space-y-6">
      {/* Page Header */}
      <header className="ba-workspace-heading">
        <div>
          <h1>工作台</h1>
        </div>
        <Link href="/admin/posts/editor" className="schale-primary-link">
          <PenLine size={19} />
          新建文章
        </Link>
      </header>

      {/* Stats Cards */}
      <div className="ba-stats-grid">
        <StatsCard
          title="总文章数"
          value={stats.posts.total}
          change={
            stats.posts.thisWeek > 0
              ? Math.round((stats.posts.thisWeek / stats.posts.total) * 100)
              : 0
          }
          icon={FileText}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-100 dark:bg-blue-900/20"
        />
        <StatsCard
          title="已发布"
          value={stats.posts.published}
          icon={TrendingUp}
          color="text-green-600 dark:text-green-400"
          bgColor="bg-green-100 dark:bg-green-900/20"
        />
        <StatsCard
          title="草稿"
          value={stats.posts.draft}
          icon={FileText}
          color="text-yellow-600 dark:text-yellow-400"
          bgColor="bg-yellow-100 dark:bg-yellow-900/20"
        />
        <StatsCard
          title="总阅读量"
          value={stats.views.total.toLocaleString()}
          icon={Eye}
          color="text-purple-600 dark:text-purple-400"
          bgColor="bg-purple-100 dark:bg-purple-900/20"
        />
      </div>

      <div className="ba-work-queue">
        <Link href="/admin/comments">
          <MessageSquare size={21} />
          <span>
            评论互动
            <small>
              {stats.comments.total} 条评论 · {stats.comments.pending} 条待审核
            </small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
        <Link href="/admin/categories">
          <Folder size={21} />
          <span>
            内容整理
            <small>
              {stats.categories} 个分类 · {stats.tags} 个标签
            </small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
      </div>

      {/* Charts and Lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Views Chart */}
        <div className="lg:col-span-2">
          <ViewsChart data={stats.views.trend} />
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/admin/posts/editor"
              className="bg-primary text-primary-foreground hover:bg-primary/90 block inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
            >
              写新文章
            </Link>
            <Link
              href="/admin/comments"
              className="block inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              管理评论
              {stats.comments.pending > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                  {stats.comments.pending}
                </span>
              )}
            </Link>
            <Link
              href="/admin/categories"
              className="block inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              管理分类
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Items */}
      <div className="grid gap-4 md:grid-cols-2">
        <PopularPosts posts={stats.popularPosts} />
        <RecentComments comments={stats.recentComments} defaultAvatarUrl={defaultAvatarUrl} />
      </div>
    </div>
  )
}
