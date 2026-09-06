'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useReadingState } from '@/components/layout/reading-context'

export function PostTitleSync({ title, minutes = 1 }: { title: string; minutes?: number }) {
  const pathname = usePathname()
  const { setPost } = useReadingState()
  useEffect(() => {
    setPost({ path: pathname, title, minutes })
    window.dispatchEvent(new CustomEvent('post-title-changed', { detail: title }))
    return () => {
      setPost((previous) => (previous?.path === pathname ? null : previous))
      window.dispatchEvent(new CustomEvent('post-title-changed', { detail: '' }))
    }
  }, [title, minutes, pathname, setPost])
  return null
}
