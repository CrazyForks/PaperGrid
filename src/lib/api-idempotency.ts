import { createHash, createHmac } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { RequestBodyError } from './request-body'

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
export type IdempotencyIdentity = {
  apiKeyId: string
  operation: string
  keyHash: string
  requestHash: string
}
type Client = Pick<Prisma.TransactionClient, 'apiIdempotency'>

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 50) throw new RequestBodyError('请求结构过深', 400)
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item, depth + 1)).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key], depth + 1)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function idempotencyIdentity(apiKeyId: string, key: string | null, body: unknown, rawApiKey: string): IdempotencyIdentity | undefined {
  if (key === null) return undefined
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
    throw new RequestBodyError('Idempotency-Key 须为 1–128 位字母、数字或 . _ : -', 400)
  }
  return {
    apiKeyId, operation: 'posts.create',
    keyHash: createHash('sha256').update(key).digest('hex'),
    // Do not store payloads/passwords or an unkeyed password-guessing fingerprint.
    requestHash: createHmac('sha256', rawApiKey).update(canonicalJson(body)).digest('hex'),
  }
}

export async function readIdempotentResult<T>(client: Client, identity?: IdempotencyIdentity): Promise<T | null> {
  if (!identity) return null
  const { apiKeyId, operation, keyHash, requestHash } = identity
  const record = await client.apiIdempotency.findUnique({ where: { apiKeyId_operation_keyHash: { apiKeyId, operation, keyHash } } })
  if (!record || record.expiresAt.getTime() <= Date.now()) return null
  if (record.requestHash !== requestHash) throw new RequestBodyError('该 Idempotency-Key 已用于不同的请求内容', 409)
  return record.response as T
}

// Run inside the same transaction as article creation, including media links.
export async function withIdempotency<T>(client: Client, identity: IdempotencyIdentity | undefined, create: () => Promise<T>): Promise<T> {
  if (!identity) return create()
  const cached = await readIdempotentResult<T>(client, identity)
  if (cached !== null) return cached
  const { apiKeyId, operation, keyHash } = identity
  await client.apiIdempotency.deleteMany({ where: { apiKeyId, operation, keyHash, expiresAt: { lte: new Date() } } })
  const result = await create()
  await client.apiIdempotency.create({ data: {
    ...identity, response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
    expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
  } })
  // Bounded opportunistic cleanup avoids retaining expired response snapshots.
  const expired = await client.apiIdempotency.findMany({ where: { expiresAt: { lte: new Date() } }, take: 100, select: { id: true } })
  if (expired.length) await client.apiIdempotency.deleteMany({ where: { id: { in: expired.map(item => item.id) } } })
  return result
}
