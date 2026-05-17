import { HealthClassification } from '@/types'

export const HEALTH_COLORS: Record<HealthClassification, string> = {
  critical: '#ef4444',
  high_risk: '#f97316',
  attention: '#f59e0b',
  healthy: '#10b981',
  excellent: '#22d3ee',
}

export const HEALTH_LABELS: Record<HealthClassification, string> = {
  critical: 'Crítico',
  high_risk: 'Alto Risco',
  attention: 'Atenção',
  healthy: 'Saudável',
  excellent: 'Excelente',
}

export function scoreToHealthClass(v: number): HealthClassification {
  if (v >= 81) return 'excellent'
  if (v >= 61) return 'healthy'
  if (v >= 41) return 'attention'
  if (v >= 21) return 'high_risk'
  return 'critical'
}

interface HealthGaugeProps {
  score: number
  size?: number
  showLabel?: boolean
  strokeWidth?: number
}

export function HealthGauge({ score, size = 160, showLabel = true, strokeWidth: sw }: HealthGaugeProps) {
  const strokeWidth = sw ?? Math.max(8, size * 0.072)
  const r = size / 2 - strokeWidth - 2
  const cx = size / 2
  const cy = size / 2
  const C = 2 * Math.PI * r
  const arcFraction = 0.75
  const trackLength = C * arcFraction
  const valueLength = (Math.max(0, Math.min(100, score)) / 100) * trackLength

  const cls = scoreToHealthClass(score)
  const color = HEALTH_COLORS[cls]
  const label = HEALTH_LABELS[cls]

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: 'visible' }}
    >
      <g transform={`rotate(135, ${cx}, ${cy})`}>
        {/* Background track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#1a2236"
          strokeWidth={strokeWidth}
          strokeDasharray={`${trackLength} ${C}`}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${valueLength} ${C * 10}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${strokeWidth * 0.6}px ${color}40)` }}
        />
      </g>

      {/* Score number */}
      <text
        x={cx} y={cy - (showLabel ? size * 0.06 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={size * 0.22}
        fontWeight="700"
        fontFamily="Inter, sans-serif"
        letterSpacing="-1"
      >
        {score}
      </text>

      {/* Classification label */}
      {showLabel && (
        <text
          x={cx} y={cy + size * 0.19}
          textAnchor="middle"
          fill={color}
          fontSize={size * 0.085}
          fontWeight="600"
          fontFamily="Inter, sans-serif"
        >
          {label}
        </text>
      )}
    </svg>
  )
}

interface MiniGaugeProps {
  score: number
  size?: number
}

export function MiniGauge({ score, size = 48 }: MiniGaugeProps) {
  return <HealthGauge score={score} size={size} showLabel={false} />
}
