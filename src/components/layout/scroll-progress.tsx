'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/** One document progress line shared by public, admin and sign-in pages. */
export function ScrollProgress() {
  const fillRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    const fill = fillRef.current
    if (!fill) return
    let frame = 0
    const update = () => {
      frame = 0
      const distance = document.documentElement.scrollHeight - window.innerHeight
      const progress = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0
      // Transform only: never change document width, padding or scrollbar gutters.
      fill.style.transform = `scaleX(${progress})`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('pageshow', schedule)
    update()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pageshow', schedule)
    }
  }, [pathname])

  return (
    <div className="ba-scroll-track" aria-hidden="true">
      <div ref={fillRef} style={{ transform: 'scaleX(0)' }} />
    </div>
  )
}
