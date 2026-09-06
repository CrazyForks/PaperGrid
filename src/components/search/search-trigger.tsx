'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { Search } from 'lucide-react'
import dynamic from 'next/dynamic'
const SearchCommand = dynamic(() => import('./search-command').then((m) => m.SearchCommand), {
  ssr: false,
})

const subscribePlatform = () => () => {}
const getShortcut = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K')

export function SearchTrigger() {
  const [open, setOpen] = useState(false)
  const shortcut = useSyncExternalStore(subscribePlatform, getShortcut, () => 'Ctrl K')
  useEffect(() => {
    const show = () => setOpen(true)
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        !event.isComposing
      ) {
        event.preventDefault()
        show()
      }
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('papergrid:open-search', show)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('papergrid:open-search', show)
    }
  }, [])
  return (
    <>
      <button
        className="ba-search-trigger"
        aria-label="搜索文章、分类和标签"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Search size={19} />
        <span>搜索</span>
        <kbd>{shortcut}</kbd>
      </button>
      {open && <SearchCommand open={open} onOpenChange={setOpen} />}
    </>
  )
}
