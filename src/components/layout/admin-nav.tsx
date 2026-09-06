'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Tags,
  MessageSquare,
  Users,
  Settings,
  Key,
  GalleryVerticalEnd,
  Palette,
  Images,
  ArrowLeftRight,
  Bot,
  History,
} from 'lucide-react'
const icons = {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Tags,
  MessageSquare,
  Users,
  Settings,
  Key,
  GalleryVerticalEnd,
  Palette,
  Images,
  ArrowLeftRight,
  Bot,
  History,
}
const groups = [
  { label: '创作', keys: ['/admin', '/admin/posts', '/admin/files', '/admin/works'] },
  {
    label: '整理与互动',
    keys: ['/admin/categories', '/admin/tags', '/admin/comments', '/admin/users'],
  },
  {
    label: '工具与设置',
    keys: [
      '/admin/ai',
      '/admin/api-keys',
      '/admin/import-export',
      '/admin/styles',
      '/admin/settings',
      '/admin/changelog',
    ],
  },
]
export function AdminNav({
  items,
  onLinkClick,
}: {
  items: { href: string; iconName: string; label: string }[]
  onLinkClick?: () => void
}) {
  const pathname = usePathname()
  return (
    <nav className="ba-admin-nav" aria-label="后台导航">
      {groups.map((group) => (
        <div key={group.label} className="ba-admin-nav-group">
          <p>{group.label}</p>
          {group.keys.map((href) => {
            const item = items.find((item) => item.href === href)
            if (!item) return null
            const Icon = icons[item.iconName as keyof typeof icons]
            const active =
              pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'))
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={onLinkClick}
              >
                {Icon && <Icon size={19} />}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
