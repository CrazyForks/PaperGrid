'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  Home,
  BookOpen,
  Archive,
  Shapes,
  Hash,
  Telescope,
  UserRound,
  ChevronRight,
} from 'lucide-react'
import { NavigationDrawer } from './navigation-drawer'

const links = [
  { href: '/', label: '首页', icon: Home },
  { href: '/posts', label: '文章', icon: BookOpen },
  { href: '/archive', label: '归档', icon: Archive },
  { href: '/categories', label: '分类', icon: Shapes },
  { href: '/tags', label: '标签', icon: Hash },
  { href: '/yaji', label: '雅集', icon: Telescope },
  { href: '/about', label: '关于', icon: UserRound },
]
export function MobileNav({
  isOpen,
  onOpenChange,
  showTrigger = true,
  showOnDesktop = false,
}: {
  isOpen?: boolean
  onOpenChange?: (v: boolean) => void
  side?: 'left' | 'top'
  showTrigger?: boolean
  showOnDesktop?: boolean
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = isOpen ?? localOpen,
    setOpen = onOpenChange ?? setLocalOpen
  const pathname = usePathname()
  return (
    <NavigationDrawer
      open={open}
      onOpenChange={setOpen}
      title="探索手记"
      description="选择页面，按关闭按钮返回阅读。"
      trigger={
        showTrigger ? (
          <button
            className={`ba-menu-trigger ${showOnDesktop ? '' : 'md:hidden'}`}
            aria-label="打开导航"
          >
            <Menu size={21} />
            <span>菜单</span>
          </button>
        ) : undefined
      }
    >
      <nav aria-label="移动导航" className="ba-mobile-links">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={
              (href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'page' : undefined
            }
          >
            <Icon size={22} />
            <span>{label}</span>
            <ChevronRight size={18} />
          </Link>
        ))}
      </nav>
    </NavigationDrawer>
  )
}
