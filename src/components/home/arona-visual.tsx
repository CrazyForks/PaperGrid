'use client'

import { Scan } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useHeroInteraction } from './hero-interaction'
import { AronaPortrait, type AronaArtwork } from './arona-portrait'
import styles from './arona-visual.module.css'

export function AronaVisual({ artwork }: { artwork: AronaArtwork }) {
  const scene = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const { pulse, touch } = useHeroInteraction()
  const [ready, setReady] = useState(false)

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )

  function resetPosition() {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    scene.current?.style.setProperty('--look-x', '0px')
    scene.current?.style.setProperty('--look-y', '0px')
  }

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType !== 'mouse' ||
      !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches
    )
      return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      scene.current?.style.setProperty('--look-x', `${x * 8}px`)
      scene.current?.style.setProperty('--look-y', `${y * 6}px`)
    })
  }

  return (
    <div
      ref={scene}
      className={styles.scene}
      onPointerMove={followPointer}
      onPointerLeave={resetPosition}
      style={
        {
          '--art-ratio': artwork.width / artwork.height,
          '--touch-x': `${artwork.touchX}%`,
          '--touch-y': `${artwork.touchY}%`,
        } as CSSProperties
      }
    >
      <div className={styles.stage}>
        <div className={styles.light} aria-hidden="true" />
        <AronaPortrait artwork={artwork} ready={ready} onReady={setReady} />
        {ready && (
          <button
            type="button"
            className={styles.contact}
            aria-label="轻触阿罗娜的指尖，泛起光圈"
            onClick={touch}
          >
            <span className={styles.breathing} aria-hidden="true">
              <span className={styles.contactGlow} />
              <span className={styles.orbit}>
                <Scan strokeWidth={1.4} />
              </span>
            </span>
            {pulse > 0 && (
              <span key={pulse} className={styles.burst} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
