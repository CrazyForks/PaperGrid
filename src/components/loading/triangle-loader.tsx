import styles from './loading.module.css'

/** Small, shared indicator for actual pending work (routes, search and images). */
export function TriangleLoader({ className = '' }: { className?: string }) {
  return (
    <svg className={`${styles.triangles} ${className}`} viewBox="0 0 48 42" aria-hidden="true">
      <path d="M24 2 34 19H14Z" />
      <path d="m12 22 10 17H2Z" />
      <path d="M36 22 46 39H26Z" />
      <path d="M14 21h20L24 38Z" />
    </svg>
  )
}
