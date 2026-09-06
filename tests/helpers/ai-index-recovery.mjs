// Runs in a fresh process against the parent test's explicitly isolated database.
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { createRequire } from 'node:module'

// The task worker is real; only bypass Next's request cache outside its server runtime.
const require = createRequire(import.meta.url)
mock.method(require('next/cache'), 'unstable_cache', callback => callback)
const { prisma } = await import('../../src/lib/prisma.ts')
const { enqueueRebuildIndexTask, getAiIndexTaskStatus } = await import('../../src/lib/ai/index-tasks.ts')

try {
  if (process.argv[2] === 'rebuild') {
    const task = await enqueueRebuildIndexTask()
    assert.equal(task.id, 'resume-rebuild')
  }
  let status
  const deadline = Date.now() + 5000
  do {
    status = await getAiIndexTaskStatus()
    if (!status.running && status.queueSize === 0) break
    await new Promise(resolve => setTimeout(resolve, 20))
  } while (Date.now() < deadline)
  assert.equal(status.running, false)
  assert.equal(status.queueSize, 0)
  assert.equal(status.recentTasks.length, 1)
  const task = status.recentTasks[0]
  assert.equal(task.id, process.argv[2] === 'rebuild' ? 'resume-rebuild' : 'resume-delete')
  if (process.argv[2] === 'rebuild') {
    // AI is deliberately disabled: reaching execution must yield a terminal error, not a stuck queue.
    assert.equal(task.status, 'failed')
    assert.match(task.error, /AI 功能未启用/)
  } else {
    assert.equal(task.status, 'succeeded')
  }
} finally {
  await prisma.$disconnect()
}
