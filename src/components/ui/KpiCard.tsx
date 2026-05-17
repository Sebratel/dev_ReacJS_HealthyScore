import { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/utils/cn'

interface KpiCardProps {
  label: string
  value: string | number
  subtitle?: string
  delta?: number
  deltaLabel?: string
  icon?: ReactNode
  iconColor?: string
  variant?: 'default' | 'danger' | 'success' | 'warning' | 'brand'
  size?: 'sm' | 'md'
}

const VARIANT_STYLES = {
  default: 'border-app-border',
  danger: 'border-risk-critical/20 bg-risk-critical/5',
  success: 'border-risk-low/20 bg-risk-low/5',
  warning: 'border-risk-medium/20 bg-risk-medium/5',
  brand: 'border-brand-blue/20 bg-brand-blue/5',
}

export function KpiCard({ label, value, subtitle, delta, deltaLabel, icon, iconColor = 'text-brand-blue', variant = 'default', size = 'md' }: KpiCardProps) {
  const isPositive = delta !== undefined && delta > 0
  const isNegative = delta !== undefined && delta < 0

  return (
    <div className={cn('bg-app-card border rounded-xl p-4 flex flex-col gap-3 hover:border-app-borderLight transition-all', VARIANT_STYLES[variant])}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        {icon && (
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center bg-app-surface', iconColor)}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className={cn('font-bold text-white tabular-nums', size === 'md' ? 'text-2xl' : 'text-lg')}>{value}</span>
        {subtitle && <span className="text-[11px] text-gray-500">{subtitle}</span>}
      </div>

      {delta !== undefined && (
        <div className={cn('flex items-center gap-1 text-[11px] font-medium', isPositive ? 'text-risk-low' : isNegative ? 'text-risk-critical' : 'text-gray-500')}>
          {isPositive ? <TrendingUp size={11} /> : isNegative ? <TrendingDown size={11} /> : <Minus size={11} />}
          <span>{isPositive ? '+' : ''}{delta.toFixed(1)}%</span>
          {deltaLabel && <span className="text-gray-600">{deltaLabel}</span>}
        </div>
      )}
    </div>
  )
}
