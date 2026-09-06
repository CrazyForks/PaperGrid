import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowUpRight, BookOpen, Hash } from 'lucide-react'
import { HeroSection } from '@/components/home/hero-section'
import { getPublicSettings, getSetting } from '@/lib/settings'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { RecentCommentsTimeline } from '@/components/comments/recent-comments-timeline'
import { JournalCard } from '@/components/posts/journal-card'

export const revalidate = 60

export const metadata: Metadata = {
  title: '首页',
  description: '分享技术文章、生活记录和作品展示的个人博客。',
  alternates: {
    canonical: '/',
  },
}

export default async function HomePage() {
  const [settings, commentsEnabledRaw, latestPosts, categories, tags] = await Promise.all([
    getPublicSettings(),
    getSetting<boolean>('comments.enabled', true),
    prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
      },
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
            id: true,
            name: true,
            slug: true,
          },
        },
        postTags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
          take: 5,
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
      take: 6,
    }),
    prisma.category.findMany({
      include: {
        _count: {
          select: {
            posts: {
              where: { status: 'PUBLISHED' },
            },
          },
        },
      },
      take: 8,
    }),
    prisma.tag.findMany({
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
      },
      orderBy: {
        posts: {
          _count: 'desc',
        },
      },
      take: 10,
    }),
  ])
  const commentsEnabled = commentsEnabledRaw ?? true
  const ownerName =
    typeof settings['site.ownerName'] === 'string' ? settings['site.ownerName'] : '千叶'
  const defaultAvatarUrl =
    typeof settings['site.defaultAvatarUrl'] === 'string' ? settings['site.defaultAvatarUrl'] : ''
  const ownerRole =
    typeof settings['profile.role'] === 'string' ? settings['profile.role'] : '全栈开发者'
  const signature =
    typeof settings['profile.signature'] === 'string'
      ? settings['profile.signature']
      : '热爱技术,喜欢分享。这里记录我的学习和成长过程。'

  return (
    <div className="ba-home">
      <HeroSection settings={settings} />
      <section id="latest-posts" className="ba-journal ba-container">
        <header className="ba-section-heading" data-reveal>
          <div>
            <h2>最新文章</h2>
          </div>
          <Link href="/posts" className="ba-inline-link">
            全部文章 <ArrowUpRight size={18} />
          </Link>
        </header>
        <nav className="ba-collection-tabs" aria-label="按分类阅读" data-reveal>
          <Link href="/posts" className="ba-collection-all">
            <BookOpen size={17} />
            全部手记
          </Link>
          {categories.map((cat) => (
            <Link key={cat.id} href={`/categories/${cat.slug}`}>
              {cat.name}
              <span>{cat._count.posts}</span>
            </Link>
          ))}
        </nav>
        {latestPosts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BookOpen className="text-primary mx-auto mb-4" size={32} />
              <p>这里还没有文章。</p>
              <Button asChild className="mt-5">
                <Link href="/admin/posts">写第一篇手记</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="ba-post-grid">
            {latestPosts.map((post, index) => (
              <JournalCard key={post.id} post={post} featured={index === 0} />
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="ba-topic-line" data-reveal>
            <Hash size={18} />
            <span>话题索引</span>
            {tags.map((tag) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`}>
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="ba-community ba-container">
        <div className="ba-profile-panel" data-reveal>
          <div className="ba-profile-identity">
            <Avatar className="h-16 w-16">
              <AvatarImage src={defaultAvatarUrl || undefined} />
              <AvatarFallback>{ownerName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h2>{ownerName}</h2>
              <p>{ownerRole}</p>
            </div>
          </div>
          <p>{signature}</p>
          <Link href="/about" className="ba-inline-link">
            关于我 <ArrowUpRight size={18} />
          </Link>
        </div>
        {commentsEnabled && (
          <div className="ba-conversation-panel" data-reveal>
            <header>
              <h2>最新评论</h2>
            </header>
            <RecentCommentsTimeline />
          </div>
        )}
      </section>
    </div>
  )
}
