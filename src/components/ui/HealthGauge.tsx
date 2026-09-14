import { scoreToHealthClass } from '@/utils/health'
import { softenColor } from '@/utils/healthColors'
import { useHealthColors } from '@/hooks/useHealthColors'
import { useChartTokens } from '@/hooks/useChartTokens'
import { HEALTH_LABELS } from '@/utils/healthColors'

export { scoreToHealthClass, HEALTH_LABELS }

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

  const healthColors = useHealthColors()
  const { track } = useChartTokens()
  const cls = scoreToHealthClass(score)
  const color = healthColors[cls]
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
          stroke={track}
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
          style={{ filter: `drop-shadow(0 0 ${strokeWidth * 0.6}px ${softenColor(color, 0.25)})` }}
        />
      </g>

      {/* Score number — usa a cor da classificação (visível no tema claro e no
          escuro; antes era branco fixo → sumia no fundo claro). */}
      <text
        x={cx} y={cy - (showLabel ? size * 0.06 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={size * 0.22}
        fontWeight="800"
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
