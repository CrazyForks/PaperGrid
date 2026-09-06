'use client'
import { usePathname } from 'next/navigation'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div className="page-enter" key={pathname}>{children}</div>
}
