import { type LucideIcon } from 'lucide-react'
interface StatsCardProps {
  title: string
  value: string | number
  change?: number
  icon: LucideIcon
  color?: string
  bgColor?: string
}
export function StatsCard({ title, value, change, icon: Icon }: StatsCardProps) {
  return (
    <div className="ba-stat">
      <div className="ba-stat-label">
        <Icon size={18} />
        <span>{title}</span>
      </div>
      <strong>{value}</strong>
      {change !== undefined && <small>{change}% 为本周新增</small>}
    </div>
  )
}
