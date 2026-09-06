'use client'

import { useEffect, useState, useRef } from 'react'
import { Calendar } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { CommentForm, type CommentSubmission } from './comment-form'

interface Author {
  name: string | null
  image: string | null
}

interface Comment {
  id: string
  content: string
  createdAt: Date
  author: Author | null
  authorName?: string | null
  parentId?: string | null
}

type ParentContext = { id: string; authorName: string; excerpt: string }

interface CommentListProps {
  postSlug: string
  submittedComment?: CommentSubmission
  defaultAvatarUrl?: string
  allowGuest?: boolean
  unlockToken?: string
}

export function CommentList({
  postSlug,
  submittedComment,
  defaultAvatarUrl = '',
  allowGuest,
  unlockToken,
}: CommentListProps) {
  const [page, setPage] = useState(1)
  const [request, setRequest] = useState<{ page: number; targetId?: string } | null>(null)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scrollTarget, setScrollTarget] = useState('')
  const requestId = useRef(0)
  const [comments, setComments] = useState<Comment[]>([])
  const [parentContexts, setParentContexts] = useState<ParentContext[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const followHash = () => {
      let targetId: string | undefined
      try {
        const hash = decodeURIComponent(window.location.hash)
        if (hash.startsWith('#comment-') && hash.length <= 137) targetId = hash.slice(9) || undefined
      } catch { /* Malformed fragments are not comment links. */ }
      setRequest({ page: 1, targetId })
    }
    followHash()
    window.addEventListener('hashchange', followHash)
    return () => window.removeEventListener('hashchange', followHash)
  }, [postSlug])

  useEffect(() => {
    if (submittedComment?.status === 'APPROVED') {
      setRequest({ page: 1, targetId: submittedComment.id })
    }
  }, [submittedComment])

  useEffect(() => {
    if (!request) return
    const current = ++requestId.current
    const controller = new AbortController()
    void (async () => {
      setError('')
      setNotice('')
      setScrollTarget('')
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ slug: postSlug, page: String(request.page) })
        if (request.targetId) params.set('commentId', request.targetId)
        const response = await fetch(`/api/comments?${params}`, {
          headers: unlockToken ? { Authorization: `Bearer ${unlockToken}` } : undefined,
          signal: controller.signal,
        })
        const data = await response.json()
        if (controller.signal.aborted || current !== requestId.current) return
        if (!response.ok) throw new Error(data.error || '获取评论失败')
        setPage(data.pagination.page)
        setTotalPages(data.pagination.totalPages)
        setTotal(data.pagination.total)
        setComments(data.comments)
        setParentContexts(data.parentContexts || [])
        if (request.targetId) {
          if (data.targetFound) setScrollTarget(request.targetId)
          else setNotice('该评论不存在或尚未公开。')
        }
      } catch (error) {
        if (!controller.signal.aborted && current === requestId.current)
          setError(error instanceof Error ? error.message : '获取评论失败')
      } finally {
        if (!controller.signal.aborted && current === requestId.current) setIsLoading(false)
      }
    })()
    return () => controller.abort()
  }, [postSlug, unlockToken, request])

  useEffect(() => {
    if (isLoading || !scrollTarget) return
    const target = document.getElementById(`comment-${scrollTarget}`)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [isLoading, scrollTarget])

  const followComment = (id: string) => {
    window.history.replaceState(window.history.state, '', `#comment-${encodeURIComponent(id)}`)
    setRequest({ page, targetId: id })
  }
  const onReplySuccess = (comment: CommentSubmission) => {
    if (comment.status === 'APPROVED') setRequest({ page, targetId: comment.id })
  }

  if (error) return <Card className="p-6 text-center"><p role="alert">{error}</p><Button className="mt-3" variant="outline" onClick={() => setRequest({ ...request, page })}>重试</Button></Card>

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (comments.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">{notice || '还没有评论，快来发表第一条评论吧！'}</p>
      </Card>
    )
  }

  const sortByDate = (a: Comment, b: Comment) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()

  const repliesMap = new Map<string, Comment[]>()
  const rootComments: Comment[] = []

  for (const comment of comments) {
    if (comment.parentId && comments.some(item => item.id === comment.parentId)) {
      const list = repliesMap.get(comment.parentId) || []
      list.push(comment)
      repliesMap.set(comment.parentId, list)
    } else {
      rootComments.push(comment)
    }
  }

  rootComments.sort(sortByDate)
  for (const list of repliesMap.values()) {
    list.sort(sortByDate)
  }

  return (
    <div className="space-y-4">
      {notice && <p role="status">{notice}</p>}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        评论 ({total})
      </h3>
      <div className="space-y-4">
        {rootComments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={repliesMap.get(comment.id) || []}
            repliesMap={repliesMap}
            defaultAvatarUrl={defaultAvatarUrl}
            postSlug={postSlug}
            allowGuest={allowGuest}
            unlockToken={unlockToken}
            onReplySuccess={onReplySuccess}
            parentContexts={parentContexts}
            onFollowComment={followComment}
          />
        ))}
      </div>
      <PaginationControls page={page} totalPages={totalPages} onChange={(page) => setRequest({ page })} disabled={isLoading} />
    </div>
  )
}

function CommentItem({
  comment,
  replies,
  repliesMap,
  defaultAvatarUrl,
  postSlug,
  allowGuest,
  onReplySuccess,
  unlockToken,
  parentContexts,
  onFollowComment,
  depth = 0,
}: {
  comment: Comment
  replies: Comment[]
  repliesMap: Map<string, Comment[]>
  defaultAvatarUrl: string
  postSlug: string
  allowGuest?: boolean
  onReplySuccess?: (comment: CommentSubmission) => void
  parentContexts: ParentContext[]
  onFollowComment: (id: string) => void
  unlockToken?: string
  depth?: number
}) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const parent = parentContexts.find(parent => parent.id === comment.parentId)
  const displayName = comment.author?.name || comment.authorName || '匿名用户'
  const avatarSrc =
    comment.author?.image || (comment.author ? defaultAvatarUrl || undefined : undefined)
  const getInitial = (name: string) => {
    if (!name) return '?'
    return name.trim().charAt(0).toUpperCase() || '?'
  }

  return (
    <div className="space-y-3">
      <Card id={`comment-${comment.id}`} tabIndex={-1} className="scroll-mt-24 p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start gap-3">
          {/* 头像 */}
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={avatarSrc} />
            <AvatarFallback className="border border-gray-900 bg-gray-50 font-serif text-gray-900 dark:border-white dark:bg-gray-800 dark:text-white">
              {getInitial(displayName)}
            </AvatarFallback>
          </Avatar>

          {/* 评论内容 */}
          <div className="min-w-0 flex-1">
            {/* 作者名和时间 */}
            <div className="mb-2 flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">{displayName}</span>
              <span className="text-gray-400">·</span>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Calendar className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </span>
              </div>
            </div>

            {parent && (
              <a
                href={`#comment-${encodeURIComponent(parent.id)}`}
                className="mb-3 block border-l-2 pl-3 text-sm text-muted-foreground hover:text-primary"
                onClick={(event) => { event.preventDefault(); onFollowComment(parent.id) }}
              >
                <span className="block">回复 {parent.authorName}</span>
                <span className="line-clamp-2 break-words">{parent.excerpt}</span>
              </a>
            )}
            {comment.parentId && depth === 0 && !parent && (
              <p className="mb-3 text-sm text-muted-foreground">回复的评论已不可用</p>
            )}
            {/* 评论内容 */}
            <p className="break-words whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {comment.content}
            </p>

            {/* 操作区 */}
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                onClick={() => setShowReplyForm((prev) => !prev)}
              >
                {showReplyForm ? '取消回复' : '回复'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {showReplyForm && (
        <div className="ml-6">
          <CommentForm
            postSlug={postSlug}
            allowGuest={allowGuest}
            parentId={comment.id}
            compact
            autoFocus
            unlockToken={unlockToken}
            onCancel={() => setShowReplyForm(false)}
            onSuccess={(comment) => {
              setShowReplyForm(false)
              onReplySuccess?.(comment)
            }}
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className={depth < 2 ? 'space-y-3 border-l pl-3 ml-2' : 'space-y-3'}>
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={repliesMap.get(reply.id) || []}
              repliesMap={repliesMap}
              defaultAvatarUrl={defaultAvatarUrl}
              postSlug={postSlug}
              allowGuest={allowGuest}
              unlockToken={unlockToken}
              onReplySuccess={onReplySuccess}
              parentContexts={parentContexts}
              onFollowComment={onFollowComment}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
