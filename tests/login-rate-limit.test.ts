import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateLimit, rateLimitLogin } from '../src/lib/rate-limit'

test('an exhausted login source cannot fill shared capacity with new accounts', () => {
  for (let index = 0; index < 12000; index++) {
    const result = rateLimitLogin('attacker', `nonexistent-${index}@example.invalid`)
    if (index >= 30) assert.equal(result.ok, false)
  }
  assert.equal(rateLimitLogin('visitor', 'visitor@example.invalid').ok, true)
  assert.equal(rateLimit('media:new-visitor', { windowMs: 60000, max: 240 }).ok, true)
})

test('account limits share a normalized identity across sources and whitespace variants', () => {
  for (let index = 0; index < 20; index++) {
    assert.equal(rateLimitLogin(`source-${index}`, ' User@Example.invalid ').ok, true)
  }
  assert.equal(rateLimitLogin('another-source', 'user@example.invalid').ok, false)
})
