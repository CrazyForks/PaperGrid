import { NextResponse } from 'next/server'

export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export const bodyErrorResponse = (error: RequestBodyError) => NextResponse.json(
  { error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } }
)

async function readBytes(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get('content-length'))
  if (declared > maxBytes) throw new RequestBodyError('请求内容过大', 413)
  if (!request.body) throw new RequestBodyError('请求内容为空', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let timeout: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void reader.cancel().catch(() => {})
      reject(new RequestBodyError('请求读取超时', 408))
    }, 30000)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired])
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        void reader.cancel().catch(() => {})
        throw new RequestBodyError('请求内容过大', 413)
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks, size)
  } finally {
    clearTimeout(timeout)
    reader.releaseLock()
  }
}

// Existing route payloads are validated by their domain handlers.
export async function readJsonBody(request: Request, maxBytes = 1024 * 1024) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestBodyError('请使用 application/json', 415)
  }
  const bytes = await readBytes(request, maxBytes)
  try {
    const parsed = JSON.parse(bytes.toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed
  } catch { throw new RequestBodyError('JSON 格式不正确', 400) }
}

export async function readFormBody(request: Request, maxBytes: number) {
  const bytes = await readBytes(request, maxBytes)
  try {
    return await new Request(request.url, { method: 'POST', headers: request.headers, body: bytes }).formData()
  } catch { throw new RequestBodyError('上传格式不正确', 400) }
}
