import { validatePublicUrl } from '@/lib/public-network'
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
export class AiBaseUrlValidationError extends Error {}
export function normalizeAndValidateAiBaseUrl(input: string, options: { allowEmpty?: boolean } = {}) {
  const raw = input.trim()
  if (!raw) return options.allowEmpty ? '' : DEFAULT_OPENAI_BASE_URL
  if (raw.length > 2048) throw new AiBaseUrlValidationError('Base URL 过长')
  try {
    const url = validatePublicUrl(raw)
    if (url.search) throw new Error('Base URL 不允许查询参数')
    return url.toString().replace(/\/+$/, '')
  } catch { throw new AiBaseUrlValidationError('请输入有效的公网 HTTPS 地址（标准 443 端口）') }
}
