'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/** Edge navigation uses its own positioning, independent of centered dialogs. */
export function NavigationDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  side = 'left',
  onOpenAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
  trigger?: ReactNode
  side?: 'left' | 'right'
  onOpenAutoFocus?: (event: Event) => void
}) {
  const pathname = usePathname()
  const previousPath = useRef(pathname)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      onOpenChange(false)
    }
  }, [pathname, onOpenChange])
  useEffect(() => {
    if (!open) return
    const dismiss = () => onOpenChange(false)
    // A browser Back gesture must never leave a stale drawer over a new page.
    window.addEventListener('popstate', dismiss)
    const desktop = window.matchMedia('(min-width: 1024px)')
    desktop.addEventListener('change', dismiss)
    return () => {
      window.removeEventListener('popstate', dismiss)
      desktop.removeEventListener('change', dismiss)
    }
  }, [open, onOpenChange])
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="ba-drawer-overlay" />
        <Dialog.Content
          className="ba-drawer"
          data-side={side}
          onOpenAutoFocus={(event) => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null
            onOpenAutoFocus?.(event)
          }}
          onCloseAutoFocus={(event) => {
            if (!trigger && returnFocus.current?.isConnected) {
              event.preventDefault()
              returnFocus.current.focus({ preventScroll: true })
            }
          }}
        >
          <header className="ba-drawer-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
            </div>
            <Dialog.Close className="ba-icon-button" aria-label="关闭导航">
              <X size={22} />
            </Dialog.Close>
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          </header>
          <div className="ba-drawer-scroll">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
