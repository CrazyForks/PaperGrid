'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useReadingState } from './reading-context'
import { ArchiveTitle } from '@/components/brand/archive-title'
import { MobileNav } from './mobile-nav'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { LogIn, LogOut, Settings, Circle, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { SearchTrigger } from '@/components/search/search-trigger'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const links = [
  { href: '/', label: '首页' },
  { href: '/posts', label: '文章' },
  { href: '/archive', label: '归档' },
  { href: '/yaji', label: '雅集' },
  { href: '/about', label: '关于' },
]

export function Navbar({ settings = {} }: { settings?: Record<string, unknown> }) {
  const pathname = usePathname()
  const { post, showTitle } = useReadingState()
  const [focused, setFocused] = useState(false)
  const reading = Boolean(post) && showTitle && !focused
  const { data: session, status } = useSession()
  const title = typeof settings['site.title'] === 'string' ? settings['site.title'] : 'PaperGrid'
  return (
    <header
      className="schale-navbar"
      data-home={pathname === '/'}
      data-reading={reading}
      onFocusCapture={(event) => setFocused(event.target.matches(':focus-visible'))}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <div className="ba-nav-stage">
        <div className="schale-nav-inner">
          <MobileNav />
          <Link href="/" className="schale-brand schale-brand-logo" aria-label={`${title} 首页`}>
            <span className="schale-mark" aria-hidden="true">
              <Circle strokeWidth={2} />
            </span>
            <ArchiveTitle title={title} compact />
          </Link>
          <nav className="schale-nav-links" aria-label="主导航">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={
                  (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href))
                    ? 'page'
                    : undefined
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div>
              <SearchTrigger />
            </div>
            <ThemeToggle />
            {!settings['ui.hideAdminEntry'] && (
              <div className="ba-account-slot">
                {session?.user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="账号菜单">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={session.user.image || undefined} />
                          <AvatarFallback>{session.user.name?.[0] || '我'}</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {session.user.role === 'ADMIN' && (
                        <DropdownMenuItem asChild>
                          <Link href="/admin">
                            <Settings className="mr-2 h-4 w-4" />
                            管理后台
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: '/' })}>
                        <LogOut className="mr-2 h-4 w-4" />
                        退出登录
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : status === 'loading' ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled
                    aria-label="正在加载账号"
                    aria-busy="true"
                  >
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button asChild variant="ghost" size="icon">
                    <Link href="/auth/signin" aria-label="登录">
                      <LogIn className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="ba-reading-status" aria-hidden={!reading}>
          <span className="ba-reading-title" title={post?.title}>
            {post?.title}
          </span>
        </div>
      </div>
    </header>
  )
}
