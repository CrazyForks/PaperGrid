'use client'

import Image from 'next/image'
import { useSyncExternalStore, type CSSProperties } from 'react'
import { useTheme } from 'next-themes'
import { AronaVisual } from './arona-visual'
import type { AronaArtwork } from './arona-portrait'
import styles from './hero-section.module.css'

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

// GPT Image 2 illustration; character artwork is separate from the code license.
const plana: AronaArtwork = {
  src: '/assets/plana-touch.webp',
  expressions: '/assets/plana-expressions.webp',
  width: 1254,
  height: 1254,
  touchX: 31.8,
  touchY: 36.5,
  character: 'plana',
}

type Portrait = { src: string; width: number; height: number }

export function HeroCharacter({
  artwork,
  fallback,
}: {
  artwork: AronaArtwork | null
  fallback: Portrait
}) {
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)

  if (!mounted) {
    // CSS uses the early theme script before hydration. Only the visible background
    // is requested; mounting the interactive portrait then reuses that same URL.
    return (
      <>
        {[artwork ?? fallback, plana].map((portrait, index) => (
          <div
            key={index}
            className={`${styles.preview} ${index === 0 ? styles.previewLight : styles.previewDark}`}
            role="img"
            aria-label={index === 0 ? '碧蓝档案的阿罗娜' : '碧蓝档案的普拉娜'}
            style={
              {
                '--preview-image': `url("${portrait.src}")`,
                '--preview-ratio': portrait.width / portrait.height,
              } as CSSProperties
            }
          >
            <div className={styles.previewArtwork} />
          </div>
        ))}
      </>
    )
  }

  if (resolvedTheme === 'dark') return <AronaVisual key="plana" artwork={plana} />
  if (artwork) return <AronaVisual key="arona" artwork={artwork} />
  return (
    <Image
      unoptimized
      className={styles.character}
      src={fallback.src}
      alt="碧蓝档案的阿罗娜"
      width={fallback.width}
      height={fallback.height}
      loading="eager"
      fetchPriority="high"
      decoding="async"
    />
  )
}
