'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type PreviewImage = { src: string; alt: string; width: number; height: number }
const ImagePreviewDialog = dynamic(() => import('./image-preview-dialog'), {
  ssr: false,
  loading: () => (
    <div className="ba-image-preview-pending" role="status">
      正在打开图片…
    </div>
  ),
})

/** One lazy viewer per article. Its children can still be rendered on the server. */
export function ArticleImages({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLImageElement | null>(null)
  const [gallery, setGallery] = useState<{ images: PreviewImage[]; index: number } | null>(null)

  useEffect(() => {
    const images = Array.from(rootRef.current?.querySelectorAll('img') || [])
      // An image used as a link keeps the author's original link behavior.
      .filter((img) => !img.closest('a, button, [role="button"]'))
    const attributes = ['role', 'tabindex', 'aria-label', 'aria-haspopup', 'data-preview-image']
    const previous = images.map((img) => attributes.map((name) => img.getAttribute(name)))
    images.forEach((img) => {
      img.setAttribute('role', 'button')
      img.tabIndex = 0
      img.setAttribute('aria-label', img.alt ? `放大查看：${img.alt}` : '放大查看图片')
      img.setAttribute('aria-haspopup', 'dialog')
      img.dataset.previewImage = 'true'
    })
    return () =>
      images.forEach((img, i) =>
        attributes.forEach((name, j) => {
          const value = previous[i][j]
          if (value === null) img.removeAttribute(name)
          else img.setAttribute(name, value)
        })
      )
  }, [children])

  const open = (target: EventTarget) => {
    if (!(target instanceof HTMLImageElement) || target.dataset.previewImage !== 'true')
      return false
    const elements = Array.from(
      rootRef.current?.querySelectorAll<HTMLImageElement>('img[data-preview-image="true"]') || []
    ).filter(
      (img) => Boolean(img.currentSrc || img.getAttribute('src')) && img.getClientRects().length > 0
    )
    const index = elements.indexOf(target)
    if (index < 0) return false
    triggerRef.current = target
    target.focus({ preventScroll: true })
    // Reuse exactly the displayed URLs; protected media keeps its normal authorization.
    setGallery({
      index,
      images: elements.map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
    })
    return true
  }

  return (
    <div
      ref={rootRef}
      className="mdx-content max-w-none min-w-0"
      onClick={(event) => {
        if (
          !event.defaultPrevented &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey
        )
          open(event.target)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && gallery) setGallery(null)
        if (
          (event.key === 'Enter' || event.key === ' ') &&
          !event.defaultPrevented &&
          open(event.target)
        )
          event.preventDefault()
      }}
    >
      {children}
      {gallery && (
        <ImagePreviewDialog
          images={gallery.images}
          initialIndex={gallery.index}
          onClose={() => setGallery(null)}
          onRestoreFocus={() =>
            triggerRef.current?.isConnected && triggerRef.current.focus({ preventScroll: true })
          }
        />
      )}
    </div>
  )
}
