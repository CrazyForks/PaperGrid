'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import Image from 'next/image'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

type MediaFile = {
  id: string
  originalName: string
  ext: string
  size: number
  width: number | null
  height: number | null
  createdAt: string
  url: string
}

type Props = {
  onSelect: (url: string) => void
  triggerText?: string
  title?: string
  disabled?: boolean
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export function ImagePickerDialog({
  onSelect,
  triggerText = '从文件管理选择',
  title = '选择图片',
  disabled,
}: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalFiles, setTotalFiles] = useState(0)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [query, setQuery] = useState('')

  const trimmedQuery = useMemo(() => query.trim(), [query])

  const latestRequest = useRef(0)
  const loadFiles = useCallback(async (q = '') => {
    const sequence = ++latestRequest.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ kind: 'images', limit: '24', page: String(page) })
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/files?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (sequence !== latestRequest.current) return
      if (!res.ok) {
        throw new Error(data.error || '加载图片失败')
      }
      if (page > (data.pagination?.totalPages || 1)) { setPage(data.pagination?.totalPages || 1); return }
      setFiles(data.files || [])
      setTotalPages(data.pagination?.totalPages || 1)
      setTotalFiles(data.pagination?.total || 0)
    } catch (error) {
      if (sequence !== latestRequest.current) return
      console.error('加载图片失败:', error)
      toast({ title: '错误', description: '加载图片失败', variant: 'destructive' })
    } finally {
      if (sequence === latestRequest.current) setLoading(false)
    }
  }, [toast, page])

  useEffect(() => {
    if (!open) return

    const delay = trimmedQuery ? 300 : 0
    const timer = window.setTimeout(() => {
      loadFiles(trimmedQuery)
    }, delay)

    return () => {
      window.clearTimeout(timer)
    }
  }, [trimmedQuery, open, loadFiles])

  const handleSelect = (url: string) => {
    onSelect(url)
    setOpen(false)
    toast({ title: '已选择', description: '已回填图片 URL' })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" type="button" disabled={disabled}>
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>支持按文件名检索，选中后自动回填图片 URL。</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件名"
          />
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-md border p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : files.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">暂无可选图片</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((file) => (
                <div key={file.id} className="overflow-hidden rounded-lg border bg-card">
                  <div className="relative aspect-video overflow-hidden bg-gray-100 dark:bg-gray-900">
                    <Image
                      unoptimized
                      src={file.url}
                      alt={file.originalName}
                      fill
                      sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-1 text-sm font-medium" title={file.originalName}>{file.originalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.width && file.height ? `${file.width} × ${file.height}` : '未知尺寸'} · {formatBytes(file.size)} · {file.ext.toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(file.createdAt).toLocaleString('zh-CN')}</p>
                    <Button className="w-full" size="sm" onClick={() => handleSelect(file.url)}>
                      选择该图片
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <PaginationControls page={page} totalPages={totalPages} onChange={setPage} disabled={loading} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
