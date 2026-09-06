import { RequestBodyError } from './request-body'

export function validatePostInput(body: Record<string, unknown>, partial = false) {
  for (const [key, max, nullable] of [['title', 300, false], ['content', 900000, false], ['excerpt', 4000, true], ['coverImage', 2000, true], ['locale', 20, false], ['categoryId', 100, true]] as const) {
    const value = body[key]
    if (value === undefined && (partial || !['title', 'content'].includes(key))) continue
    if (nullable && value === null) continue
    if (typeof value !== 'string' || value.length > max || (!nullable && !value.trim())) throw new RequestBodyError(`${key} 格式错误或长度超限`, 400)
  }
  if (body.status !== undefined && !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(String(body.status))) throw new RequestBodyError('无效的文章状态', 400)
  if (body.isProtected !== undefined && typeof body.isProtected !== 'boolean') throw new RequestBodyError('加密设置格式错误', 400)
  if (body.password !== undefined && (typeof body.password !== 'string' || Buffer.byteLength(body.password) > 72)) throw new RequestBodyError('文章密码最多 72 字节', 400)
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 50 || body.tags.some(tag => typeof tag !== 'string' || tag.length > 100))) throw new RequestBodyError('标签格式错误或数量超过 50 个', 400)
  if (Array.isArray(body.tags)) body.tags = [...new Set(body.tags)]
}
