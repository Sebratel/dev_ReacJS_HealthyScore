import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts'
import { Loader2, TrendingUp, Clock } from 'lucide-react'
import { HEALTH_LABELS, scoreToHealthClass } from '@/components/ui/HealthGauge'
import { useHealthColors } from '@/hooks/useHealthColors'
import { useChartTokens } from '@/hooks/useChartTokens'
import { fetchScoreHistory, ApiError, type ScorePoint } from './scoreHistoryApi'

const fmtDateBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

const Tip = ({ active, payload }: any) => {
  const palette = useHealthColors()
  if (!active || !payload?.length) return null
  const p: ScorePoint = payload[0].payload
  const cls = scoreToHealthClass(p.overall)
  return (
    <div className="bg-surface-container-low border border-outline rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-on-surface/70 mb-1">{fmtDateBR(p.date)}</p>
      <p style={{ color: palette[cls] }}>Health: <strong>{p.overall}</strong> · {HEALTH_LABELS[cls]}</p>
    </div>
  )
}

// Ponto colorido pela classe de risco daquele momento.
const ColoredDot = (props: any) => {
  const palette = useHealthColors()
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  return <Dot cx={cx} cy={cy} r={3} fill={palette[scoreToHealthClass(payload.overall)]} stroke="none" />
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; points: ScorePoint[]; window: { from: string | null; to: string | null } }

// Timeline do Health Score de um cliente. Vazia até o job semanal acumular
// pontos — mostra um aviso amigável enquanto isso.
export default function ScoreTimeline({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const palette = useHealthColors()
  const tokens = useChartTokens()

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    fetchScoreHistory(clientId)
      .then((r) => { if (alive) setState({ status: 'ready', points: r.points, window: { from: r.status.from, to: r.status.to } }) })
      .catch((e) => { if (alive) setState({ status: 'error', message: e instanceof ApiError ? e.message : 'Erro inesperado.' }) })
    return () => { alive = false }
  }, [clientId])

  if (state.status === 'loading') {
    return <div className="flex items-center gap-2 text-[11px] text-on-surface-variant py-4"><Loader2 size={12} className="animate-spin" /> Carregando histórico…</div>
  }
  if (state.status === 'error') {
    return <div className="text-[11px] text-on-surface-variant py-4">{state.message}</div>
  }

  const { points } = state
  if (points.length === 0) {
    return (
      <div className="flex items-start gap-2 text-[11px] text-on-surface-variant py-3">
        <Clock size={12} className="mt-0.5 shrink-0" />
        <span>Histórico ainda vazio para este cliente. Os pontos começam a acumular a partir da próxima rodada semanal do score.</span>
      </div>
    )
  }
  if (points.length === 1) {
    const p = points[0]
    const cls = scoreToHealthClass(p.overall)
    return (
      <div className="flex items-center gap-2 py-3 text-xs">
        <span className="text-on-surface-variant">Primeiro ponto ({fmtDateBR(p.date)}):</span>
        <span className="font-bold" style={{ color: palette[cls] }}>{p.overall}</span>
        <span className="text-[10px] text-on-surface-variant">· a linha aparece com 2+ pontos</span>
      </div>
    )
  }

  const first = points[0].overall
  const last = points[points.length - 1].overall
  const delta = last - first

  return (
    <div>
      <div className="flex items-center gap-2 mb-1 text-[11px]">
        <TrendingUp size={12} className="text-primary" />
        <span className="text-on-surface/70">{points.length} pontos</span>
        <span className={delta > 0 ? 'text-risk-low' : delta < 0 ? 'text-risk-critical' : 'text-on-surface-variant'}>
          {delta > 0 ? '+' : ''}{delta} desde {fmtDateBR(points[0].date)}
        </span>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDateBR} tick={{ fill: tokens.axis, fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: tokens.axis, fontSize: 9 }} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<Tip />} />
            <Line type="monotone" dataKey="overall" stroke={tokens.primary} strokeWidth={2} dot={<ColoredDot />} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
