import type { CSSProperties } from 'react'
import styles from './archive-title.module.css'

// Halo/cross paths adapted from nulla2011/bluearchive-logo (MIT).
// License: public/assets/blue-archive/logo-LICENSE.txt.
const halo =
  'M185 75.1c-23 2.2-39.8 9.9-45.4 20.7-3.2 6.2-3.8 10.8-2.1 17.4 3.1 11.7 9.9 22.3 22.5 34.9 17.7 17.8 39.9 32.9 71.9 49.1 16.8 8.5 19 9.1 19.1 5.6 0-.5-6.8-4.2-15-8.3-27.9-14-46.7-26.5-62.8-42-20-19.1-27.7-34.5-23.8-47.8 13.9-48 171.4-20.2 259 45.7 12.5 9.4 27.7 24.6 33.2 33.2 9.1 14.3 9.8 29.5 1.5 36.8-1.1 1.1-2.1 2.3-2.1 2.8 0 .4 3.7.8 8.3.8h8.3l1.8-3.7c6.5-13.7-1-32.2-21.3-52.3-46.5-46-145.2-86.9-224-93-14.9-1.1-16.7-1.1-29.1.1z'
const cross =
  'M366.5 28.5c.543.06.876.393 1 1a23718.046 23718.046 0 0 0-53 110.5 9965.6 9965.6 0 0 0 170 81A5795.598 5795.598 0 0 1 307 151.5l-141 234A11825.57 11825.57 0 0 1 293.5 146a29249.106 29249.106 0 0 0-207-96 193.841 193.841 0 0 1 21 7 22718.148 22718.148 0 0 0 193 76.5c2.128-.554 3.628-1.887 4.5-4 20.511-33.695 41.011-67.361 61.5-101Z'

// Estimate full-width glyphs and Latin separately; reserve room for the slant.
function textUnits(text: string) {
  return Array.from(text).reduce(
    (width, char) => width + (/[^\u0020-\u007e]|[MW@%&]/.test(char) ? 1 : 0.68),
    0
  )
}

export function ArchiveTitle({ title, compact = false }: { title: string; compact?: boolean }) {
  const Frame = compact ? 'span' : 'div'
  const Title = compact ? 'span' : 'h1'
  const letters = Array.from(title)
  const middle = Math.ceil(letters.length / 2)
  const breaks = letters.flatMap((letter, index) => (/\s/.test(letter) ? [index] : []))
  const split = breaks.length
    ? breaks.reduce((best, index) =>
        Math.abs(index - middle) < Math.abs(best - middle) ? index : best
      )
    : middle
  const left = letters.slice(0, split).join('')
  const right = letters.slice(split).join('')
  const stacked = !compact && textUnits(title) > 12
  const units = stacked ? Math.max(textUnits(left), textUnits(right)) : textUnits(title)

  return (
    <Frame className={`${styles.frame} ${compact ? styles.compact : ''}`}>
      <Title
        id={compact ? undefined : 'hero-title'}
        className={styles.title}
        aria-label={title}
        data-stacked={stacked || undefined}
        style={{ '--title-size': `${100 / (units + 1.3)}cqw` } as CSSProperties}
      >
        <span className={styles.left}>{left}</span>
        <span className={styles.right}>
          <svg className={styles.halo} viewBox="0 0 500 500" aria-hidden="true">
            <path d={halo} />
          </svg>
          <span className={styles.word}>{right}</span>
          <svg className={styles.cross} viewBox="0 0 500 500" aria-hidden="true">
            <path d={cross} />
          </svg>
        </span>
      </Title>
    </Frame>
  )
}
