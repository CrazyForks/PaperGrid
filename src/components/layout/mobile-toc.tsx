'use client'
import { useState } from 'react'
import { NavigationDrawer } from './navigation-drawer'

type HeadingItem = { id: string; text: string; level: number }
export function MobileToc({
  isOpen,
  onOpenChange,
}: {
  isOpen?: boolean
  onOpenChange?: (v: boolean) => void
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [active, setActive] = useState('')
  const open = isOpen ?? localOpen,
    setOpen = onOpenChange ?? setLocalOpen
  const collectHeadings = () => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('.mdx-content h1, .mdx-content h2, .mdx-content h3')
    )
    const items = elements
      .map((el, i) => {
        if (!el.id) el.id = `heading-${i}`
        return { id: el.id, text: el.textContent?.trim() || '', level: Number(el.tagName[1]) }
      })
      .filter((item) => item.text)
    setHeadings(items)
    setActive(
      elements.filter((el) => el.getBoundingClientRect().top < 160).at(-1)?.id || items[0]?.id || ''
    )
  }
  return (
    <NavigationDrawer
      open={open}
      onOpenChange={setOpen}
      side="right"
      title="本页目录"
      description="找到你想继续阅读的地方。"
      onOpenAutoFocus={collectHeadings}
    >
      <nav aria-label="文章目录" className="mt-4 grid gap-1">
        {headings.length ? (
          headings.map((item) => (
            <button
              key={item.id}
              className="hover:bg-secondary aria-[current=true]:bg-secondary aria-[current=true]:text-primary rounded-lg px-3 py-3 text-left text-sm"
              aria-current={active === item.id ? 'true' : undefined}
              style={{ paddingLeft: 12 + Math.max(0, item.level - 2) * 16 }}
              onClick={() => {
                setOpen(false)
                requestAnimationFrame(() =>
                  document
                    .getElementById(item.id)
                    ?.scrollIntoView({
                      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'instant'
                        : 'smooth',
                    })
                )
              }}
            >
              {item.text}
            </button>
          ))
        ) : (
          <p className="text-muted-foreground py-8 text-sm">正文中暂无可用目录。</p>
        )}
      </nav>
    </NavigationDrawer>
  )
}
