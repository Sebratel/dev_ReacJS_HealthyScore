import { DerivedRisk, Trend } from '@/types'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Package, DollarSign } from 'lucide-react'
import { cn, formatCurrency } from '@/utils/cn'
import { useChartTokens } from '@/hooks/useChartTokens'
import { softenColor } from '@/utils/healthColors'

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

// A superfície/borda saem de classe (token resolve sozinho); o accent precisa de
// valor concreto porque vai para atributo de SVG, onde `var()` não é resolvido.
const PROB_TO_SURFACE: Record<string, { bg: string; border: string }> = {
  critical: { bg: 'bg-risk-critical/8', border: 'border-risk-critical/25' },
  high: { bg: 'bg-risk-high/8', border: 'border-risk-high/25' },
  medium: { bg: 'bg-risk-medium/8', border: 'border-risk-medium/25' },
  low: { bg: 'bg-risk-low/8', border: 'border-risk-low/25' },
}

const PROB_TO_ACCENT: Record<string, keyof Pick<ReturnType<typeof useChartTokens>, 'riskCritical' | 'riskHigh' | 'riskMedium' | 'riskLow'>> = {
  critical: 'riskCritical',
  high: 'riskHigh',
  medium: 'riskMedium',
  low: 'riskLow',
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
    <div className="flex items-center gap-1 text-on-surface-variant text-[11px]">
      <Minus size={11} /> Estável
    </div>
  )
}

const RISK_LABEL: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' }

export function RiskCard({ type, risk, monthlyValue }: RiskCardProps) {
  const cfg = RISK_CONFIG[type]
  const surface = PROB_TO_SURFACE[risk.classification]
  const tokens = useChartTokens()
  const accent = tokens[PROB_TO_ACCENT[risk.classification]]

  return (
    <div className={cn('rounded-xl border p-5 flex flex-col gap-4', surface.bg, surface.border)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ color: accent }}>{cfg.icon}</span>
            <span className="text-sm font-semibold text-on-surface">{cfg.label}</span>
          </div>
          <p className="text-[11px] text-on-surface-variant">{cfg.description}</p>
        </div>
        <span className={cn('text-[10px] font-semibold border rounded-full px-2 py-0.5')} style={{ color: accent, borderColor: softenColor(accent, 0.25), backgroundColor: softenColor(accent, 0.08) }}>
          {RISK_LABEL[risk.classification]}
        </span>
      </div>

      {/* Main value */}
      <div className="flex items-end gap-4">
        <div>
          <div className="flex items-baseline gap-1">
            <span style={{ color: accent }} className="text-4xl font-bold tabular-nums leading-none">
              {type === 'revenue' ? formatCurrency(risk.probability * (monthlyValue ?? 0) / 100 * 12) : `${risk.probability}%`}
            </span>
            {type !== 'revenue' && (
              <span className="text-on-surface-variant text-sm">probabilidade</span>
            )}
          </div>
          {type === 'revenue' && (
            <p className="text-[11px] text-on-surface-variant mt-1">risco anual estimado</p>
          )}
        </div>

        {/* Circular mini gauge */}
        <div className="ml-auto">
          <svg width={52} height={52} viewBox="0 0 52 52">
            <circle cx={26} cy={26} r={20} fill="none" stroke={tokens.track} strokeWidth={6} />
            <circle
              cx={26} cy={26} r={20} fill="none"
              stroke={accent}
              strokeWidth={6}
              strokeDasharray={`${(risk.probability / 100) * 125.6} 125.6`}
              strokeLinecap="round"
              transform="rotate(-90 26 26)"
            />
            <text x={26} y={27} textAnchor="middle" dominantBaseline="middle" fill={accent} fontSize={10} fontWeight="700" fontFamily="Inter, sans-serif">
              {type === 'revenue' ? `${risk.probability}%` : `${risk.probability}%`}
            </text>
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-surface-container-low rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${risk.probability}%`, backgroundColor: accent }} />
      </div>

      {/* Trend */}
      <TrendIndicator trend={risk.trend} value={risk.trendValue} />

      {/* Factors */}
      <div className="space-y-1.5 pt-2 border-t border-outline/50">
        {risk.factors.slice(0, 3).map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <AlertTriangle size={9} style={{ color: accent }} className="shrink-0" />
            <span className="text-[11px] text-on-surface/70">{f}</span>
          </div>
        ))}
      </div>

      {/* Description */}
      <p className="text-[11px] text-on-surface-variant leading-relaxed italic">{risk.description}</p>
    </div>
  )
}
