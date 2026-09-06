'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, FileText, Eye, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import Image from 'next/image'
import { useToast } from '@/hooks/use-toast'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type CompressionMode = 'ORIGINAL' | 'BALANCED' | 'HIGH'

type MediaFile = {
  id: string
  originalName: string
  mimeType: string
  ext: string
  size: number
  width: number | null
  height: number | null
  compressionMode: CompressionMode
  createdAt: string
  uploadedBy: {
    id: string
    name: string | null
    email: string | null
  } | null
  url: string
}

type FileReferences = {
  posts: number
  projects: number
  users: number
  settings: string[]
  total: number
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export default function AdminFilesPage() {
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalFiles, setTotalFiles] = useState(0)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [compressionMode, setCompressionMode] = useState<CompressionMode>('BALANCED')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [maxUploadBytes, setMaxUploadBytes] = useState<number>(10 * 1024 * 1024)
  const [inUseDialogOpen, setInUseDialogOpen] = useState(false)
  const [inUseFile, setInUseFile] = useState<MediaFile | null>(null)
  const [inUseRefs, setInUseRefs] = useState<FileReferences | null>(null)

  const maxUploadLabel = useMemo(() => formatBytes(maxUploadBytes), [maxUploadBytes])

  const latestRequest = useRef(0)
  const loadFiles = useCallback(async () => {
    const sequence = ++latestRequest.current
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/files?limit=24&page=${page}`, { cache: 'no-store' })
      const data = await res.json()
      if (sequence !== latestRequest.current) return
      if (!res.ok) {
        throw new Error(data.error || '加载文件失败')
      }
      if (page > (data.pagination?.totalPages || 1)) { setPage(data.pagination?.totalPages || 1); return }
      setFiles(data.files || [])
      setTotalPages(data.pagination?.totalPages || 1)
      setTotalFiles(data.pagination?.total || 0)
      if (typeof data?.limits?.maxUploadBytes === 'number') {
        setMaxUploadBytes(data.limits.maxUploadBytes)
      }
    } catch (error) {
      if (sequence !== latestRequest.current) return
      console.error('加载文件失败:', error)
      toast({ title: '错误', description: '加载文件失败', variant: 'destructive' })
    } finally {
      if (sequence === latestRequest.current) setLoading(false)
    }
  }, [toast, page])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({ title: '提示', description: '请先选择文件', variant: 'destructive' })
      return
    }

    if (selectedFile.size > maxUploadBytes) {
      toast({ title: '提示', description: `文件超过 ${maxUploadLabel} 限制`, variant: 'destructive' })
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('compressionMode', compressionMode)

      const res = await fetch('/api/admin/files', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '上传失败')
      }

      setSelectedFile(null)
      const input = document.getElementById('upload-file-input') as HTMLInputElement | null
      if (input) {
        input.value = ''
      }

      toast({ title: '成功', description: '文件上传成功' })
      if (page === 1) await loadFiles()
      else setPage(1)
    } catch (error) {
      console.error('上传失败:', error)
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '上传失败',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: '已复制', description: '图片 URL 已复制到剪贴板' })
    } catch {
      toast({ title: '复制失败', description: '请手动复制图片 URL', variant: 'destructive' })
    }
  }

  const handleDelete = async (file: MediaFile, force = false) => {
    try {
      setDeletingId(file.id)
      const res = await fetch(`/api/admin/files/${file.id}${force ? '?force=1' : ''}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (res.status === 409 && !force) {
        const refs = data?.references as FileReferences | undefined
        setInUseFile(file)
        setInUseRefs({
          posts: refs?.posts || 0,
          projects: refs?.projects || 0,
          users: refs?.users || 0,
          settings: refs?.settings || [],
          total: refs?.total || 0,
        })
        setInUseDialogOpen(true)
        return
      }

      if (!res.ok) {
        throw new Error(data.error || '删除失败')
      }

      if (files.length === 1 && page > 1) setPage(page - 1)
      else await loadFiles()
      toast({ title: '成功', description: '文件已删除' })
    } catch (error) {
      console.error('删除失败:', error)
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除失败',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }


  const handleForceDelete = async () => {
    if (!inUseFile) return
    setInUseDialogOpen(false)
    await handleDelete(inUseFile, true)
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">文件管理</h1>
          <p className="text-muted-foreground">仅支持图片上传（JPG/PNG/WebP/AVIF），游客仅可查看。</p>
        </div>
        <Button variant="outline" onClick={loadFiles} disabled={loading || uploading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>上传文件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="upload-file-input">选择文件</Label>
              <Input
                id="upload-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,application/pdf,application/zip"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground">单个文件大小上限 {maxUploadLabel}</p>
            </div>

            <div className="space-y-2">
              <Label>压缩策略</Label>
              <Select value={compressionMode} onValueChange={(value: CompressionMode) => setCompressionMode(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BALANCED">平衡（默认）</SelectItem>
                  <SelectItem value="ORIGINAL">原图（不压缩）</SelectItem>
                  <SelectItem value="HIGH">高压缩</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? '上传中...' : '上传文件'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>文件列表（{totalFiles}）</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">加载中...</div>
          ) : files.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">暂无文件，先上传图片或附件吧。</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((file) => (
                <div key={file.id} className="overflow-hidden rounded-lg border bg-card">
                  <div className="relative aspect-video overflow-hidden bg-gray-100 dark:bg-gray-900">
                    {file.mimeType.startsWith('image/') ? <Image
                      unoptimized
                      src={file.url}
                      alt={file.originalName}
                      fill
                      sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    /> : <div className="flex h-full items-center justify-center gap-3 text-muted-foreground"><FileText size={32} /><span>{file.ext.toUpperCase()}</span></div>}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-1 text-sm font-medium" title={file.originalName}>
                      {file.originalName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {file.width && file.height ? `${file.width} × ${file.height}` : '未知尺寸'} · {formatBytes(file.size)} · {file.ext.toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(file.createdAt).toLocaleString('zh-CN')}
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => handleCopyUrl(file.url)}>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        复制
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={file.url} target="_blank" rel="noreferrer">
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          预览
                        </a>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" disabled={deletingId === file.id}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除文件</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除“{file.originalName}”吗？如果该图片正在被文章或设置引用，系统会阻止删除。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => handleDelete(file)}
                            >
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PaginationControls page={page} totalPages={totalPages} onChange={setPage} disabled={loading} />

      <AlertDialog open={inUseDialogOpen} onOpenChange={setInUseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>该图片仍在使用中</AlertDialogTitle>
            <AlertDialogDescription>
              {`检测到引用：文章 ${inUseRefs?.posts || 0} / 作品 ${inUseRefs?.projects || 0} / 用户 ${inUseRefs?.users || 0} / 设置 ${(inUseRefs?.settings || []).length || 0}。`}
              <br />
              删除后相关页面可能出现空白封面、头像或图标，建议先替换引用再删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>我知道了</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleForceDelete}
              disabled={!inUseFile || deletingId === inUseFile.id}
            >
              仍要强制删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
