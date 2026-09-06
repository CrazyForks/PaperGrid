import { RequestBodyError } from './request-body'
import { isValidSlug } from './slug'

export function validateTaxonomyInput(body: Record<string, unknown>, partial = false) {
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) {
      throw new RequestBodyError('名称不能为空且最多 120 个字符', 400)
    }
    body.name = body.name.trim()
  }
  if ((!partial || body.slug !== undefined) && !isValidSlug(body.slug)) {
    throw new RequestBodyError('Slug 须为 1–200 个字符，仅支持文字、数字、连字符和下划线', 400)
  }
  if (body.description !== undefined && body.description !== null &&
      (typeof body.description !== 'string' || body.description.length > 4000)) {
    throw new RequestBodyError('描述格式错误或长度超限', 400)
  }
}
