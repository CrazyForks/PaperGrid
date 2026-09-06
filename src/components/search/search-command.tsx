'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { TriangleLoader } from '@/components/loading/triangle-loader'
import { Search, FileText, Folder, Hash, X, Lock, ArrowUpRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface SearchResult {
  type: 'post' | 'category' | 'tag'
  title?: string
  name?: string
  slug: string
  excerpt?: string
  url: string
  postCount?: number
  category?: string
  isProtected?: boolean
}
interface SearchResults {
  posts: SearchResult[]
  categories: SearchResult[]
  tags: SearchResult[]
  stats: { total: number; postsCount: number; categoriesCount: number; tagsCount: number }
}
const tabs = [
  { key: 'all', label: '全部' },
  { key: 'posts', label: '文章' },
  { key: 'categories', label: '分类' },
  { key: 'tags', label: '标签' },
] as const
export function SearchCommand({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState(0)
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('all')
  const items = useMemo(
    () =>
      results
        ? tab === 'all'
          ? [...results.posts, ...results.categories, ...results.tags]
          : results[tab]
        : [],
    [results, tab]
  )
  useEffect(() => {
    const controller = new AbortController()
    setResults(null)
    setError('')
    setSelected(0)
    if (!open || query.trim().length < 2) {
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '暂时无法搜索，请稍后重试。')
        if (!controller.signal.aborted) setResults({ ...data.results, stats: data.stats })
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '搜索失败，请重试。')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open, retry])
  useEffect(() => {
    if (items.length)
      document.getElementById(`${id}-result-${selected}`)?.scrollIntoView({ block: 'nearest' })
  }, [selected, items.length, id])
  const select = (item: SearchResult) => {
    onOpenChange(false)
    router.push(item.url)
  }
  const keydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || !items.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected(
        (value) => (value + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
      )
    } else if (event.key === 'Enter' && items[selected]) {
      event.preventDefault()
      select(items[selected])
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ba-search-dialog max-md:translate-y-0"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          input.current?.focus()
        }}
      >
        <header className="ba-search-heading">
          <div>
            <span>SEARCH</span>
            <DialogTitle>搜索手记</DialogTitle>
          </div>
          <button
            className="ba-icon-button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭搜索"
          >
            <X size={21} />
          </button>
        </header>
        <DialogDescription className="sr-only">
          输入至少两个字符，搜索文章、分类和标签。方向键选择结果，回车打开。
        </DialogDescription>
        <div className="ba-search-field">
          <Search size={21} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={keydown}
            maxLength={100}
            placeholder="输入文章、分类或标签…"
            role="combobox"
            aria-label="搜索关键词"
            aria-expanded={items.length > 0}
            aria-controls={`${id}-results`}
            aria-autocomplete="list"
            aria-activedescendant={items.length ? `${id}-result-${selected}` : undefined}
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                input.current?.focus()
              }}
              aria-label="清空关键词"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="ba-search-tabs" aria-label="搜索范围">
          {tabs.map((item) => (
            <button
              key={item.key}
              aria-pressed={tab === item.key}
              onClick={() => {
                setTab(item.key)
                setSelected(0)
              }}
            >
              {item.label}
              {results && (
                <span>{item.key === 'all' ? results.stats.total : results[item.key].length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="ba-search-results" aria-busy={loading}>
          {loading && (
            <p className="ba-search-empty" role="status">
              <TriangleLoader />
              正在查找…
            </p>
          )}
          {!loading && error && (
            <div className="ba-search-empty" role="alert">
              <p>{error}</p>
              <button
                className="ba-secondary-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                重新搜索
              </button>
            </div>
          )}
          {!loading && !error && query.trim().length < 2 && (
            <div className="ba-search-empty">
              <Search size={30} />
              <p>想找哪篇文章？</p>
              <small>输入至少两个字符，也可以搜索分类与标签。</small>
            </div>
          )}
          {!loading && !error && results && !items.length && (
            <div className="ba-search-empty" role="status">
              <p>
                没有找到相关
                {tabs.find((item) => item.key === tab)?.label === '全部'
                  ? '内容'
                  : tabs.find((item) => item.key === tab)?.label}
              </p>
              <small>试试更短的关键词，或切换搜索范围。</small>
            </div>
          )}
          <div id={`${id}-results`} role="listbox" aria-label="搜索结果">
            {items.map((item, index) => {
              const Icon =
                item.type === 'post' ? FileText : item.type === 'category' ? Folder : Hash
              return (
                <button
                  key={`${item.type}-${item.slug}`}
                  id={`${id}-result-${index}`}
                  role="option"
                  aria-selected={selected === index}
                  className="ba-search-result"
                  onPointerMove={() => setSelected(index)}
                  onClick={() => select(item)}
                  tabIndex={-1}
                >
                  <span className="ba-search-result-icon">
                    <Icon size={20} />
                  </span>
                  <span className="ba-search-result-copy">
                    <strong>{item.title || item.name}</strong>
                    {item.excerpt && <small>{item.excerpt}</small>}
                    <span>
                      {item.type === 'post'
                        ? item.category || '文章'
                        : `${item.postCount || 0} 篇文章`}
                      {item.isProtected && (
                        <>
                          <Lock size={12} />
                          加密
                        </>
                      )}
                    </span>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              )
            })}
          </div>
        </div>
        <footer className="ba-search-footer">
          <span>
            <kbd>↑↓</kbd> 选择 <kbd>Enter</kbd> 打开
          </span>
          <span>
            <kbd>Esc</kbd> 关闭
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
