import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { after, NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'
import {
  sendCommentReplyEmailNotification,
  type CommentReplyEmailNotificationInput,
} from '@/lib/notifications/email-service'

const ALLOWED_COMMENT_STATUS = ['APPROVED', 'PENDING', 'SPAM', 'REJECTED'] as const
type AllowedCommentStatus = (typeof ALLOWED_COMMENT_STATUS)[number]

function sendCommentReplyEmailNotificationAsync(input: CommentReplyEmailNotificationInput) {
  after(async () => {
    try {
      await sendCommentReplyEmailNotification(input)
    } catch (notifyError) {
      console.error('审核通过后邮件回复通知发送失败:', notifyError)
    }
  })
}

// PATCH /api/admin/comments/[id] - 更新评论状态
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params
    const body = await readJsonBody(request)
    const { status } = body

    if (typeof status !== 'string' || !ALLOWED_COMMENT_STATUS.includes(status as AllowedCommentStatus)) {
      return NextResponse.json({ error: '无效的状态值' }, { status: 400 })
    }
    const nextStatus = status as AllowedCommentStatus

    const [originalComment, comment] = await prisma.$transaction(async (tx) => {
      const original = await tx.comment.findUnique({
        where: { id },
        select: {
          status: true,
          parentId: true,
        },
      })
      if (!original) return [null, null] as const

      const updated = await tx.comment.update({
        where: { id },
        data: { status: nextStatus },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          post: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
      })

      return [original, updated] as const
    })

    if (!originalComment || !comment) {
      return NextResponse.json({ error: '评论不存在' }, { status: 404 })
    }

    const shouldNotifyReplyAfterApproved = Boolean(
      originalComment.parentId
      && originalComment.status !== 'APPROVED'
      && nextStatus === 'APPROVED'
    )

    if (shouldNotifyReplyAfterApproved) {
      const requireApproved = (await getSetting<boolean>('email.reply.requireApproved', true)) ?? true

      if (requireApproved) {
        const replyComment = await prisma.comment.findUnique({
          where: { id: comment.id },
          select: {
            id: true,
            status: true,
            content: true,
            createdAt: true,
            authorName: true,
            authorEmail: true,
            author: {
              select: {
                name: true,
                email: true,
              },
            },
            post: {
              select: {
                title: true,
                slug: true,
              },
            },
            parent: {
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
            },
          },
        })

        if (replyComment?.parent) {
          sendCommentReplyEmailNotificationAsync({
            id: replyComment.id,
            status: replyComment.status,
            content: replyComment.content,
            createdAt: replyComment.createdAt,
            authorName: replyComment.authorName,
            authorEmail: replyComment.authorEmail,
            author: replyComment.author,
            post: replyComment.post,
            parent: replyComment.parent,
          })
        }
      }
    }

    return NextResponse.json({ comment })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('更新评论失败:', error)
    return NextResponse.json({ error: '更新评论失败' }, { status: 500 })
  }
}

// DELETE /api/admin/comments/[id] - 删除评论
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params

    await prisma.comment.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('删除评论失败:', error)
    return NextResponse.json({ error: '删除评论失败' }, { status: 500 })
  }
}
