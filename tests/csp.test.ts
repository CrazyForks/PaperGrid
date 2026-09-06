import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContentSecurityPolicy } from '../src/lib/csp'

test('CSP allows React debugging only in development and preserves script restrictions', () => {
  const env: Record<string, string | undefined> = process.env
  const previousEnv = env.NODE_ENV
  try {
    for (const environment of ['development', 'production', 'test', undefined]) {
      if (environment === undefined) delete env.NODE_ENV
      else env.NODE_ENV = environment

      const policy = buildContentSecurityPolicy({
        allowUnsafeInlineScript: false,
        rawScriptOrigins: 'https://scripts.example.com/widget.js',
      })
      const scriptSrc = policy.split('; ').find(directive => directive.startsWith('script-src '))!
      assert.equal(scriptSrc.includes("'unsafe-eval'"), environment === 'development')
      assert.ok(scriptSrc.includes("'self'"))
      assert.ok(scriptSrc.includes('https://scripts.example.com'))
      assert.ok(!scriptSrc.includes("'unsafe-inline'"))
      assert.ok(policy.includes("object-src 'none'"))
    }
  } finally {
    if (previousEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previousEnv
  }
})
