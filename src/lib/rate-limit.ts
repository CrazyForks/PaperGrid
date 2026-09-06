import { isIP } from 'node:net'

type Bucket = {
  tokens: number
  lastRefill: number
  lastSeen: number
  windowMs: number
}

export type RateLimitOptions = {
  windowMs: number
  max: number
}

export type RateLimitResult = {
  ok: boolean
  limit: number
  remaining: number
  reset: number
  retryAfter: number
}

type RateLimitStore = Map<string, Bucket>

const globalStore = globalThis as typeof globalThis & {
  __rateLimitBuckets?: RateLimitStore
}

const store: RateLimitStore = globalStore.__rateLimitBuckets ?? new Map()
if (!globalStore.__rateLimitBuckets) {
  globalStore.__rateLimitBuckets = store
}

const MAX_BUCKETS = 10000
let nextCleanup = 0
function cleanupStore(now: number) {
  if (now < nextCleanup) return
  nextCleanup = now + 30000
  for (const [key, bucket] of store) {
    if (now - bucket.lastSeen > bucket.windowMs * 2) store.delete(key)
  }
}

function normalizeIp(raw: string | null): string | null {
  if (!raw) return null

  const [first] = raw.split(',')
  const candidate = first?.trim()
  if (!candidate) return null

  const bracket = candidate.match(/^\[([^\]]+)\](?::\d+)?$/)
  const unwrapped = bracket ? bracket[1] : candidate
  const ipv4Mapped = unwrapped.startsWith('::ffff:') ? unwrapped.slice(7) : unwrapped

  return isIP(ipv4Mapped) === 0 ? null : ipv4Mapped
}

export function getClientIp(request: Request): string {
  // Only trust a header explicitly overwritten by the deployment's proxy.
  const header = process.env.TRUSTED_PROXY_HEADER?.toLowerCase()
  if (header && ['x-real-ip', 'cf-connecting-ip'].includes(header)) {
    return normalizeIp(request.headers.get(header)) || 'unknown'
  }
  return 'unknown'
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const { windowMs, max } = options
  cleanupStore(now)
  if (!store.has(key) && store.size >= MAX_BUCKETS) {
    return { ok: false, limit: max, remaining: 0, reset: Math.ceil((now + 30000) / 1000), retryAfter: 30 }
  }
  const refillRate = max / windowMs

  const bucket = store.get(key) ?? {
    tokens: max,
    lastRefill: now,
    lastSeen: now,
    windowMs,
  }

  const elapsed = now - bucket.lastRefill
  if (elapsed > 0) {
    const refill = elapsed * refillRate
    bucket.tokens = Math.min(max, bucket.tokens + refill)
    bucket.lastRefill = now
  }

  bucket.lastSeen = now

  let ok = true
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
  } else {
    ok = false
  }

  store.set(key, bucket)


  const remaining = Math.max(0, Math.floor(bucket.tokens))
  const resetMs = (max - bucket.tokens) / refillRate
  const reset = Math.ceil((now + resetMs) / 1000)
  const retryAfterMs = Math.max(0, (1 - bucket.tokens) / refillRate)
  const retryAfter = ok ? 0 : Math.ceil(retryAfterMs / 1000)

  return {
    ok,
    limit: max,
    remaining,
    reset,
    retryAfter,
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.reset),
  }
  if (result.retryAfter > 0) {
    headers['Retry-After'] = String(result.retryAfter)
  }
  return headers
}

export function rateLimitLogin(clientIp: string, email: string): RateLimitResult {
  const source = rateLimit(`login:${clientIp}`, { windowMs: 5 * 60 * 1000, max: 30 })
  // Do not allocate account buckets for a source that has already exhausted its limit.
  if (!source.ok) return source
  return rateLimit(`login-account:${email.trim().toLowerCase()}`, {
    windowMs: 5 * 60 * 1000,
    max: 20,
  })
}
