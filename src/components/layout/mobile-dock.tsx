'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Home, BookOpen, Search, Menu } from 'lucide-react'
import { MobileNav } from './mobile-nav'
const SearchCommand = dynamic(
  () => import('@/components/search/search-command').then((m) => m.SearchCommand),
  { ssr: false }
)
export function MobileDock() {
  const pathname = usePathname()
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(false)
  return (
    <>
      <nav className="ba-mobile-dock" aria-label="常用导航">
        <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
          <Home size={21} />
          <span>首页</span>
        </Link>
        <Link href="/posts" aria-current={pathname.startsWith('/posts') ? 'page' : undefined}>
          <BookOpen size={21} />
          <span>文章</span>
        </Link>
        <button onClick={() => setSearch(true)} aria-label="搜索文章">
          <Search size={21} />
          <span>搜索</span>
        </button>
        <button onClick={() => setMenu(true)} aria-expanded={menu} aria-label="打开更多导航">
          <Menu size={21} />
          <span>更多</span>
        </button>
      </nav>
      <MobileNav isOpen={menu} onOpenChange={setMenu} showTrigger={false} />
      {search && <SearchCommand open={search} onOpenChange={setSearch} />}
    </>
  )
}
