import { tryAcquireJob } from '@/lib/concurrency'
import { RequestBodyError, bodyErrorResponse, readJsonBody } from '@/lib/request-body'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  isClientAbortError,
  streamAdminAiChat,
  type ChatStreamEvent,
} from '@/lib/ai/chat/service'
import { normalizeChatRequestBody } from '@/lib/ai/chat/validation'
import { AiBaseUrlValidationError } from '@/lib/ai/security'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { createRequestLogger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHAT_LIMIT = {
  windowMs: 60 * 1000,
  max: 30,
}

function toClientSafeErrorMessage(error: unknown) {
  if (error instanceof AiBaseUrlValidationError) {
    return error.message
  }

  const message = error instanceof Error ? error.message : ''
  if (message === '问题至少 1 个字符' || message === '问题内容过长') {
    return message
  }
  if (message === 'AI 功能未启用' || message === 'AI API Key 未配置') {
    return message
  }
  if (message === '请先执行向量化') {
    return message
  }

  return 'AI 对话失败，请稍后重试'
}

function encodeSseEvent(event: ChatStreamEvent['event'] | 'error', payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

export async function POST(request: NextRequest) {
  const logger = createRequestLogger(request, { module: 'admin-ai-chat-stream' })
  let userId: string | null = null
  let release: (() => void) | null = null
  const abort = new AbortController()
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(120000)])
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }
    userId = session.user.id

    const limitResult = rateLimit(
      `admin-ai-chat-stream:${session.user.id}:${getClientIp(request)}`,
      CHAT_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const input = normalizeChatRequestBody(await readJsonBody(request))
    release = tryAcquireJob('ai-chat', 2)
    if (!release) return NextResponse.json({ error: '正在处理其他对话，请稍后重试' }, { status: 503, headers: { 'Retry-After': '3' } })
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false

        const close = () => {
          if (closed) return
          closed = true
          release?.()
          try {
            controller.close()
          } catch {
            // noop
          }
        }

        const sendEvent = (event: ChatStreamEvent['event'] | 'error', payload: unknown) => {
          if (closed) return
          if ((controller.desiredSize ?? 0) < -256) { abort.abort(); throw new Error('Client is not reading the response') }
          controller.enqueue(encoder.encode(encodeSseEvent(event, payload)))
        }

        void (async () => {
          try {
            await streamAdminAiChat(input, {
              signal,
              onEvent(event) {
                sendEvent(event.event, event.data)
              },
            })
            close()
          } catch (error) {
            if (request.signal.aborted || isClientAbortError(error)) {
              close()
              return
            }

            const message = toClientSafeErrorMessage(error)
            logger.error({ err: error, userId }, '后台 AI 流式对话失败')
            sendEvent('error', { error: message })
            close()
          }
        })()
      },
      cancel() {
        abort.abort()
        release?.()
      },
    })

    return new Response(stream, {
      headers: {
        ...rateLimitHeaders(limitResult),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    release?.()
    if (error instanceof RequestBodyError) return bodyErrorResponse(error)
    const message = toClientSafeErrorMessage(error)
    const status =
      message === '问题至少 1 个字符' || message === '问题内容过长'
        ? 400
        : message === 'AI 功能未启用' ||
            message === 'AI API Key 未配置' ||
            error instanceof AiBaseUrlValidationError
          ? 503
          : 500
    if (status >= 500) {
      logger.error({ err: error, userId }, '后台 AI 流式对话失败')
    }
    return NextResponse.json({ error: message }, { status })
  }
}
