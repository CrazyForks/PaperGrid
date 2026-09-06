'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { Users, Shield, Trash2, Mail, Search, FileText, MessageSquare, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useToast } from '@/hooks/use-toast'

interface User {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  createdAt: Date
  _count: {
    posts: number
    comments: number
  }
}

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [defaultAvatarUrl, setDefaultAvatarUrl] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchUsers()
    }, 300) // Debounce search
    return () => clearTimeout(timeout)
  }, [page, searchQuery, roleFilter])

  useEffect(() => {
    fetch('/api/settings/public')
      .then((res) => res.json())
      .then((data) => setDefaultAvatarUrl(data?.['site.defaultAvatarUrl'] || ''))
      .catch((err) => console.error('Failed to load settings', err))
  }, [])

  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(searchQuery && { search: searchQuery }),
        ...(roleFilter && { role: roleFilter }),
      })
      const queryString = params.toString()
      const response = await fetch(`/api/admin/users${queryString ? `?${queryString}` : ''}`)
      const data = await response.json()

      if (response.ok) {
        setUsers(data.users)
        setTotalPages(data.pagination.totalPages)
      } else {
        toast({
          title: '错误',
          description: data.error || '获取用户列表失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('获取用户列表失败:', error)
      toast({
        title: '错误',
        description: '获取用户列表失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const updateUserRole = async (id: string, role: string) => {
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      if (response.ok) {
        toast({
          title: '成功',
          description: '用户角色已更新',
        })
        fetchUsers()
      } else {
        const data = await response.json()
        toast({
          title: '错误',
          description: data.error || '更新失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('更新用户角色失败:', error)
      toast({
        title: '错误',
        description: '更新失败',
        variant: 'destructive',
      })
    }
  }

  const deleteUser = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast({
          title: '成功',
          description: '用户已删除',
        })
        fetchUsers()
      } else {
        const data = await response.json()
        toast({
          title: '错误',
          description: data.error || '删除失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('删除用户失败:', error)
      toast({
        title: '错误',
        description: '删除失败',
        variant: 'destructive',
      })
    }
  }

  const getRoleBadge = (role: string) => {
    if (role === 'ADMIN') {
      return <Badge className="bg-purple-500 text-white hover:bg-purple-600">管理员</Badge>
    }
    return <Badge variant="secondary">普通用户</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">用户管理</h1>
        <p className="text-muted-foreground">管理系统用户和权限</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative w-full flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="搜索用户名或邮箱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Role Filter */}
            <Select value={roleFilter || 'ALL'} onValueChange={(value) => setRoleFilter(value === 'ALL' ? '' : value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="所有角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">所有角色</SelectItem>
                <SelectItem value="USER">普通用户</SelectItem>
                <SelectItem value="ADMIN">管理员</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            用户列表 ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">没有找到用户</p>
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col gap-4 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors sm:flex-row sm:items-center"
                >
                  {/* Avatar */}
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={user.image || defaultAvatarUrl || undefined} />
                    <AvatarFallback className="border border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-serif text-lg font-bold">
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {user.name || '未设置用户名'}
                      </span>
                      {getRoleBadge(user.role)}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1 min-w-0">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span>{user._count.posts} 篇文章</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>{user._count.comments} 条评论</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDistanceToNow(new Date(user.createdAt), {
                            addSuffix: true,
                            locale: zhCN,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={user.role}
                      onValueChange={(role) => updateUserRole(user.id, role)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER">普通用户</SelectItem>
                        <SelectItem value="ADMIN">管理员</SelectItem>
                      </SelectContent>
                    </Select>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="hover:bg-red-50 hover:text-red-700 hover:border-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除用户</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要删除用户「{user.name || user.email}」吗？
                            该用户的评论将被删除。仍有文章的用户需要先转移文章归属。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteUser(user.id)}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                第 {page} / {totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
