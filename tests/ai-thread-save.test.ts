import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createThreadSaveQueue, saveThreadSnapshot, type ThreadSaveState, type ThreadSnapshot } from '../src/lib/ai/chat/thread-save-queue'

const snapshot = (content: string): ThreadSnapshot => ({ model: 'test-model', messages: [{ role: 'user', content }] })

test('会话保存检查 HTTP 错误，网络失败不会被误判为已保存', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const status of [401, 429, 500]) {
      globalThis.fetch = async () => Response.json({ error: '模拟保存失败' }, { status })
      await assert.rejects(saveThreadSnapshot('thread', snapshot('message')), /模拟保存失败/)
    }
    globalThis.fetch = async () => { throw new Error('offline') }
    await assert.rejects(saveThreadSnapshot('thread', snapshot('message')), /offline/)
    globalThis.fetch = async () => Response.json({ ok: true })
    await saveThreadSnapshot('thread', snapshot('message'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('保存失败保留最新消息，并能显式重试相同快照', async () => {
  const states: ThreadSaveState[] = []
  const writes: ThreadSnapshot[] = []
  const queue = createThreadSaveQueue((_, state) => states.push(state), async (_, value) => {
    writes.push(value)
    if (writes.length === 1) throw new Error('offline')
  })
  await queue.update('a', snapshot('不能丢失的回答'))
  assert.equal(queue.hasPending('a'), true)
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.some(state => state.status === 'saved'), false)
  await queue.retry('a')
  assert.deepEqual(writes[1], writes[0])
  assert.equal(queue.hasPending('a'), false)
  assert.equal(states.at(-1)?.status, 'saved')
})

test('同一会话串行写入：旧请求完成不能覆盖新模型或新消息', async () => {
  let release!: () => void
  const firstWrite = new Promise<void>(resolve => { release = resolve })
  const writes: ThreadSnapshot[] = []
  const states: ThreadSaveState[] = []
  const queue = createThreadSaveQueue((_, state) => states.push(state), async (_, value) => {
    writes.push(value)
    if (writes.length === 1) await firstWrite
  })
  const pending = queue.update('a', snapshot('旧消息'))
  const newest = { ...snapshot('新消息'), model: 'new-model' }
  const next = queue.update('a', newest)
  newest.messages[0].content = '调用方后续修改不应改变已排队快照'
  assert.equal(writes.length, 1)
  assert.equal(queue.hasPending('a'), true)
  release()
  await Promise.all([pending, next])
  assert.deepEqual(writes[1], { ...snapshot('新消息'), model: 'new-model' })
  assert.equal(states.filter(state => state.status === 'saved').length, 1)
  assert.equal(queue.hasPending('a'), false)
})

test('切换会话后重试独立保存原会话，不写入当前会话', async () => {
  const writes: Array<{ id: string; value: ThreadSnapshot }> = []
  let failA = true
  const queue = createThreadSaveQueue(() => {}, async (id, value) => {
    if (id === 'a' && failA) throw new Error('a failed')
    writes.push({ id, value })
  })
  await queue.update('a', snapshot('会话 A'))
  await queue.update('b', snapshot('会话 B'))
  assert.equal(queue.hasPending('a'), true)
  assert.equal(queue.hasPending('b'), false)
  failA = false
  await queue.retry('a')
  assert.deepEqual(writes, [{ id: 'b', value: snapshot('会话 B') }, { id: 'a', value: snapshot('会话 A') }])
})
