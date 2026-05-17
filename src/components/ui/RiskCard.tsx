import { DerivedRisk, Trend } from '@/types'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Package, DollarSign } from 'lucide-react'
import { cn, formatCurrency } from '@/utils/cn'

type RiskType = 'churn' | 'equipment' | 'revenue'

interface RiskCardProps {
  type: RiskType
  risk: DerivedRisk
  monthlyValue?: number
}

const RISK_CONFIG: Record<RiskType, { label: string; icon: React.ReactNode; description: string }> = {
  churn: {
    label: 'Risco de Churn',
    icon: <TrendingDown size={16} />,
    description: 'Probabilidade de cancelamento nos próximos 30 dias',
  },
  equipment: {
    label: 'Risco de Não Devolução',
    icon: <Package size={16} />,
    description: 'Probabilidade de não devolução de equipamentos',
  },
  revenue: {
    label: 'Risco de Receita',
    icon: <DollarSign size={16} />,
    description: 'Impacto financeiro estimado em caso de churn',
  },
}

const PROB_TO_STYLE: Record<string, { bg: string; border: string; accent: string }> = {
  critical: { bg: 'bg-risk-critical/8', border: 'border-risk-critical/25', accent: '#ef4444' },
  high: { bg: 'bg-risk-high/8', border: 'border-risk-high/25', accent: '#f97316' },
  medium: { bg: 'bg-risk-medium/8', border: 'border-risk-medium/25', accent: '#f59e0b' },
  low: { bg: 'bg-risk-low/8', border: 'border-risk-low/25', accent: '#10b981' },
}

function TrendIndicator({ trend, value }: { trend: Trend; value: number }) {
  if (trend === 'improving') return (
    <div className="flex items-center gap-1 text-risk-low text-[11px] font-medium">
      <TrendingDown size={11} /> {Math.abs(value)}pts melhorando
    </div>
  )
  if (trend === 'degrading') return (
    <div className="flex items-center gap-1 text-risk-critical text-[11px] font-medium">
      <TrendingUp size={11} /> {Math.abs(value)}pts piorando
    </div>
  )
  return (
    <div className="flex items-center gap-1 text-gray-500 text-[11px]">
      <Minus size={11} /> Estável
    </div>
  )
}

const RISK_LABEL: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' }

export function RiskCard({ type, risk, monthlyValue }: RiskCardProps) {
  const cfg = RISK_CONFIG[type]
  const style = PROB_TO_STYLE[risk.classification]

  return (
    <div className={cn('rounded-xl border p-5 flex flex-col gap-4', style.bg, style.border)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ color: style.accent }}>{cfg.icon}</span>
            <span className="text-sm font-semibold text-gray-100">{cfg.label}</span>
          </div>
          <p className="text-[11px] text-gray-500">{cfg.description}</p>
        </div>
        <span className={cn('text-[10px] font-semibold border rounded-full px-2 py-0.5')} style={{ color: style.accent, borderColor: style.accent + '40', backgroundColor: style.accent + '15' }}>
          {RISK_LABEL[risk.classification]}
        </span>
      </div>

      {/* Main value */}
      <div className="flex items-end gap-4">
        <div>
          <div className="flex items-baseline gap-1">
            <span style={{ color: style.accent }} className="text-4xl font-bold tabular-nums leading-none">
              {type === 'revenue' ? formatCurrency(risk.probability * (monthlyValue ?? 0) / 100 * 12) : `${risk.probability}%`}
            </span>
            {type !== 'revenue' && (
              <span className="text-gray-500 text-sm">probabilidade</span>
            )}
          </div>
          {type === 'revenue' && (
            <p className="text-[11px] text-gray-500 mt-1">risco anual estimado</p>
          )}
        </div>

        {/* Circular mini gauge */}
        <div className="ml-auto">
          <svg width={52} height={52} viewBox="0 0 52 52">
            <circle cx={26} cy={26} r={20} fill="none" stroke="#1a2236" strokeWidth={6} />
            <circle
              cx={26} cy={26} r={20} fill="none"
              stroke={style.accent}
              strokeWidth={6}
              strokeDasharray={`${(risk.probability / 100) * 125.6} 125.6`}
              strokeLinecap="round"
              transform="rotate(-90 26 26)"
            />
            <text x={26} y={27} textAnchor="middle" dominantBaseline="middle" fill={style.accent} fontSize={10} fontWeight="700" fontFamily="Inter, sans-serif">
              {type === 'revenue' ? `${risk.probability}%` : `${risk.probability}%`}
            </text>
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-app-surface rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${risk.probability}%`, backgroundColor: style.accent }} />
      </div>

      {/* Trend */}
      <TrendIndicator trend={risk.trend} value={risk.trendValue} />

      {/* Factors */}
      <div className="space-y-1.5 pt-2 border-t border-app-border/50">
        {risk.factors.slice(0, 3).map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <AlertTriangle size={9} style={{ color: style.accent }} className="shrink-0" />
            <span className="text-[11px] text-gray-400">{f}</span>
          </div>
        ))}
      </div>

      {/* Description */}
      <p className="text-[11px] text-gray-500 leading-relaxed italic">{risk.description}</p>
    </div>
  )
}
