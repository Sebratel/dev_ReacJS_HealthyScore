import { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react'
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
  /** Definição do indicador, no ícone de ajuda ao lado do rótulo. Nome de KPI
   *  raramente basta: "receita em risco" já foi lida como prejuízo a realizar. */
  hint?: string
  className?: string
}

const VARIANT_STYLES = {
  default: 'border-outline',
  danger: 'border-risk-critical/20 bg-risk-critical/5',
  success: 'border-risk-low/20 bg-risk-low/5',
  warning: 'border-risk-medium/20 bg-risk-medium/5',
  brand: 'border-primary/20 bg-primary/5',
}

export function KpiCard({ label, value, subtitle, delta, deltaLabel, icon, iconColor = 'text-primary', variant = 'default', size = 'md', hint, className }: KpiCardProps) {
  const isPositive = delta !== undefined && delta > 0
  const isNegative = delta !== undefined && delta < 0

  return (
    <div className={cn('group bg-surface-container-lowest border border-outline rounded-2xl p-4 sm:p-5 flex flex-col gap-3 shadow-card transition-[box-shadow,transform,border-color] duration-300 ease-nexa hover:shadow-card-md hover:border-outline-strong', VARIANT_STYLES[variant], className)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.08em]">
          {label}
          {hint && (
            <span title={hint} aria-label={hint} role="note" className="inline-flex shrink-0 text-on-surface-variant/70 hover:text-on-surface cursor-help transition-colors">
              <HelpCircle size={11} aria-hidden />
            </span>
          )}
        </span>
        {icon && (
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container-low ring-1 ring-inset ring-outline', iconColor)}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className={cn('font-semibold text-on-surface tabular-nums tracking-tight', size === 'md' ? 'text-2xl' : 'text-lg')}>{value}</span>
        {subtitle && <span className="text-[11px] text-on-surface-variant/80">{subtitle}</span>}
      </div>

      {delta !== undefined && (
        <div className={cn('flex items-center gap-1 text-[11px] font-medium', isPositive ? 'text-risk-low' : isNegative ? 'text-risk-critical' : 'text-on-surface-variant')}>
          {isPositive ? <TrendingUp size={11} /> : isNegative ? <TrendingDown size={11} /> : <Minus size={11} />}
          <span>{isPositive ? '+' : ''}{delta.toFixed(1)}%</span>
          {deltaLabel && <span className="text-on-surface-variant/90">{deltaLabel}</span>}
        </div>
      )}
    </div>
  )
}
