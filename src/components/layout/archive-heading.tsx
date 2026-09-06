import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
export function ArchiveHeading({ title, description }: { title: string; description?: string }) {
  return (
    <header className="ba-archive-heading ba-container">
      <nav aria-label="面包屑">
        <Link href="/">首页</Link>
        <ChevronRight size={14} />
        <span aria-current="page">{title}</span>
      </nav>
      <div className="ba-archive-title">
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      {description && <p>{description}</p>}
    </header>
  )
}
