import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { EmailServiceError, sendEmailTestNotification } from '@/lib/notifications/email-service'

// POST /api/admin/settings/test-email
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await readJsonBody(request)
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : '测试邮件 - 执笔为剑'
    const message = typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : '这是一封来自 执笔为剑 的 SMTP 测试通知'

    await sendEmailTestNotification({ title, message })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    console.error('邮件测试发送失败:', error)
    if (error instanceof EmailServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: '邮件发送失败，请检查 SMTP 配置' }, { status: 500 })
  }
}
