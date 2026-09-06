import { pageNumber } from '@/lib/pagination'
import { getCommentPage } from '@/lib/comment-pagination'
import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { after, NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'
import sanitizeHtml from 'sanitize-html'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getPostUnlockTokenFromHeaders, verifyPostUnlockToken } from '@/lib/post-protection'
import { createRequestLogger } from '@/lib/logger'
import { sendCommentGotifyNotification, type CommentGotifyNotificationInput } from '@/lib/notifications/gotify-service'
import {
  sendCommentEmailNotification,
  sendCommentReplyEmailNotification,
  type CommentEmailNotificationInput,
  type CommentReplyEmailNotificationInput,
} from '@/lib/notifications/email-service'
import type { Logger } from 'pino'

function sendCommentGotifyNotificationAsync(comment: CommentGotifyNotificationInput, logger: Logger) {
  after(async () => {
    try {
      await sendCommentGotifyNotification(comment)
    } catch (notifyError) {
      logger.error({ err: notifyError }, 'Gotify 通知发送失败')
    }
  })
}

function sendCommentEmailNotificationAsync(comment: CommentEmailNotificationInput, logger: Logger) {
  after(async () => {
    try {
      await sendCommentEmailNotification(comment)
    } catch (notifyError) {
      logger.error({ err: notifyError }, '邮件通知发送失败')
    }
  })
}

function sendCommentReplyEmailNotificationAsync(input: CommentReplyEmailNotificationInput, logger: Logger) {
  after(async () => {
    try {
      await sendCommentReplyEmailNotification(input)
    } catch (notifyError) {
      logger.error({ err: notifyError }, '邮件回复通知发送失败')
    }
  })
}

// GET /api/comments?slug=xxx - 分页获取文章评论，可定位到指定评论
export async function GET(request: NextRequest) {
  const logger = createRequestLogger(request, { module: 'comments', action: 'list' })
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: '缺少文章 slug' }, { status: 400 })
    }

    const commentsEnabled = (await getSetting<boolean>('comments.enabled', true)) ?? true
    if (!commentsEnabled) {
      return NextResponse.json({ error: '评论功能已关闭' }, { status: 403 })
    }

    // 查找文章
    const post = await prisma.post.findUnique({
      where: { slug },
      select: { id: true, status: true, isProtected: true, passwordHash: true },
    })

    if (!post || post.status !== 'PUBLISHED') {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    if (post.isProtected && (await auth())?.user.role !== 'ADMIN') {
      if (!post.passwordHash) {
        return NextResponse.json({ error: '文章已加密' }, { status: 403 })
      }
      const token = getPostUnlockTokenFromHeaders(request.headers, post.id)
      const unlocked = token
        ? verifyPostUnlockToken(token, post.id, post.passwordHash)
        : false
      if (!unlocked) {
        return NextResponse.json({ error: '文章已加密' }, { status: 403 })
      }
    }

    const targetId = searchParams.get('commentId')
    if (targetId && targetId.length > 128) {
      return NextResponse.json({ error: '评论标识不合法' }, { status: 400 })
    }
    const result = await prisma.$transaction(tx =>
      getCommentPage(tx, post.id, pageNumber(searchParams.get('page')), targetId),
    )
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    logger.error({ err: error }, '获取评论失败')
    return NextResponse.json({ error: '获取评论失败' }, { status: 500 })
  }
}

// POST /api/comments?slug=xxx - 创建新评论
export async function POST(request: NextRequest) {
  let logger = createRequestLogger(request, { module: 'comments', action: 'create' })
  try {
    const limit = rateLimit(`comments:${getClientIp(request)}`, {
      windowMs: 5 * 60 * 1000,
      max: 30,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: rateLimitHeaders(limit) }
      )
    }

    const session = await auth()
    if (session?.user?.id) {
      logger = logger.child({ userId: session.user.id })
    }
    const sessionUser = session?.user
      ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true },
      })
      : null
    if (session?.user && !sessionUser) {
      return NextResponse.json({ error: '登录状态已失效，请重新登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: '缺少文章 slug' }, { status: 400 })
    }

    // 查找文章
    const post = await prisma.post.findUnique({
      where: { slug },
      select: { id: true, status: true, isProtected: true, passwordHash: true },
    })

    if (!post || post.status !== 'PUBLISHED') {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    if (post.status !== 'PUBLISHED') {
      return NextResponse.json({ error: '文章未发布' }, { status: 400 })
    }

    const commentsEnabled = (await getSetting<boolean>('comments.enabled', true)) ?? true
    if (!commentsEnabled) {
      return NextResponse.json({ error: '评论功能已关闭' }, { status: 403 })
    }

    if (post.isProtected && session?.user.role !== 'ADMIN') {
      if (!post.passwordHash) {
        return NextResponse.json({ error: '文章已加密' }, { status: 403 })
      }
      const token = getPostUnlockTokenFromHeaders(request.headers, post.id)
      const unlocked = token
        ? verifyPostUnlockToken(token, post.id, post.passwordHash)
        : false
      if (!unlocked) {
        return NextResponse.json({ error: '文章已加密' }, { status: 403 })
      }
    }

    const [allowGuestRaw, moderationRequiredRaw, guestModerationRequiredRaw] = await Promise.all([
      getSetting<boolean>('comments.allowGuest', false),
      getSetting<boolean>('comments.moderationRequired', false),
      getSetting<boolean>('comments.guestModerationRequired', false),
    ])
    const allowGuest = allowGuestRaw ?? false
    const moderationRequired = moderationRequiredRaw ?? false
    const guestModerationRequired = guestModerationRequiredRaw ?? false

    const body = await readJsonBody(request)
    const { content, authorName, authorEmail, parentId } = body

    // 检查用户是否登录
    if (!sessionUser && !allowGuest) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    // 验证评论内容
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: '评论内容不能为空' }, { status: 400 })
    }

    const sanitizedContent = sanitizeHtml(content, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim()

    if (sanitizedContent.length === 0) {
      return NextResponse.json({ error: '评论内容不能为空' }, { status: 400 })
    }

    if (sanitizedContent.length > 1000) {
      return NextResponse.json({ error: '评论内容不能超过1000字' }, { status: 400 })
    }

    let guestName: string | null = null
    let guestEmail: string | null = null
    if (!sessionUser) {
      guestName = typeof authorName === 'string' ? authorName.trim() : ''
      guestEmail = typeof authorEmail === 'string' ? authorEmail.trim() : ''
      if (!guestName || !guestEmail) {
        return NextResponse.json({ error: '请填写昵称和联系邮箱' }, { status: 400 })
      }
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)
      if (!emailOk) {
        return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
      }
      if (guestName.length > 50 || guestEmail.length > 100) {
        return NextResponse.json({ error: '昵称或邮箱过长' }, { status: 400 })
      }
    }

    let parentCommentId: string | null = null
    let parentCommentForNotification: {
      id: string
      content: string
      authorName: string | null
      authorEmail: string | null
      author: {
        name: string | null
        email: string | null
      } | null
    } | null = null
    if (parentId) {
      if (typeof parentId !== 'string') {
        return NextResponse.json({ error: '回复目标不合法' }, { status: 400 })
      }
      const parentComment = await prisma.comment.findFirst({
        where: {
          id: parentId,
          postId: post.id,
          status: 'APPROVED',
        },
        select: {
          id: true,
          content: true,
          authorName: true,
          authorEmail: true,
          author: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      })
      if (!parentComment) {
        return NextResponse.json({ error: '回复目标不存在或未通过审核' }, { status: 400 })
      }
      parentCommentId = parentComment.id
      parentCommentForNotification = parentComment
    }

    // 创建评论
    const shouldModerateGuest = moderationRequired ? true : guestModerationRequired
    const status = sessionUser
      ? (moderationRequired ? 'PENDING' : 'APPROVED')
      : (shouldModerateGuest ? 'PENDING' : 'APPROVED')

    const comment = await prisma.comment.create({
      data: {
        content: sanitizedContent,
        postId: post.id,
        authorId: sessionUser ? sessionUser.id : null,
        authorName: guestName,
        authorEmail: guestEmail,
        parentId: parentCommentId,
        status,
      },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        authorName: true,
        authorEmail: true,
        author: {
          select: {
            name: true,
            email: true,
            image: true,
          },
        },
        post: {
          select: {
            title: true,
            slug: true,
          },
        },
      },
    })
    sendCommentGotifyNotificationAsync(
      comment,
      logger.child({ commentId: comment.id, notification: 'gotify' })
    )
    sendCommentEmailNotificationAsync(
      comment,
      logger.child({ commentId: comment.id, notification: 'email' })
    )
    if (parentCommentForNotification) {
      sendCommentReplyEmailNotificationAsync(
        {
          ...comment,
          parent: parentCommentForNotification,
        },
        logger.child({ commentId: comment.id, notification: 'email-reply' })
      )
    }

    const responseComment = {
      id: comment.id,
      content: comment.content,
      status: comment.status,
      createdAt: comment.createdAt,
      authorName: comment.authorName,
      author: comment.author ? { name: comment.author.name, image: comment.author.image } : null,
    }

    return NextResponse.json({ comment: responseComment }, { status: 201 })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    logger.error({ err: error }, '创建评论失败')
    return NextResponse.json({ error: '创建评论失败' }, { status: 500 })
  }
}
