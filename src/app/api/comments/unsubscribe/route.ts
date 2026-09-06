import { revalidateForUpdatedSettings } from '@/lib/settings-revalidate'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'
import { verifyReplyUnsubscribeToken } from '@/lib/notifications/email-reply-unsubscribe'

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function parseEmailList(raw: string): string[] {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return raw
    .split(/[,\n;\s]+/)
    .map((item) => normalizeEmail(item))
    .filter((item) => emailRegex.test(item))
}

function html(message: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>邮件退订</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f7fb; margin: 0; padding: 24px; color: #111827; }
      .card { max-width: 560px; margin: 8vh auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      h1 { margin: 0 0 12px; font-size: 20px; }
      p { margin: 0; line-height: 1.6; color: #374151; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>评论回复通知退订</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const emailRaw = searchParams.get('email') || ''
    const token = searchParams.get('token') || ''
    const enabledRaw = await getSetting<boolean>('email.reply.unsubscribeEnabled', true)
    const unsubscribeEnabled = enabledRaw ?? true

    if (!unsubscribeEnabled) {
      return new NextResponse(html('站点已关闭邮件退订入口，请联系管理员。'), {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const email = normalizeEmail(emailRaw)
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailOk || !verifyReplyUnsubscribeToken(email, token)) {
      return new NextResponse(html('退订链接无效或已过期。'), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    await prisma.$transaction(async (tx) => {
      const current = await tx.setting.findUnique({ where: { key: 'email.reply.unsubscribeList' } })
      const value = current?.value as Record<string, unknown> | undefined
      const raw = value ? Object.values(value)[0] : ''
      const merged = new Set<string>(parseEmailList(typeof raw === 'string' ? raw : ''))
      merged.add(email)
      const data = { value: { text: Array.from(merged).join('\n') }, group: 'email', editable: false, secret: true }
      await tx.setting.upsert({ where: { key: 'email.reply.unsubscribeList' }, update: data,
        create: { key: 'email.reply.unsubscribeList', ...data } })
    })
    revalidateForUpdatedSettings(['email.reply.unsubscribeList'])

    return new NextResponse(html('已成功退订评论回复邮件通知。'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('邮件退订失败:', error)
    return new NextResponse(html('退订失败，请稍后重试。'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
