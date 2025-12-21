'use client'

import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  icon?: LucideIcon
  color?: 'blue' | 'green' | 'red' | 'purple' | 'amber' | 'cyan'
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
}

const colorClasses = {
  blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  green: 'from-green-500/20 to-green-600/10 border-green-500/30',
  red: 'from-red-500/20 to-red-600/10 border-red-500/30',
  purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
  cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
}

const iconColorClasses = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  red: 'text-red-400',
  purple: 'text-purple-400',
  amber: 'text-amber-400',
  cyan: 'text-cyan-400',
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
  subtitle,
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        'relative overflow-hidden bg-gradient-to-br border',
        colorClasses[color]
      )}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 md:space-y-1 min-w-0 flex-1">
            <p className="text-xs md:text-sm text-muted-foreground truncate">{title}</p>
            <p className="text-lg md:text-2xl font-bold tracking-tight truncate">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className={cn('p-1.5 md:p-2 rounded-lg bg-background/50 flex-shrink-0', iconColorClasses[color])}>
              <Icon className="h-4 w-4 md:h-5 md:w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
