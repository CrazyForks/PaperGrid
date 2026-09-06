'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './loading.module.css'

export function StartupLoader() {
  const [visible, setVisible] = useState(true)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const overlay = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    // The CSS deadline may have elapsed before hydration on a slow connection.
    if (overlay.current && getComputedStyle(overlay.current).visibility === 'hidden') {
      setVisible(false)
      return
    }
    const controller = new AbortController()
    const { signal } = controller
    const timers: ReturnType<typeof setTimeout>[] = []
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const siblings = Array.from(overlay.current?.parentElement?.children ?? []).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay.current
    )
    const previousInert = siblings.map((element) => element.inert)
    siblings.forEach((element) => {
      element.inert = true
    })
    const finish = () => {
      if (signal.aborted) return
      setProgress(100)
      setDone(true)
      timers.push(setTimeout(() => setVisible(false), 240))
    }
    // Fail open even when a critical image or streamed route never finishes.
    timers.push(setTimeout(() => setVisible(false), 8000))

    const imageReady = (image: HTMLImageElement) => image.decode().catch(() => undefined)
    const routeReady = new Promise<void>((resolve) => {
      const check = () => {
        if (!document.querySelector('[data-route-loading]')) {
          observer.disconnect()
          resolve()
        }
      }
      const observer = new MutationObserver(check)
      observer.observe(document.getElementById('main-content') ?? document.body, {
        childList: true,
        subtree: true,
      })
      signal.addEventListener(
        'abort',
        () => {
          observer.disconnect()
          resolve()
        },
        { once: true }
      )
      check()
    })
    // Fonts use display: swap; neither the full document's fonts nor the loader's
    // decorative artwork should delay access to already usable page content.
    const tasks = [
      routeReady,
      routeReady.then(() => {
        if (signal.aborted) return
        // Ignore lazy article images and the deliberately deferred expression atlas.
        return Promise.all(
          Array.from(document.images)
            .filter((image) => image.fetchPriority === 'high')
            .map(imageReady)
        )
      }),
    ]
    let settled = 0
    void Promise.all(
      tasks.map(async (task) => {
        try {
          await task
        } finally {
          settled += 1
          if (!signal.aborted) setProgress(Math.round((settled / tasks.length) * 100))
        }
      })
    ).then(finish, finish)

    return () => {
      controller.abort()
      timers.forEach(clearTimeout)
      document.body.style.overflow = previousOverflow
      siblings.forEach((element, index) => {
        element.inert = previousInert[index]
      })
    }
  }, [visible])

  if (!visible) return null
  return (
    <div ref={overlay} className={styles.startup} data-startup-loader data-done={done || undefined}>
      <div className={styles.avatar} aria-hidden="true">
        <div />
      </div>
      <div className={styles.connecting}>connecting...</div>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="页面加载进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <span className={styles.percent} aria-hidden="true">
        {progress}%
      </span>
      <button className={styles.skip} onClick={() => setVisible(false)}>
        直接进入
      </button>
      <noscript>
        <style>{'[data-startup-loader] { display: none !important; }'}</style>
      </noscript>
    </div>
  )
}
