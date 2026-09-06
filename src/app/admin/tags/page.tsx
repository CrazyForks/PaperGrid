'use client'

import { useState, useEffect } from 'react'
import { taxonomyNameChange } from '@/lib/slug'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type TagRow = { id: string; name: string; slug: string; description?: string | null; _count: { posts: number } }

export default function TagsPage() {
  const { toast } = useToast()
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [slugEdited, setSlugEdited] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
  })

  // 加载标签列表
  const loadTags = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tags')
      const data = await res.json()
      if (data.tags) {
        setTags(data.tags)
      }
    } catch (error) {
      console.error('加载标签失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTags()
  }, [])

  const handleNameChange = (value: string) => {
    setFormData(prev => taxonomyNameChange(prev, value, slugEdited))
  }

  // 打开创建对话框
  const handleCreate = () => {
    setSlugEdited(false)
    setEditingTag(null)
    setFormData({ name: '', slug: '' })
    setDialogOpen(true)
  }

  // 打开编辑对话框
  const handleEdit = (tag: TagRow) => {
    setSlugEdited(true)
    setEditingTag(tag)
    setFormData({
      name: tag.name,
      slug: tag.slug,
    })
    setDialogOpen(true)
  }

  // 保存标签
  const handleSave = async () => {
    setSaving(true)

    try {
      const url = editingTag ? `/api/tags/${editingTag.id}` : '/api/tags'
      const method = editingTag ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存失败')
      }

      // 重新加载列表
      await loadTags()
      setDialogOpen(false)
      toast({
        title: '成功',
        description: editingTag ? '标签已更新' : '标签已创建',
      })
    } catch (error) {
      console.error('保存失败:', error)
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '保存失败',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // 删除标签
  const handleDelete = async (tagId: string, name: string) => {
    try {
      setDeletingId(tagId)
      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '删除失败')
      }

      await loadTags()
      toast({ title: '成功', description: `标签“${name}”已删除` })
    } catch (error) {
      console.error('删除失败:', error)
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '删除失败',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-lg text-gray-600 dark:text-gray-400">
          加载中...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和操作按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">标签管理</h1>
          <p className="text-muted-foreground">
            管理您的博客文章标签
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新建标签
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总标签数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tags.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已使用</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tags.filter((t) => t._count.posts > 0).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">关联文章</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tags.reduce((sum, t) => sum + t._count.posts, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 标签列表 */}
      <Card>
        <CardHeader>
          <CardTitle>标签列表</CardTitle>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              暂无标签
              <div className="mt-4">
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  创建第一个标签
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="group flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {tag.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({tag._count.posts})
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => handleEdit(tag)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={deletingId === tag.id}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除标签</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要删除标签“{tag.name}”吗？此操作不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(tag.id, tag.name)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            确定删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingTag ? '编辑标签' : '新建标签'}</DialogTitle>
            <DialogDescription>
              {editingTag ? '修改标签信息' : '创建一个新的文章标签'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">标签名称 *</Label>
              <Input
                id="tag-name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="例如: JavaScript"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tag-slug">URL Slug *</Label>
              <Input
                id="tag-slug"
                value={formData.slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setFormData({ ...formData, slug: e.target.value })
                }}
                placeholder="javascript"
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
