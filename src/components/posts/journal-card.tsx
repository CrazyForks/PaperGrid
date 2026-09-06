import Link from 'next/link'
import { ArrowUpRight, Eye } from 'lucide-react'
import { PostMeta } from './post-meta'
export interface JournalEntry {
  id: string
  slug: string
  title: string
  excerpt: string | null
  coverImage: string | null
  publishedAt: Date | string | null
  readingTime: number | null
  isProtected: boolean
  author: { name: string | null }
  category: { name: string; slug: string } | null
  postTags: { tag: { id: string; slug: string; name: string } }[]
  viewCount: { count: number | null } | null
}
export function JournalCard({
  post,
  featured = false,
}: {
  post: JournalEntry
  featured?: boolean
}) {
  return (
    <article className="ba-post-card" data-featured={featured} data-reveal>
      <div className="ba-post-topline">
        {post.category && (
          <Link href={`/categories/${post.category.slug}`}>{post.category.name}</Link>
        )}
      </div>
      {post.coverImage && !post.isProtected && (
        <Link
          href={`/posts/${post.slug}`}
          className="ba-post-image"
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={post.coverImage}
            alt=""
            width={640}
            height={320}
            loading="lazy"
            decoding="async"
          />
        </Link>
      )}
      <div className="ba-post-copy">
        <PostMeta
          publishedAt={post.publishedAt}
          authorName={post.author.name}
          readingTime={post.readingTime}
          isProtected={post.isProtected}
        />
        <h3>
          <Link href={`/posts/${post.slug}`}>{post.title}</Link>
        </h3>
        {post.excerpt && <p>{post.excerpt}</p>}
      </div>
      <footer className="ba-post-bottom">
        <div>
          {post.postTags.slice(0, 2).map(({ tag }) => (
            <Link key={tag.id} href={`/tags/${tag.slug}`}>
              #{tag.name}
            </Link>
          ))}
        </div>
        <span>
          <Eye size={15} />
          {post.viewCount?.count || 0}
        </span>
        <Link
          href={`/posts/${post.slug}`}
          aria-label={`阅读：${post.title}`}
          className="ba-post-open"
        >
          <ArrowUpRight size={22} />
        </Link>
      </footer>
    </article>
  )
}
