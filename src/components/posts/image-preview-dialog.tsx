'use client'

import { TriangleLoader } from '@/components/loading/triangle-loader'

/* eslint-disable @next/next/no-img-element -- Reuse authorized media URLs directly; the image optimizer must not proxy protected files. */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, Minus, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { PreviewImage } from './article-images'

export default function ImagePreviewDialog({
  images,
  initialIndex,
  onClose,
  onRestoreFocus,
}: {
  images: PreviewImage[]
  initialIndex: number
  onClose: () => void
  onRestoreFocus: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const change = (next: number) => setIndex(Math.max(0, Math.min(images.length - 1, next)))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        fullScreen
        className="ba-image-viewer"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
      >
        <ImageSlide
          key={index}
          image={images[index]}
          index={index}
          count={images.length}
          previous={() => change(index - 1)}
          next={() => change(index + 1)}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}

function ImageSlide({
  image,
  index,
  count,
  previous,
  next,
  onClose,
}: {
  image: PreviewImage
  index: number
  count: number
  previous: () => void
  next: () => void
  onClose: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(
    null
  )
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [natural, setNatural] = useState({ width: image.width, height: image.height })
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const setScale = (value: number) => setZoom(Math.max(1, Math.min(4, value)))

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setViewport({ width, height })
    })
    resize.observe(viewport)
    viewport.focus({ preventScroll: true })
    return () => resize.disconnect()
  }, [])

  const fit = Math.min(
    1,
    viewport.width / Math.max(1, natural.width),
    viewport.height / Math.max(1, natural.height)
  )
  const endDrag = () => {
    dragRef.current = null
  }
  return (
    <div
      className="ba-image-slide"
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (event.key === '+' || event.key === '=') {
          event.preventDefault()
          setScale(zoom + 0.5)
        }
        if (event.key === '-') {
          event.preventDefault()
          setScale(zoom - 0.5)
        }
        if (event.key === '0') {
          event.preventDefault()
          setScale(1)
        }
        if (zoom === 1 && event.key === 'ArrowLeft') {
          event.preventDefault()
          previous()
        }
        if (zoom === 1 && event.key === 'ArrowRight') {
          event.preventDefault()
          next()
        }
      }}
    >
      <header className="ba-image-toolbar">
        <DialogTitle className="ba-image-caption">{image.alt || '图片预览'}</DialogTitle>
        <div className="ba-image-actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label="缩小图片"
            disabled={zoom <= 1 || status !== 'ready'}
            onClick={() => setScale(zoom - 0.5)}
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="放大图片"
            disabled={zoom >= 4 || status !== 'ready'}
            onClick={() => setScale(zoom + 0.5)}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="适应窗口"
            disabled={zoom === 1}
            onClick={() => setScale(1)}
          >
            <Maximize />
          </Button>
          <Button variant="ghost" size="icon" aria-label="关闭图片预览" onClick={onClose}>
            <X />
          </Button>
        </div>
      </header>
      <div
        ref={viewportRef}
        className="ba-image-viewport"
        data-zoomed={zoom > 1}
        tabIndex={0}
        role="region"
        aria-label="图片查看区域"
        onClick={(event) => {
          if (event.target === event.currentTarget && zoom === 1) onClose()
        }}
        onDoubleClick={() => {
          if (status === 'ready') setScale(zoom === 1 ? 2 : 1)
        }}
        onPointerDown={(event) => {
          if (zoom <= 1 || event.pointerType !== 'mouse' || event.button !== 0) return
          event.preventDefault()
          const node = event.currentTarget
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: node.scrollLeft,
            top: node.scrollTop,
            id: event.pointerId,
          }
          node.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.id !== event.pointerId) return
          event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX
          event.currentTarget.scrollTop = drag.top + drag.y - event.clientY
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        {status === 'error' ? (
          <p className="ba-image-message" role="status">
            图片加载失败，请关闭后重试。
          </p>
        ) : (
          <>
            {status === 'loading' && (
              <p className="ba-image-message" role="status">
                <TriangleLoader />
                正在加载图片…
              </p>
            )}
            <img
              src={image.src}
              alt={image.alt}
              draggable={false}
              className="ba-image-original"
              style={{
                width: Math.max(1, natural.width * fit * zoom),
                height: Math.max(1, natural.height * fit * zoom),
                visibility:
                  status === 'ready' && viewport.width > 0 && viewport.height > 0
                    ? 'visible'
                    : 'hidden',
              }}
              onLoad={(event) => {
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
                setStatus('ready')
              }}
              onError={() => setStatus('error')}
            />
          </>
        )}
      </div>
      <footer className="ba-image-footer">
        <Button
          variant="ghost"
          size="icon"
          aria-label="上一张图片"
          disabled={index === 0}
          onClick={previous}
        >
          <ChevronLeft />
        </Button>
        <span aria-live="polite">
          {index + 1} / {count}
          <small>{zoom === 1 ? '适应窗口' : `${zoom}×`}</small>
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="下一张图片"
          disabled={index === count - 1}
          onClick={next}
        >
          <ChevronRight />
        </Button>
      </footer>
    </div>
  )
}
