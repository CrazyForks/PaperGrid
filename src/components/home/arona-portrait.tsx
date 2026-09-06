'use client'

import Image from 'next/image'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useHeroInteraction } from './hero-interaction'
import styles from './arona-visual.module.css'

export type AronaArtwork = {
  src: string
  width: number
  height: number
  touchX: number
  touchY: number
  expressions?: string
}

// Registered to arona-touch-eyes.webp. Include both hair tips and the braid,
// following the jaw and the braid's left edge instead of cutting across the shoulder.
const headOutline =
  'M0 0H1254V950H1030V850L1010 818Q999 796 1012 767L1005 748Q980 731 987 709L998 691Q947 703 905 681L879 664Q794 701 713 684Q669 670 638 637H0Z'
// The hand overlaps the hair; exclude it independently so the finger stays anchored.
const foregroundHand =
  'M0 610H322L385 451Q397 421 412 407Q425 393 438 400Q449 406 444 426Q433 478 400 557L362 650H0Z'

export function AronaPortrait({
  artwork,
  ready,
  onReady,
}: {
  artwork: AronaArtwork
  ready: boolean
  onReady: (ready: boolean) => void
}) {
  const id = useId().replace(/:/g, '')
  const figure = useRef<HTMLDivElement>(null)
  const response = useRef<HTMLDivElement>(null)
  const half = useRef<HTMLDivElement>(null)
  const closed = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [loadedExpressions, setLoadedExpressions] = useState<string>()
  const { subscribe } = useHeroInteraction()
  const hasLayers = Boolean(artwork.expressions)
  const expressionReady = Boolean(artwork.expressions && loadedExpressions === artwork.expressions)

  useEffect(() => {
    const element = figure.current
    if (!element) return
    let visible = false
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setActive(ready && visible && !document.hidden && !motion.matches)
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        update()
      },
      { threshold: 0 }
    )
    observer.observe(element)
    document.addEventListener('visibilitychange', update)
    motion.addEventListener('change', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
      motion.removeEventListener('change', update)
    }
  }, [ready])

  useEffect(() => {
    const src = artwork.expressions
    if (!active || !src || expressionReady) return
    let disposed = false
    let image: HTMLImageElement | undefined
    // The original portrait is already painted; facial frames never block its request.
    const timer = window.setTimeout(async () => {
      image = new window.Image()
      image.decoding = 'async'
      image.fetchPriority = 'low'
      image.src = src
      try {
        await image.decode()
        if (!disposed) setLoadedExpressions(src)
      } catch {
        // Keep the original open eyes if the optional animation asset is unavailable.
      }
    }, 1200)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      if (image && !image.complete) image.removeAttribute('src')
    }
  }, [active, artwork.expressions, expressionReady])

  useEffect(() => {
    if (!active || !expressionReady) return
    const halfEye = half.current
    const closedEye = closed.current
    const head = response.current
    if (!halfEye || !closedEye || !head) return
    let timer: number
    let doubleBlink = false
    const cancel = () => {
      for (const element of [halfEye, closedEye, head]) {
        for (const animation of element.getAnimations()) animation.cancel()
      }
    }
    const blink = (duration: number) => {
      cancel()
      halfEye.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 40 / duration },
          { opacity: 0, offset: 80 / duration },
          { opacity: 0, offset: 1 - 80 / duration },
          { opacity: 1, offset: 1 - 40 / duration },
          { opacity: 0 },
        ],
        { duration, easing: 'linear' }
      )
      closedEye.animate(
        [
          { opacity: 0 },
          { opacity: 0, offset: 40 / duration },
          { opacity: 1, offset: 80 / duration },
          { opacity: 1, offset: 1 - 80 / duration },
          { opacity: 0, offset: 1 - 40 / duration },
          { opacity: 0 },
        ],
        { duration, easing: 'linear' }
      )
    }
    const schedule = () => {
      const delay = doubleBlink ? 380 : 3000 + Math.random() * 3000
      timer = window.setTimeout(() => {
        blink(220)
        doubleBlink = !doubleBlink && Math.random() < 0.15
        schedule()
      }, delay)
    }
    const unsubscribe = subscribe(() => {
      window.clearTimeout(timer)
      doubleBlink = false
      blink(1100)
      head.animate(
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-0.65deg)', offset: 0.3 },
          { transform: 'rotate(-0.45deg)', offset: 0.65 },
          { transform: 'rotate(0deg)' },
        ],
        { duration: 1100, easing: 'ease-in-out' }
      )
      schedule()
    })
    schedule()
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
      cancel()
    }
  }, [active, expressionReady, subscribe])

  return (
    <div
      ref={figure}
      className={styles.figure}
      data-active={active}
      data-layered={hasLayers}
      data-expressions={expressionReady}
    >
      {hasLayers && (
        <svg width="0" height="0" className={styles.masks} aria-hidden="true" focusable="false">
          <defs>
            <mask id={`${id}-body`} maskContentUnits="objectBoundingBox">
              <rect width="1" height="1" fill="white" />
              <path
                d={headOutline}
                transform={`scale(${1 / 1254})`}
                fill="black"
                stroke="white"
                strokeWidth="8"
              />
              <path d={foregroundHand} transform={`scale(${1 / 1254})`} fill="white" />
            </mask>
            <mask id={`${id}-head`} maskContentUnits="objectBoundingBox">
              <path
                d={headOutline}
                transform={`scale(${1 / 1254})`}
                fill="white"
                stroke="white"
                strokeWidth="3"
              />
              <path d={foregroundHand} transform={`scale(${1 / 1254})`} fill="black" />
            </mask>
          </defs>
        </svg>
      )}
      <Image
        unoptimized
        className={styles.portrait}
        style={hasLayers ? { maskImage: `url(#${id}-body)` } : undefined}
        src={artwork.src}
        width={artwork.width}
        height={artwork.height}
        alt="阿罗娜开心地微笑，伸出食指轻触屏幕"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        draggable={false}
        onLoad={() => onReady(true)}
        onError={() => onReady(false)}
      />
      {hasLayers && (
        <div className={styles.head} aria-hidden="true">
          <div
            ref={response}
            className={styles.headResponse}
            style={{ maskImage: `url(#${id}-head)` }}
          >
            <Image
              unoptimized
              className={styles.headImage}
              src={artwork.src}
              width={artwork.width}
              height={artwork.height}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
            <div
              className={styles.expressionRegion}
              style={
                expressionReady
                  ? ({ '--expressions': `url("${artwork.expressions}")` } as CSSProperties)
                  : undefined
              }
            >
              <div ref={half} className={`${styles.expression} ${styles.halfEyes}`} />
              <div ref={closed} className={`${styles.expression} ${styles.closedEyes}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
