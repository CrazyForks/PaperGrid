export type ThreadSnapshot = {
  model: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type ThreadSaveState = { status: 'saving' | 'saved' | 'error'; error?: string }

export async function saveThreadSnapshot(threadId: string, snapshot: ThreadSnapshot) {
  const response = await fetch(`/api/admin/ai/threads/${encodeURIComponent(threadId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(typeof payload?.error === 'string' ? payload.error : '保存会话失败，请重试')
  }
}

// 每个会话只允许一个写请求；新快照排在旧请求之后，失败时保留最新内容供重试。
export function createThreadSaveQueue(
  onState: (threadId: string, state: ThreadSaveState) => void,
  save = saveThreadSnapshot
) {
  const entries = new Map<string, { pending?: ThreadSnapshot; running?: Promise<void> }>()

  function retry(threadId: string): Promise<void> {
    const entry = entries.get(threadId)
    if (!entry?.pending) return Promise.resolve()
    if (entry.running) return entry.running
    onState(threadId, { status: 'saving' })
    entry.running = (async () => {
      while (entry.pending) {
        const snapshot = entry.pending
        try {
          await save(threadId, snapshot)
        } catch (error) {
          onState(threadId, {
            status: 'error',
            error: error instanceof Error ? error.message : '保存会话失败，请重试',
          })
          return
        }
        if (entry.pending === snapshot) entry.pending = undefined
      }
      onState(threadId, { status: 'saved' })
    })().finally(() => { entry.running = undefined })
    return entry.running
  }

  return {
    update(threadId: string, snapshot: ThreadSnapshot) {
      const entry = entries.get(threadId) || {}
      entry.pending = structuredClone(snapshot)
      entries.set(threadId, entry)
      return retry(threadId)
    },
    retry,
    hasPending(threadId: string) { return Boolean(entries.get(threadId)?.pending) },
  }
}
