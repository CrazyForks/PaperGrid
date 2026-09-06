'use client'
import { useEffect } from 'react'

export function useUnsavedChanges(dirty: boolean, message = '文章有尚未保存的修改，确定离开吗？') {
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element)?.closest('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const next = new URL(link.href, location.href)
      if (next.pathname === location.pathname && next.search === location.search) return
      if (!window.confirm(message)) { event.preventDefault(); event.stopImmediatePropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', followLink, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', followLink, true) }
  }, [dirty, message])
}
