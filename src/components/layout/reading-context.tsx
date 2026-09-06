'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { usePathname } from 'next/navigation'

type PostInfo = { path: string; title: string; minutes: number }
type ReadingState = {
  progress: number
  showTitle: boolean
  showTools: boolean
  hasContent: boolean
  hasToc: boolean
}
const ReadingContext = createContext<
  | (ReadingState & {
      post: PostInfo | null
      setPost: Dispatch<SetStateAction<PostInfo | null>>
    })
  | null
>(null)

export function ReadingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [postInfo, setPost] = useState<PostInfo | null>(null)
  const post = postInfo?.path === pathname ? postInfo : null
  const [state, setState] = useState<ReadingState>({
    progress: 0,
    showTitle: false,
    showTools: false,
    hasContent: false,
    hasToc: false,
  })

  useEffect(() => {
    let frame = 0
    let lastY = Math.max(0, window.scrollY)
    let directionStart = lastY
    let direction = 0
    let showTitle = false
    let initial = true
    let scrolled = false
    const update = () => {
      frame = 0
      // Clamp elastic overscroll so bouncing at either edge cannot flip the header.
      const y = Math.max(
        0,
        Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight)
      )
      const body = post ? document.querySelector<HTMLElement>('.mdx-content') : null
      const title = post ? document.querySelector<HTMLElement>('.schale-reading-header h1') : null
      const navHeight = document.querySelector<HTMLElement>('.schale-navbar')?.offsetHeight || 76
      const titlePassed = Boolean(title && title.getBoundingClientRect().bottom <= navHeight + 8)
      if (!titlePassed) {
        showTitle = false
        directionStart = y
        direction = 0
      } else if (initial) {
        showTitle = true
      } else if (scrolled && y !== lastY) {
        const nextDirection = Math.sign(y - lastY)
        if (nextDirection !== direction) {
          directionStart = lastY
          direction = nextDirection
        }
        // Require deliberate travel; tiny finger corrections keep the current view.
        if (Math.abs(y - directionStart) >= 24) showTitle = direction > 0
      }
      initial = false
      scrolled = false
      lastY = y
      const start = body ? body.getBoundingClientRect().top + y - 100 : 0
      const distance = body
        ? body.offsetHeight - window.innerHeight + 180
        : document.documentElement.scrollHeight - window.innerHeight
      const progress = body
        ? Math.round(
            Math.min(
              100,
              Math.max(0, distance > 0 ? ((y - start) / distance) * 100 : y >= start ? 100 : 0)
            )
          )
        : 0
      const next = {
        progress,
        showTitle,
        showTools: y > 240,
        hasContent: Boolean(body),
        hasToc: Boolean(body?.querySelector('h1, h2, h3')),
      }
      setState((previous) =>
        previous.progress === next.progress &&
        previous.showTitle === next.showTitle &&
        previous.showTools === next.showTools &&
        previous.hasContent === next.hasContent &&
        previous.hasToc === next.hasToc
          ? previous
          : next
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const onScroll = () => {
      scrolled = true
      schedule()
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(document.body)
    // Unlocking a protected article can replace its contents without navigation.
    const contentChanges = new MutationObserver(schedule)
    const main = document.getElementById('main-content')
    if (main) contentChanges.observe(main, { childList: true, subtree: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      contentChanges.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', schedule)
    }
  }, [pathname, post])

  const value = useMemo(() => ({ ...state, post, setPost }), [state, post])
  return <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
}

export function useReadingState() {
  const value = useContext(ReadingContext)
  if (!value) throw new Error('Reading controls require ReadingProvider')
  return value
}
