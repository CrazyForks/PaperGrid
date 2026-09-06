import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPostUnlockToken, verifyPostUnlockToken } from '../src/lib/post-protection'
import { sessionStamp } from '../src/lib/session-stamp'
import { getClientIp, rateLimit } from '../src/lib/rate-limit'
import { isPublicAddress, validatePublicUrl } from '../src/lib/public-network'
import { readJsonBody, RequestBodyError } from '../src/lib/request-body'

process.env.NEXTAUTH_SECRET = 'test-only-secret-that-is-at-least-thirty-two-bytes'

test('unlock credentials expire, bind to one password and reject malformed Unicode', () => {
  const original = Date.now
  let now = original()
  Date.now = () => now
  try {
    const token = buildPostUnlockToken('post-a', 'hash-a')
    assert.equal(verifyPostUnlockToken(token, 'post-a', 'hash-a'), true)
    assert.equal(verifyPostUnlockToken(token, 'post-b', 'hash-a'), false)
    assert.equal(verifyPostUnlockToken(token, 'post-a', 'hash-b'), false)
    assert.equal(verifyPostUnlockToken('界'.repeat(token.length), 'post-a', 'hash-a'), false)
    assert.equal(verifyPostUnlockToken(token.replace(/.$/, '!'), 'post-a', 'hash-a'), false)
    now += 259201000
    assert.equal(verifyPostUnlockToken(token, 'post-a', 'hash-a'), false)
  } finally { Date.now = original }
})

test('account and privilege changes invalidate session stamps', () => {
  const user = { id: 'a', email: 'a@example.com', password: 'hash-a', role: 'ADMIN', sessionVersion: 0 }
  const stamp = sessionStamp(user)
  for (const change of [{ id: 'b' }, { password: 'hash-b' }, { email: 'b@example.com' }, { role: 'USER' }, { sessionVersion: 1 }]) {
    assert.notEqual(sessionStamp({ ...user, ...change }), stamp)
  }
  const demoted = { ...user, role: 'USER', sessionVersion: 1 }
  const restored = { ...demoted, role: 'ADMIN', sessionVersion: 2 }
  assert.notEqual(sessionStamp(restored), stamp, 'restoring a role must not restore an old session stamp')
  assert.equal(sessionStamp({ ...restored }), sessionStamp(restored), 'ordinary requests must keep the stamp stable')
})

test('untrusted proxy headers do not create a new rate-limit identity', () => {
  delete process.env.TRUSTED_PROXY_HEADER
  const request = new Request('https://blog.test', { headers: { 'x-real-ip': '1.1.1.1', 'cf-connecting-ip': '8.8.8.8' } })
  assert.equal(getClientIp(request), 'unknown')
  process.env.TRUSTED_PROXY_HEADER = 'x-real-ip'
  assert.equal(getClientIp(request), '1.1.1.1')
  delete process.env.TRUSTED_PROXY_HEADER
})

test('rate-limit storage stays closed to new keys when saturated', () => {
  const options = { max: 1, windowMs: 60000 }
  assert.equal(rateLimit('repeat', options).ok, true)
  assert.equal(rateLimit('repeat', options).ok, false)
  for (let i = 0; i < 10000; i++) rateLimit(`unique-${i}`, options)
  assert.equal(rateLimit('overflow', options).ok, false)
  assert.equal(rateLimit('repeat', options).ok, false)
})

test('outbound URL validation rejects private, encoded and mapped addresses', () => {
  for (const url of ['http://example.com', 'https://127.1', 'https://2130706433', 'https://0x7f000001',
    'https://[::1]', 'https://[::ffff:7f00:1]', 'https://[fd00::1]', 'https://10.0.0.1',
    'https://169.254.169.254', 'https://user:pass@example.com', 'https://example.com:444', 'https://service.internal']) {
    assert.throws(() => validatePublicUrl(url), Error, url)
  }
  assert.equal(validatePublicUrl('https://api.example.com/v1').hostname, 'api.example.com')
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
  assert.equal(isPublicAddress('192.168.1.1'), false)
})

test('body reader enforces actual streamed bytes without trusting Content-Length', async () => {
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"a":"' + 'x'.repeat(500) + '"}'))
    controller.close()
  } })
  const request = new Request('https://blog.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit)
  await assert.rejects(readJsonBody(request, 128), (error: unknown) => error instanceof RequestBodyError && error.status === 413)
  for (const body of ['null', '[]', '{']) {
    await assert.rejects(readJsonBody(new Request('https://blog.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body })), RequestBodyError)
  }
})
