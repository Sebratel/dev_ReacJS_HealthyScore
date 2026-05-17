import { SecondaryScore, Trend } from '@/types'
import { TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, MinusCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { HEALTH_COLORS, HEALTH_LABELS } from './HealthGauge'

interface ScoreModuleProps {
  name: string
  icon: React.ReactNode
  score: SecondaryScore
  expanded?: boolean
}

function TrendBadge({ trend, value }: { trend: Trend; value: number }) {
  const cfg = {
    improving: { icon: TrendingUp, className: 'text-risk-low bg-risk-low/10 border-risk-low/20', label: `+${Math.abs(value)}pts` },
    degrading: { icon: TrendingDown, className: 'text-risk-critical bg-risk-critical/10 border-risk-critical/20', label: `-${Math.abs(value)}pts` },
    stable: { icon: Minus, className: 'text-gray-500 bg-gray-500/10 border-gray-500/20', label: 'Estável' },
  }[trend]
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-1.5 py-0.5', cfg.className)}>
      <Icon size={9} />
      {cfg.label}
    </span>
  )
}

export function ScoreModule({ name, icon, score, expanded = false }: ScoreModuleProps) {
  const color = HEALTH_COLORS[score.classification]
  const label = HEALTH_LABELS[score.classification]

  return (
    <div className={cn(
      'bg-app-card border rounded-xl p-4 flex flex-col gap-3 hover:border-app-borderLight transition-all',
      score.classification === 'critical' && 'border-risk-critical/20 bg-risk-critical/5',
      score.classification === 'high_risk' && 'border-risk-high/20',
      score.classification === 'excellent' && 'border-brand-cyan/15',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-app-surface border border-app-border flex items-center justify-center text-gray-400">
            {icon}
          </div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{name}</span>
        </div>
        <span className="text-[10px] text-gray-600 border border-app-border rounded px-1.5 py-0.5 font-mono">
          Peso {Math.round(score.weight * 100)}%
        </span>
      </div>

      {/* Score value */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col">
          <span style={{ color }} className="text-3xl font-bold tabular-nums leading-none">{score.value}</span>
          <span className="text-[10px] mt-0.5" style={{ color }}>{label}</span>
        </div>
        <div className="flex-1 pb-1">
          {/* Score bar */}
          <div className="w-full h-1.5 bg-app-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${score.value}%`, backgroundColor: color }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-gray-700">0</span>
            <span className="text-[9px] text-gray-700">100</span>
          </div>
        </div>
      </div>

      {/* Trend */}
      <div className="flex items-center gap-2">
        <TrendBadge trend={score.trend} value={Math.abs(score.trendValue)} />
        <span className="text-[10px] text-gray-600">vs. 30 dias</span>
      </div>

      {/* Factors */}
      {(expanded || score.factors.length <= 4) && (
        <div className="space-y-1.5 pt-1 border-t border-app-border">
          {score.factors.slice(0, expanded ? undefined : 4).map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {f.impact === 'positive' ? (
                <CheckCircle size={10} className="text-risk-low shrink-0" />
              ) : f.impact === 'negative' ? (
                <XCircle size={10} className="text-risk-critical shrink-0" />
              ) : (
                <MinusCircle size={10} className="text-gray-600 shrink-0" />
              )}
              <span className={cn('text-[11px] flex-1', f.impact === 'positive' ? 'text-gray-300' : f.impact === 'negative' ? 'text-gray-300' : 'text-gray-500')}>
                {f.label}
              </span>
              {f.value && (
                <span className={cn('text-[10px] font-mono', f.impact === 'positive' ? 'text-risk-low' : f.impact === 'negative' ? 'text-risk-critical' : 'text-gray-600')}>
                  {f.value}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Insight */}
      <p className="text-[11px] text-gray-500 leading-relaxed italic border-t border-app-border pt-2">
        "{score.insight}"
      </p>
    </div>
  )
}
