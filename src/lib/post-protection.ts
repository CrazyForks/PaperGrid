import { createHmac, timingSafeEqual } from 'node:crypto'

export const POST_UNLOCK_MAX_AGE = 60 * 60 * 24 * 3
export const postUnlockCookieName = (postId: string) => `pg_unlock_${postId}`

function secret() {
  const value = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.APP_SECRET
  if (!value || value.length < 32) throw new Error('A strong authentication secret is required')
  return value
}

function signature(postId: string, passwordHash: string, expiry: number) {
  return createHmac('sha256', secret()).update(`v2:${postId}:${passwordHash}:${expiry}`).digest('base64url')
}

export function buildPostUnlockToken(postId: string, passwordHash: string) {
  const expiry = Math.floor(Date.now() / 1000) + POST_UNLOCK_MAX_AGE
  return `v2.${expiry}.${signature(postId, passwordHash, expiry)}`
}

export function verifyPostUnlockToken(token: string, postId: string, passwordHash: string) {
  if (!passwordHash || !/^v2\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(token)) return false
  const [, rawExpiry, mac] = token.split('.')
  const expiry = Number(rawExpiry)
  const now = Math.floor(Date.now() / 1000)
  if (expiry <= now || expiry > now + POST_UNLOCK_MAX_AGE) return false
  const expected = signature(postId, passwordHash, expiry)
  return timingSafeEqual(Buffer.from(mac, 'ascii'), Buffer.from(expected, 'ascii'))
}

export function getPostUnlockTokenFromHeaders(headers: Headers, postId?: string) {
  const authorization = headers.get('authorization') || ''
  const bearer = authorization.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (bearer) return bearer
  const fallback = headers.get('x-post-unlock-token')?.trim()
  if (fallback) return fallback
  if (postId) {
    const prefix = `${postUnlockCookieName(postId)}=`
    return headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length) || ''
  }
  return ''
}
