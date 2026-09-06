import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Circle, ExternalLink, LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { AdminNav } from '@/components/layout/admin-nav'
import { AdminContentTransition } from '@/components/layout/admin-content'
import { AdminLoadingFallback } from '@/components/layout/admin-loading-fallback'
import { AdminMobileSidebar } from '@/components/layout/admin-mobile-sidebar'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { getSetting } from '@/lib/settings'

const navItems = [
  { href: '/admin', iconName: 'LayoutDashboard', label: '工作台' },
  { href: '/admin/posts', iconName: 'FileText', label: '文章管理' },
  { href: '/admin/files', iconName: 'Images', label: '文件管理' },
  { href: '/admin/works', iconName: 'GalleryVerticalEnd', label: '作品展示' },
  { href: '/admin/categories', iconName: 'FolderKanban', label: '分类管理' },
  { href: '/admin/tags', iconName: 'Tags', label: '标签管理' },
  { href: '/admin/comments', iconName: 'MessageSquare', label: '评论管理' },
  { href: '/admin/users', iconName: 'Users', label: '用户管理' },
  { href: '/admin/api-keys', iconName: 'Key', label: '接口密钥' },
  { href: '/admin/ai', iconName: 'Bot', label: '智能助手' },
  { href: '/admin/import-export', iconName: 'ArrowLeftRight', label: '导入导出' },
  { href: '/admin/changelog', iconName: 'History', label: '更新记录' },
  { href: '/admin/styles', iconName: 'Palette', label: '样式管理' },
  { href: '/admin/settings', iconName: 'Settings', label: '系统设置' },
]

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  const rawVersion = process.env.APP_VERSION || ''
  const appVersion = rawVersion ? (rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`) : ''

  if (!session?.user) {
    redirect('/auth/signin')
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/')
  }

  const defaultAvatarUrl = (await getSetting<string>('site.defaultAvatarUrl', '')) || ''

  return (
    <div className="schale-admin">
      {/* Top Navigation Bar */}
      <header className="schale-admin-header">
        <div className="flex h-full items-center justify-between gap-3">
          {/* 左侧入口 */}
          <div className="flex items-center gap-4">
            <AdminMobileSidebar items={navItems} />
            <Link href="/admin" className="schale-brand">
              <span className="schale-mark">
                <Circle />
              </span>
              <span className="text-sm font-semibold tracking-tight sm:text-base">创作终端</span>
            </Link>
          </div>

          <Link
            href="/"
            className="text-muted-foreground ml-auto hidden items-center gap-2 text-sm sm:flex"
          >
            <ExternalLink size={15} /> 查看博客
          </Link>
          <ThemeToggle />
          {/* User Menu */}
          <div className="flex items-center gap-4">
            {appVersion && (
              <span className="text-muted-foreground hidden items-center rounded-md border px-2 py-1 text-xs sm:inline-flex">
                <span className="font-mono">{appVersion}</span>
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage
                      src={session.user.image || defaultAvatarUrl || undefined}
                      alt={session.user.name || 'User'}
                    />
                    <AvatarFallback>
                      {session.user.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm leading-none font-medium">{session.user.name}</p>
                    <p className="text-muted-foreground text-xs leading-none">
                      {session.user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/">查看网站</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/settings">设置</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form
                  action={async () => {
                    'use server'
                    const { signOut } = await import('@/lib/auth')
                    await signOut({ redirectTo: '/' })
                  }}
                >
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>退出登录</span>
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="schale-admin-layout">
        {/* Sidebar */}
        <aside className="schale-admin-sidebar">
          <div className="ba-sidebar-heading">
            <strong>创作与管理</strong>
          </div>
          <AdminNav items={navItems} />
        </aside>

        {/* Main Content */}
        <main id="admin-content" className="schale-admin-main">
          <Suspense fallback={<AdminLoadingFallback delayMs={150} />}>
            <AdminContentTransition>{children}</AdminContentTransition>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
