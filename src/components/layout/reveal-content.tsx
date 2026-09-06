'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
/** Progressive enhancement: content remains visible when JS or observers fail. */
export function RevealContent() {
  const pathname = usePathname()
  useEffect(() => {
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    )
      return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('ba-arrived')
            observer.unobserve(entry.target)
          }
      },
      { threshold: 0.08 }
    )
    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [pathname])
  return null
}
