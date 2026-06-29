import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface KPICardProps {
  title: string
  value: number
  target?: number
  subtitle?: string
  icon: LucideIcon
  color: 'blue' | 'purple' | 'yellow' | 'green' | 'red' | 'gray'
}

const colorMap = {
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   text: 'text-blue-700',   bar: 'bg-blue-500' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-700', bar: 'bg-purple-500' },
  yellow: { bg: 'bg-yellow-50', icon: 'bg-yellow-100 text-yellow-600', text: 'text-yellow-700', bar: 'bg-yellow-500' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  text: 'text-green-700',  bar: 'bg-green-500' },
  red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',      text: 'text-red-700',    bar: 'bg-red-500' },
  gray:   { bg: 'bg-gray-50',   icon: 'bg-gray-100 text-gray-600',    text: 'text-gray-700',   bar: 'bg-gray-400' },
}

export default function KPICard({ title, value, target, subtitle, icon: Icon, color }: KPICardProps) {
  const c = colorMap[color]
  const pct = target ? Math.min(Math.round((value / target) * 100), 100) : 0

  return (
    <div className={cn('rounded-2xl p-5 flex flex-col gap-3', c.bg)}>
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', c.icon)}>
          <Icon size={20} />
        </div>
        {target && (
          <span className="text-xs text-gray-500">目標 {target}</span>
        )}
      </div>

      <div>
        <div className={cn('text-3xl font-bold', c.text)}>{value}</div>
        <div className="text-sm font-medium text-gray-700 mt-0.5">{title}</div>
        {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
      </div>

      {target && (
        <div>
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', c.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">{pct}% 達成</div>
        </div>
      )}
    </div>
  )
}
