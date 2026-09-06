'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import styles from './hero-interaction.module.css'

type TouchListener = () => void
const InteractionContext = createContext<{
  pulse: number
  touch: () => void
  subscribe: (listener: TouchListener) => () => void
} | null>(null)

export function HeroInteraction({ children }: { children: ReactNode }) {
  const [pulse, setPulse] = useState(0)
  const listeners = useRef(new Set<TouchListener>())
  const subscribe = useCallback((listener: TouchListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])
  const touch = useCallback(() => {
    setPulse((value) => value + 1)
    for (const listener of listeners.current) listener()
  }, [])

  return (
    <InteractionContext.Provider value={{ pulse, touch, subscribe }}>
      {children}
    </InteractionContext.Provider>
  )
}

export function useHeroInteraction() {
  const interaction = useContext(InteractionContext)
  if (!interaction) throw new Error('Hero interaction requires HeroInteraction')
  return interaction
}

const ecg =
  'M0 40 H112 C118 40 121 40 126 40 C128 40 130 34 133 34 C136 34 138 40 142 40 C146 40 148 48 150 48 C154 48 156 12 160 12 C164 12 166 60 170 60 C174 60 176 40 180 40 C186 40 188 30 194 30 C200 30 202 40 208 40 H320'
// Leave the tip open so the baseline bends into and out of the heart without a junction.
const heart =
  'M0 40 H147.4 C154.4 40 157.2 40 153 35.8 C144.6 27.4 134.8 17.6 134.8 7.8 C134.8 -6.2 150.2 -11.8 160 0.8 C169.8 -11.8 185.2 -6.2 185.2 7.8 C185.2 17.6 175.4 27.4 167 35.8 C162.8 40 165.6 40 172.6 40 H320'

export function HeroWave() {
  const { subscribe } = useHeroInteraction()
  const stream = useRef<SVGGElement>(null)
  const [beats, setBeats] = useState([false, false, false])

  useEffect(
    () =>
      subscribe(() => {
        if (!stream.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const offset = -new DOMMatrixReadOnly(getComputedStyle(stream.current).transform).m41
        // Only change a beat whose leading edge is still outside the visible 320-unit window.
        const next = offset < 120 ? 1 : 2
        setBeats((current) => current.map((isHeart, index) => index === next || isHeart))
      }),
    [subscribe]
  )

  return (
    <div className={styles.wave} aria-hidden="true">
      <svg viewBox="0 -12 320 88" fill="none" focusable="false">
        <g
          ref={stream}
          className={styles.stream}
          onAnimationIteration={(event) => {
            if (event.target === event.currentTarget) {
              setBeats((current) => [current[1], current[2], false])
            }
          }}
        >
          {beats.map((isHeart, index) => (
            <g key={index} transform={`translate(${index * 320} 0)`}>
              <path className={styles.trace} d={isHeart ? heart : ecg} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
