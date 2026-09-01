import { cn } from '@/utils/cn'
import { RiskLevel } from '@/types'

interface RiskBadgeProps {
  level: RiskLevel
  score?: number
  size?: 'sm' | 'md'
}

const LEVEL_CONFIG: Record<RiskLevel, { label: string; className: string; dot: string }> = {
  low: { label: 'Baixo', className: 'bg-risk-low/10 text-risk-low border-risk-low/20', dot: 'bg-risk-low' },
  medium: { label: 'Médio', className: 'bg-risk-medium/10 text-risk-medium border-risk-medium/20', dot: 'bg-risk-medium' },
  high: { label: 'Alto', className: 'bg-risk-high/10 text-risk-high border-risk-high/20', dot: 'bg-risk-high' },
  critical: { label: 'Crítico', className: 'bg-risk-critical/10 text-risk-critical border-risk-critical/20', dot: 'bg-risk-critical animate-pulse-slow' },
}

export function RiskBadge({ level, score, size = 'md' }: RiskBadgeProps) {
  const { label, className, dot } = LEVEL_CONFIG[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-medium', size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs', className)}>
      <span className={cn('rounded-full', size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2', dot)} />
      {label}
      {score !== undefined && <span className="font-mono opacity-80">{score}</span>}
    </span>
  )
}

export function ScoreBar({ score }: { score: number }) {
  // Classe em vez de `style`: a barra é um div, então o token resolve sozinho no tema.
  const fill = score >= 75 ? 'bg-risk-critical' : score >= 55 ? 'bg-risk-high' : score >= 35 ? 'bg-risk-medium' : 'bg-risk-low'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-container-low rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono tabular-nums text-on-surface/85 w-8 text-right">{score}</span>
    </div>
  )
}
