'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Loader2, Menu, MessageSquarePlus, Settings2, Trash2, X } from 'lucide-react'
import { AdminAiAssistantThread } from '@/components/admin/ai/assistant-thread'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { createThreadSaveQueue, type ThreadSaveState } from '@/lib/ai/chat/thread-save-queue'

type ThreadSummary = {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  lastMessage: string
}

type ThreadDetail = {
  id: string
  title: string
  model: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

type AiSettingsPayload = {
  chatModel: string
  hasApiKey: boolean
}

function normalizeMessages(thread?: ThreadDetail) {
  return Array.isArray(thread?.messages) ? thread.messages : []
}

function resolveApiErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) {
      return error.trim()
    }
  }
  return fallback
}

function AiSettingsLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/admin/ai/settings">
        <Settings2 className="mr-2 h-4 w-4" />
        AI 设置
      </Link>
    </Button>
  )
}

export function AdminAiChatPage() {
  const { toast } = useToast()
  const [threadPage, setThreadPage] = useState(1)
  const [hasMoreThreads, setHasMoreThreads] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState('')
  const [readyThread, setReadyThread] = useState<ThreadDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [running, setRunning] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, ThreadSaveState>>({})
  const [saveQueue] = useState(() => createThreadSaveQueue((id, state) => {
    setSaveStates(previous => ({ ...previous, [id]: state }))
  }))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [creating, setCreating] = useState(false)
  const [chatModels, setChatModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini')
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const initializedRef = useRef(false)
  const threadCacheRef = useRef<Record<string, ThreadDetail>>({})
  const activateThread = useCallback((id: string) => {
    setSelectedThreadId(id)
    setReadyThread(null)
    setDetailError('')
  }, [])
  const unsaved = Object.values(saveStates).some(state => state.status !== 'saved')
  useUnsavedChanges(unsaved || running, '会话有尚未保存的内容，离开可能丢失消息，确定离开吗？')

  const fetchSettingsAndModels = useCallback(async () => {
    const settingsRes = await fetch('/api/admin/ai/settings', { cache: 'no-store' })
    const settingsData = (await settingsRes.json().catch(() => ({} as Partial<AiSettingsPayload>))) as Partial<AiSettingsPayload>
    if (!settingsRes.ok) {
      throw new Error(resolveApiErrorMessage(settingsData, '获取 AI 设置失败'))
    }

    const defaultModel =
      typeof settingsData.chatModel === 'string' && settingsData.chatModel.trim()
        ? settingsData.chatModel.trim()
        : 'gpt-4o-mini'

    setSelectedModel(defaultModel)

    if (!settingsData.hasApiKey) {
      setChatModels([defaultModel])
      return defaultModel
    }

    const modelsRes = await fetch('/api/admin/ai/models', { cache: 'no-store' })
    const modelsData = await modelsRes.json().catch(() => ({} as Record<string, unknown>))
    if (!modelsRes.ok) {
      throw new Error(resolveApiErrorMessage(modelsData, '获取模型列表失败'))
    }

    const fromApi = Array.isArray(modelsData.chatModels)
      ? modelsData.chatModels.filter((item: unknown): item is string => typeof item === 'string')
      : []

    const merged = Array.from(new Set([defaultModel, ...fromApi]))
    setChatModels(merged.length ? merged : [defaultModel])

    return defaultModel
  }, [])

  const fetchThreads = useCallback(async (page = 1) => {
    const res = await fetch(`/api/admin/ai/threads?page=${page}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) {
      throw new Error(resolveApiErrorMessage(data, '获取会话列表失败'))
    }

    const list = Array.isArray(data.threads) ? (data.threads as ThreadSummary[]) : []
    setThreads(previous => page === 1 ? list : [...previous, ...list.filter((item: ThreadSummary) => !previous.some(existing => existing.id === item.id))])
    setThreadPage(page)
    setHasMoreThreads(data.hasMore === true)
    return list
  }, [])

  const loadMoreThreads = async () => {
    setLoadingThreads(true)
    try { await fetchThreads(threadPage + 1) }
    catch { toast({ title: '加载会话失败', variant: 'destructive' }) }
    finally { setLoadingThreads(false) }
  }

  const fetchThreadDetail = useCallback(async (threadId: string, signal: AbortSignal) => {
    const id = threadId.trim()
    if (!id) return null

    const res = await fetch(`/api/admin/ai/threads/${encodeURIComponent(id)}`, { cache: 'no-store', signal })
    const data = await res.json().catch(() => ({} as { thread?: ThreadDetail }))
    if (!res.ok || data.thread?.id !== id) {
      throw new Error(resolveApiErrorMessage(data, '获取会话内容失败，请重试'))
    }
    return data.thread as ThreadDetail
  }, [])

  const createThread = useCallback(
    async (modelHint: string) => {
      if (running) return null
      setCreating(true)
      try {
        const res = await fetch('/api/admin/ai/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'New Chat',
            model: modelHint,
          }),
        })
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        if (!res.ok) {
          throw new Error(resolveApiErrorMessage(data, '创建会话失败'))
        }

        const created = data.thread
        if (!created || typeof created !== 'object') {
          throw new Error('创建会话失败')
        }

        const createdThread = created as ThreadDetail
        threadCacheRef.current[createdThread.id] = createdThread
        await fetchThreads()
        activateThread(createdThread.id)
        setMobileHistoryOpen(false)
        return createdThread
      } catch (error) {
        const message = error instanceof Error ? error.message : '创建会话失败'
        toast({
          title: '创建会话失败',
          description: message,
          variant: 'destructive',
        })
        return null
      } finally {
        setCreating(false)
      }
    },
    [activateThread, fetchThreads, running, toast]
  )

  const deleteThread = useCallback(
    async (threadId: string) => {
      const id = threadId.trim()
      if (!id || running) return
      if (saveQueue.hasPending(id)) {
        toast({ title: '请先保存会话', description: '会话仍有未保存的内容，请重试保存后再删除。', variant: 'destructive' })
        return
      }

      try {
        const response = await fetch(`/api/admin/ai/threads/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
        const payload = await response.json().catch(() => ({} as Record<string, unknown>))
        if (!response.ok) {
          throw new Error(resolveApiErrorMessage(payload, '删除会话失败'))
        }

        delete threadCacheRef.current[id]

        const nextThreads = await fetchThreads()
        if (nextThreads.length === 0) {
          const created = await createThread(selectedModel)
          if (!created) {
            activateThread('')
            setLoadError('删除后创建新会话失败，请重试')
          }
          return
        }

        if (selectedThreadId === id) {
          const fallback = nextThreads[0]
          activateThread(fallback.id)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '删除会话失败'
        toast({
          title: '删除会话失败',
          description: message,
          variant: 'destructive',
        })
      }
    },
    [activateThread, createThread, fetchThreads, running, saveQueue, selectedModel, selectedThreadId, toast]
  )

  const initializePage = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    try {
      const defaultModel = (await fetchSettingsAndModels()) || 'gpt-4o-mini'
      const list = await fetchThreads()
      if (list.length > 0) {
        const first = list[0]
        activateThread(first.id)
        return
      }

      const created = await createThread(defaultModel)
      if (!created) {
        throw new Error('初始化会话失败，请稍后重试')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载 AI 会话失败'
      setLoadError(message)
      activateThread('')
      toast({
        title: '加载失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [activateThread, createThread, fetchSettingsAndModels, fetchThreads, toast])

  useEffect(() => {
    if (initializedRef.current) {
      return
    }
    initializedRef.current = true
    void initializePage()
  }, [initializePage])

  useEffect(() => {
    const id = selectedThreadId.trim()
    if (!id) return
    let active = true
    const controller = new AbortController()

    void (async () => {
      try {
        // 未保存内容始终优先于服务端旧快照；正常切换重新读取最新历史。
        const thread = saveQueue.hasPending(id)
          ? threadCacheRef.current[id]
          : await fetchThreadDetail(id, controller.signal)
        if (!active || !thread) return
        threadCacheRef.current[id] = thread
        const model = thread.model?.trim() || 'gpt-4o-mini'
        setSelectedModel(model)
        setChatModels(previous => Array.from(new Set([model, ...previous])))
        setReadyThread(thread)
      } catch (error) {
        if (active) setDetailError(error instanceof Error ? error.message : '获取会话内容失败')
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [detailAttempt, fetchThreadDetail, saveQueue, selectedThreadId])

  const saveLocalThread = (thread: ThreadDetail) => {
    threadCacheRef.current[thread.id] = thread
    void saveQueue.update(thread.id, { model: thread.model, messages: normalizeMessages(thread) })
    const lastMessage = thread.messages[thread.messages.length - 1]?.content || ''
    const updatedAt = new Date().toISOString()
    setThreads(previous => previous.map(item => item.id === thread.id
      ? { ...item, model: thread.model, lastMessage, updatedAt }
      : item).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)))
  }

  const handleModelChange = (nextModel: string) => {
    const model = nextModel.trim()
    const existing = threadCacheRef.current[selectedThreadId]
    if (!model || !existing || running || readyThread?.id !== selectedThreadId) return
    setSelectedModel(model)
    saveLocalThread({ ...existing, model })
  }

  const handleMessagesChange = (threadId: string, messages: ThreadDetail['messages']) => {
    const existing = threadCacheRef.current[threadId]
    if (existing) saveLocalThread({ ...existing, messages })
  }

  const selectThread = (threadId: string) => {
    const id = threadId.trim()
    if (!id || running || id === selectedThreadId) return
    activateThread(id)
    setMobileHistoryOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-10rem)] min-h-0 flex-col items-center justify-center gap-4 rounded-xl border bg-background md:min-h-[680px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <AiSettingsLink />
      </div>
    )
  }

  if (!selectedThreadId) {
    return (
      <div className="flex h-[calc(100dvh-10rem)] min-h-0 items-center justify-center rounded-xl border bg-background p-4 md:min-h-[680px]">
        <div className="max-w-md space-y-3 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">加载 AI 会话失败</div>
          <div className="text-xs text-muted-foreground">
            {loadError || '未能初始化聊天会话，请重试。'}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void initializePage()
              }}
            >
              重新加载
            </Button>
            <AiSettingsLink />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100dvh-10rem)] min-h-0 overflow-hidden rounded-xl border bg-background md:min-h-[680px]">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-72 shrink-0 border-r bg-muted/30 p-4 md:flex md:flex-col">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">聊天记录</div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void createThread(selectedModel)}
              disabled={creating || running}
              aria-label="新建会话"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {threads.map((thread) => {
              const active = thread.id === selectedThreadId
              return (
                <div
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectThread(thread.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectThread(thread.id)
                    }
                  }}
                  className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
                    active ? 'border-primary/40 bg-background' : 'bg-background/60 hover:bg-background'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{thread.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {thread.lastMessage || '暂无消息'}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="删除会话"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation()
                        void deleteThread(thread.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
            {hasMoreThreads && <Button variant="ghost" disabled={loadingThreads} onClick={loadMoreThreads}>加载更多会话</Button>}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b bg-background px-3 py-2 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileHistoryOpen((prev) => !prev)}
                aria-label="切换聊天记录"
              >
                <Menu className="h-4 w-4" />
              </Button>

              <div className="min-w-[180px] max-w-[320px]">
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedModel}
                  disabled={running || readyThread?.id !== selectedThreadId}
                  onChange={(event) => handleModelChange(event.target.value)}
                >
                  {chatModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => void createThread(selectedModel)}
                disabled={creating || running}
                aria-label="新建会话"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              </Button>

              <AiSettingsLink />
            </div>
          </div>

          {mobileHistoryOpen ? (
            <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-sm font-medium">聊天记录</div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMobileHistoryOpen(false)}
                  aria-label="关闭聊天记录"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2">
                {threads.map((thread) => {
                  const active = thread.id === selectedThreadId
                  return (
                    <div
                      key={thread.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectThread(thread.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectThread(thread.id)
                        }
                      }}
                      className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? 'border-primary/40 bg-background' : 'bg-background/60 hover:bg-background'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{thread.title}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {thread.lastMessage || '暂无消息'}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="删除会话"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteThread(thread.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {hasMoreThreads && <Button variant="ghost" disabled={loadingThreads} onClick={loadMoreThreads}>加载更多会话</Button>}
              </div>
            </div>
          ) : null}

          <div className={`min-h-0 flex-1 p-3 md:p-4 ${mobileHistoryOpen ? 'hidden md:block' : ''}`}>
            <div className="flex h-full min-h-0 flex-col gap-2">
              {unsaved && (
                <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {Object.entries(saveStates).filter(([, state]) => state.status !== 'saved').map(([id, state]) => (
                    <span key={id} className="flex items-center gap-2">
                      {id === selectedThreadId ? '当前会话' : threads.find(thread => thread.id === id)?.title || '其他会话'}：
                      {state.status === 'saving' ? '正在保存…' : `未保存（${state.error}）`}
                      {state.status === 'error' && <Button size="sm" variant="outline" onClick={() => void saveQueue.retry(id)}>重试保存</Button>}
                    </span>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1">
                {readyThread?.id === selectedThreadId ? (
                  <AdminAiAssistantThread
                    key={selectedThreadId}
                    model={selectedModel}
                    initialHistory={normalizeMessages(readyThread)}
                    onMessagesChange={(messages) => handleMessagesChange(selectedThreadId, messages)}
                    onRunningChange={setRunning}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center gap-3" role="status">
                    {detailError ? <><span>{detailError}</span><Button variant="outline" onClick={() => { setDetailError(''); setDetailAttempt(value => value + 1) }}>重新加载</Button></> : <><Loader2 className="h-5 w-5 animate-spin" />正在加载会话…</>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
