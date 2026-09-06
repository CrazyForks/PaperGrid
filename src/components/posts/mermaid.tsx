'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { normalizeMermaidForCompatibility } from '@/lib/mermaid-compat'

interface MermaidProps {
  content: string
}

type MermaidLike = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

export function Mermaid({ content }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mermaidRef = useRef<MermaidLike | null>(null)
  const [hasError, setHasError] = useState(false)
  const [svgCode, setSvgCode] = useState<string>('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('mermaid')
        if (cancelled) return
        const m =
          (mod as unknown as { default?: MermaidLike }).default ?? (mod as unknown as MermaidLike)
        mermaidRef.current = m
        m.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#e8f7ff',
            primaryTextColor: '#183653',
            primaryBorderColor: '#28a8df',
            lineColor: '#567f96',
            secondaryColor: '#f1faff',
            tertiaryColor: '#ffffff',
            fontFamily: 'Noto Sans SC Variable, sans-serif',
          },
          securityLevel: 'strict',
          suppressErrorRendering: true,
          fontFamily: 'inherit',
          flowchart: {
            htmlLabels: false,
            useMaxWidth: true,
          },
        })
        setReady(true)
      } catch (err) {
        console.error('Mermaid load error:', err)
        setHasError(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const mermaid = mermaidRef.current
    if (!mermaid) return

    if (ref.current && content) {
      let cancelled = false
      const renderDiagram = async (source: string) => {
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`
        return mermaid.render(id, source)
      }

      try {
        setHasError(false)
        setSvgCode('')
        if (ref.current) {
          ref.current.innerHTML = ''
        }
        const normalizedContent = normalizeMermaidForCompatibility(content)

        renderDiagram(content)
          .catch(async (initialError: unknown) => {
            if (normalizedContent === content) {
              throw initialError
            }
            return renderDiagram(normalizedContent)
          })
          .then(({ svg }: { svg: string }) => {
            if (cancelled) return
            setSvgCode(svg)
            if (ref.current) {
              ref.current.innerHTML = svg
            }
          })
          .catch((err: unknown) => {
            console.error('Mermaid render error:', err)
            setSvgCode('')
            setHasError(true)
          })
      } catch (err) {
        console.error('Mermaid initialization error:', err)
        setSvgCode('')
        setHasError(true)
      }

      return () => {
        cancelled = true
      }
    }
  }, [content, ready])

  if (hasError) {
    return (
      <div className="my-6 rounded border p-4">
        <p className="text-muted-foreground mb-3 text-sm">图表暂时无法显示，以下是原始内容。</p>
        <pre className="overflow-x-auto text-sm">{content}</pre>
      </div>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className="ba-mermaid"
          role="button"
          tabIndex={0}
          aria-label="放大图表"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.currentTarget.click()
            }
          }}
          ref={ref}
        />
      </DialogTrigger>
      <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-auto border-none bg-white p-6 shadow-none sm:max-w-[95vw]">
        <DialogTitle className="sr-only">Mermaid Diagram</DialogTitle>
        <div
          className="flex min-h-[50vh] w-full items-center justify-center"
          dangerouslySetInnerHTML={{ __html: svgCode }}
        />
      </DialogContent>
    </Dialog>
  )
}
