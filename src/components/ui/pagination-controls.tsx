'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'

export function PaginationControls({ page, totalPages, onChange, disabled = false }: {
  page: number; totalPages: number; onChange: (page: number) => void; disabled?: boolean
}) {
  if (totalPages <= 1) return null
  return <nav aria-label="分页" className="flex items-center justify-center gap-4 py-5">
    <Button variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />上一页</Button>
    <span className="text-sm text-muted-foreground" aria-live="polite">{page} / {totalPages}</span>
    <Button variant="outline" size="sm" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>下一页<ChevronRight className="ml-1 h-4 w-4" /></Button>
  </nav>
}
