import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { proxy } from '../src/proxy'

test('development accepts the actual host while retaining cross-origin protection', async () => {
  const env: Record<string, string | undefined> = process.env
  const previous = { NODE_ENV: env.NODE_ENV, NEXTAUTH_URL: env.NEXTAUTH_URL }
  const request = (host: string, origin: string, site = 'same-origin') => new NextRequest(
    'http://localhost:3000/api/auth/callback/credentials',
    { method: 'POST', headers: { host, origin, 'sec-fetch-site': site } },
  )
  try {
    env.NODE_ENV = 'development'
    env.NEXTAUTH_URL = 'http://localhost:3000'
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', '192.168.1.20:3001']) {
      assert.equal(proxy(request(host, `http://${host}`)).headers.get('x-middleware-next'), '1')
    }
    for (const [origin, site] of [
      ['https://external.example', 'cross-site'],
      ['http://localhost:3001', 'same-site'],
      ['http://localhost:3000', 'cross-site'],
      ['null', 'same-origin'],
    ]) {
      const response = proxy(request('localhost:3000', origin, site))
      assert.equal(response.status, 403)
      assert.deepEqual(await response.json(), { error: '不允许跨站请求' })
    }

    env.NODE_ENV = 'production'
    env.NEXTAUTH_URL = 'https://blog.example.com'
    assert.equal(proxy(request('127.0.0.1:3000', 'https://blog.example.com')).status, 200)
    assert.equal(proxy(request('127.0.0.1:3000', 'http://127.0.0.1:3000')).status, 403)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
  }
})
