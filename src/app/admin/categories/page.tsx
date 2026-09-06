'use client'

import { useState, useEffect } from 'react'
import { taxonomyNameChange } from '@/lib/slug'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

type CategoryRow = { id: string; name: string; slug: string; description?: string | null; _count: { posts: number } }

export default function CategoriesPage() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [slugEdited, setSlugEdited] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  })

  // 加载分类列表
  const loadCategories = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      if (data.categories) {
        setCategories(data.categories)
      }
    } catch (error) {
      console.error('加载分类失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const handleNameChange = (value: string) => {
    setFormData(prev => taxonomyNameChange(prev, value, slugEdited))
  }

  // 打开创建对话框
  const handleCreate = () => {
    setSlugEdited(false)
    setEditingCategory(null)
    setFormData({ name: '', slug: '', description: '' })
    setDialogOpen(true)
  }

  // 打开编辑对话框
  const handleEdit = (category: CategoryRow) => {
    setSlugEdited(true)
    setEditingCategory(category)
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
    })
    setDialogOpen(true)
  }

  // 保存分类
  const handleSave = async () => {
    setSaving(true)

    try {
      const url = editingCategory
        ? `/api/categories/${editingCategory.id}`
        : '/api/categories'
      const method = editingCategory ? 'PATCH' : 'POST'

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
      await loadCategories()
      setDialogOpen(false)
      toast({
        title: '成功',
        description: editingCategory ? '分类已更新' : '分类已创建',
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

  // 删除分类
  const handleDelete = async (categoryId: string, name: string) => {
    try {
      setDeletingId(categoryId)
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '删除失败')
      }

      await loadCategories()
      toast({ title: '成功', description: `分类“${name}”已删除` })
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
          <h1 className="text-3xl font-bold tracking-tight">分类管理</h1>
          <p className="text-muted-foreground">
            管理您的博客文章分类
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新建分类
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总分类数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已使用</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {categories.filter((c) => c._count.posts > 0).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总文章数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {categories.reduce((sum, c) => sum + c._count.posts, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 分类列表 */}
      <Card>
        <CardHeader>
          <CardTitle>分类列表</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              暂无分类
              <div className="mt-4">
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  创建第一个分类
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {category.name}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>/{category.slug}</span>
                      <span>•</span>
                      <span>{category._count.posts} 篇文章</span>
                      {category.description && (
                        <>
                          <span>•</span>
                          <span className="line-clamp-1">
                            {category.description}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deletingId === category.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除分类</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要删除分类“{category.name}”吗？此操作不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(category.id, category.name)}
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? '编辑分类' : '新建分类'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? '修改分类信息'
                : '创建一个新的文章分类'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">分类名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="例如: 技术分享"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setFormData({ ...formData, slug: e.target.value })
                }}
                placeholder="tech-sharing"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="分类描述..."
                rows={3}
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
