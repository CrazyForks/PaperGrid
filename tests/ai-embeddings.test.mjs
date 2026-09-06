import assert from 'node:assert/strict'
import { test } from 'node:test'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { AI_DEFAULTS } from '../src/lib/ai/config.ts'
import { runOpenAiCompatibleEmbeddings } from '../src/lib/ai/provider.ts'
import { getRebuildTaskError, getRecentAiIndexTasks } from '../src/lib/ai/index-tasks.ts'

const settings = {
  ...AI_DEFAULTS, enabled: true, apiKey: 'test-only', hasApiKey: true,
  baseUrl: 'https://embedding.example.com/v1',
  embeddingModel: 'BAAI/bge-m3', embeddingDimensions: 1024,
}
const success = { data: [{ embedding: Array(1024).fill(0.25) }] }
const invalid = { error: { message: 'The parameter is invalid. Please check again.' } }

function mockProvider(t, respond) {
  const calls = []
  const mocked = t.mock.method(https, 'request', (url, _options, callback) => {
    const request = new EventEmitter()
    request.end = body => {
      const payload = JSON.parse(body.toString())
      calls.push({ url: String(url), payload })
      const { status, data } = respond(payload, calls.length)
      const response = new PassThrough()
      response.statusCode = status
      response.headers = { 'content-type': 'application/json' }
      callback(response)
      response.end(JSON.stringify(data))
    }
    return request
  })
  syncBuiltinESMExports()
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports() })
  return calls
}

test('BGE-M3 使用完整模型名和原生 1024 维，兼容拒绝 dimensions 的接口', async t => {
  const calls = mockProvider(t, body => 'dimensions' in body
    ? { status: 400, data: invalid } : { status: 200, data: success })
  for (const embeddingModel of ['BAAI/bge-m3', 'Pro/BAAI/bge-m3']) {
    const vectors = await runOpenAiCompatibleEmbeddings({ texts: ['测试文章'], settings: { ...settings, embeddingModel } })
    assert.equal(vectors[0].length, 1024)
    assert.deepEqual(calls.at(-1), {
      url: 'https://embedding.example.com/v1/embeddings',
      payload: { model: embeddingModel, input: ['测试文章'], encoding_format: 'float' },
    })
  }
  assert.equal(calls.length, 2)
})

test('其他模型保留维度参数，遇到通用参数错误仅降级重试一次', async t => {
  const calls = mockProvider(t, body => 'dimensions' in body
    ? { status: 400, data: invalid } : { status: 200, data: success })
  const vectors = await runOpenAiCompatibleEmbeddings({ texts: ['查询'], settings: { ...settings, embeddingModel: 'custom-embedding' } })
  assert.equal(vectors[0].length, 1024)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].payload.dimensions, 1024)
  assert.equal('dimensions' in calls[1].payload, false)
})

test('支持维度的模型只请求一次', async t => {
  const calls = mockProvider(t, () => ({ status: 200, data: success }))
  await runOpenAiCompatibleEmbeddings({ texts: ['查询'], settings: { ...settings, embeddingModel: 'text-embedding-3-small' } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.dimensions, 1024)
})

test('无效密钥不重试，持续参数错误不会伪装成功或无限重试', async t => {
  let status = 401
  const calls = mockProvider(t, () => ({ status, data: invalid }))
  const input = { texts: ['查询'], settings: { ...settings, embeddingModel: 'custom-embedding' } }
  await assert.rejects(runOpenAiCompatibleEmbeddings(input), /parameter is invalid/)
  assert.equal(calls.length, 1)
  status = 400
  await assert.rejects(runOpenAiCompatibleEmbeddings(input), /parameter is invalid/)
  assert.equal(calls.length, 3)
})

test('全部或部分重建失败都返回失败原因，成功和空索引保持成功', () => {
  for (const indexed of [0, 2]) {
    assert.match(getRebuildTaskError({ indexed, failed: 1, errors: [{ error: '参数错误' }] }), /1 篇文章失败：参数错误/)
  }
  assert.equal(getRebuildTaskError({ indexed: 2, failed: 0 }), null)
  assert.equal(getRebuildTaskError({ indexed: 0, failed: 0 }), null)
  assert.equal(getRebuildTaskError(null), null)
})

test('旧的重建记录即使标为 succeeded，有失败文档也必须向前端报告 failed', () => {
  const history = globalThis.__papergridAiIndexTaskHistory
  const original = history.slice()
  try {
    history.splice(0, history.length, {
      id: 'legacy-rebuild', type: 'rebuild', status: 'succeeded', source: 'manual',
      result: { indexed: 1, failed: 2, errors: [{ error: '参数错误' }] },
    })
    const task = getRecentAiIndexTasks()[0]
    assert.equal(task.status, 'failed')
    assert.match(task.error, /2 篇文章失败：参数错误/)
    assert.equal(task.result.indexed, 1)
  } finally { history.splice(0, history.length, ...original) }
})
