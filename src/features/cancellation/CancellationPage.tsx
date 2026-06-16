import { useMemo, useState } from 'react'
import {
  XCircle, Package, Truck, Clock, AlertTriangle, Brain,
  TrendingDown, Zap, ChevronDown, ChevronUp, DollarSign, Shield, Users,
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import { mockCustomers } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { buildCancellationData } from './cancellationEngine'
import { formatCurrency } from '@/utils/cn'
import { cn } from '@/utils/cn'
import type { CancellationRecord } from '@/types'

const CLASS_COLOR: Record<string, string> = {
  excellent: '#22d3ee', healthy: '#10b981', attention: '#f59e0b', high_risk: '#f97316', critical: '#ef4444',
}
const CLASS_LABEL: Record<string, string> = {
  excellent: 'Excelente', healthy: 'Saudável', attention: 'Atenção', high_risk: 'Alto Risco', critical: 'Crítico',
}
const IMPACT_COLOR = { high: '#ef4444', medium: '#f97316', low: '#f59e0b' }

function scoreColor(v: number) {
  if (v >= 70) return '#10b981'
  if (v >= 50) return '#f59e0b'
  return '#ef4444'
}

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 36
  const circumference = Math.PI * radius
  const dash = (value / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="56" viewBox="0 0 96 56">
        <path d="M 12 48 A 36 36 0 0 1 84 48" fill="none" stroke="#1a2236" strokeWidth="8" strokeLinecap="round" />
        <path d="M 12 48 A 36 36 0 0 1 84 48" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`} />
        <text x="48" y="46" textAnchor="middle" fill="white" fontSize="15" fontWeight="bold" fontFamily="Inter">{value}</text>
      </svg>
      <span className="text-[10px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  )
}

function InsightCard({ insight }: { insight: { finding: string; confidence: number; affectedCount: number; impact: 'high' | 'medium' | 'low'; churnMultiplier: number } }) {
  const impactColor = IMPACT_COLOR[insight.impact]
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-app-card border border-app-border hover:border-app-borderLight transition-all">
      <div className="shrink-0 mt-0.5">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${impactColor}20` }}>
          <Brain size={12} style={{ color: impactColor }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200 leading-relaxed">{insight.finding}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-gray-500">Confiança: <span className="text-brand-cyan font-mono">{insight.confidence}%</span></span>
          <span className="text-[10px] text-gray-500">Afetados: <span className="font-mono text-gray-300">{insight.affectedCount}</span></span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: impactColor, background: `${impactColor}15` }}>
            {insight.impact === 'high' ? 'Alto impacto' : insight.impact === 'medium' ? 'Médio impacto' : 'Baixo impacto'}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-gray-500">Multiplicador</p>
        <p className="text-sm font-bold font-mono" style={{ color: impactColor }}>{insight.churnMultiplier.toFixed(1)}x</p>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="mt-0.5">{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

const REASON_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22d3ee', '#8b5cf6', '#10b981', '#6b7280', '#ec4899']
const PLAN_COLORS: Record<string, string> = {
  'Fibra 100MB': '#22d3ee', 'Fibra 200MB': '#4f8ef7', 'Fibra 300MB': '#8b5cf6',
  'Fibra 500MB': '#f59e0b', 'Fibra 1GB': '#10b981',
}

function ScoreFactorBar({ label, score, weight, description }: { label: string; score: number; weight: string; description: string }) {
  const color = scoreColor(score)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="min-w-0">
          <span className="text-xs text-gray-300 font-medium">{label}</span>
          <span className="text-[10px] text-gray-600 ml-2">{description}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-600 font-mono">{weight}</span>
          <span className="text-xs font-mono font-bold w-8 text-right" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="h-1.5 bg-app-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  )
}

function RecordRow({ rec, rank }: { rec: CancellationRecord; rank: number }) {
  const [open, setOpen] = useState(false)
  const retColor = rec.equipmentReturned ? '#10b981' : '#ef4444'
  return (
    <>
      <tr className="border-b border-app-border hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => setOpen(v => !v)}>
        <td className="px-4 py-2.5 text-[10px] font-mono text-gray-500">{rank}</td>
        <td className="px-4 py-2.5">
          <p className="text-xs font-medium text-gray-200 truncate max-w-[130px]">{rec.customerName}</p>
          <p className="text-[10px] text-gray-500">{rec.city} · {rec.neighborhood}</p>
        </td>
        <td className="px-4 py-2.5 text-[11px] text-gray-400">{rec.reason}</td>
        <td className="px-4 py-2.5">
          <span className="text-[10px] font-mono" style={{ color: PLAN_COLORS[rec.plan] ?? '#6b7280' }}>{rec.plan}</span>
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: retColor, background: `${retColor}15` }}>
            {rec.equipmentReturned ? `Devolvido (${rec.equipmentReturnDays}d)` : 'Pendente'}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center text-[10px] font-mono text-gray-400">{rec.motoboyDays}d / {rec.motoboyVisits}x</td>
        <td className="px-4 py-2.5 text-[11px] text-gray-400">{rec.motoboyCollaborator}</td>
        <td className="px-4 py-2.5 text-[11px] text-gray-400">{rec.competitorName ?? <span className="text-gray-600">—</span>}</td>
        <td className="px-4 py-2.5 text-[10px] font-mono text-gray-500">{rec.cancellationDate}</td>
        <td className="px-4 py-2.5 text-gray-500">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-surface/50">
          <td colSpan={10} className="px-6 py-3">
            <div className="grid grid-cols-4 gap-4 text-[11px]">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-gray-300">{rec.customerName}</p>
                <p className="text-gray-500">{rec.customerId} · {rec.contractMonths}m contrato</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Receita perdida</p>
                <p className="text-gray-200 font-semibold">{formatCurrency(rec.monthlyValue)}/mês</p>
                <p className="text-risk-critical">{formatCurrency(rec.revenueAtRisk)}/ano</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Motoboy</p>
                <p className="text-gray-300">{rec.motoboyCollaborator}</p>
                <p className="text-gray-500">{rec.motoboyVisits} visita(s) · {rec.motoboyDays}d de espera</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Destino</p>
                <p className="text-gray-300">{rec.competitorName ?? 'Não identificado'}</p>
                <p className="text-gray-500">Churn Score: {rec.churnScore}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function CancellationPage() {
  const data = useMemo(() => buildCancellationData(mockCustomers), [])
  const [page, setPage] = useState(0)
  const [reasonFilter, setReasonFilter] = useState<string | null>(null)
  const PAGE_SIZE = 12

  const filtered = useMemo(() => {
    if (!reasonFilter) return data.records
    return data.records.filter((r) => r.reason === reasonFilter)
  }, [data.records, reasonFilter])

  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const returnPct = Math.round((data.equipmentReturnedCount / data.totalCancellations) * 100)
  const { engineScore } = data
  const overallColor = CLASS_COLOR[engineScore.classification]

  const compPieData = data.competitorBreakdown.slice(0, 6).map((c, i) => ({
    name: c.name, value: c.count,
    color: ['#ef4444', '#f97316', '#f59e0b', '#22d3ee', '#8b5cf6', '#6b7280'][i],
  }))

  return (
    <div className="space-y-5 animate-slide-up">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center">
              <XCircle size={13} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-white">Cancelamento Engine</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono">v1.0</span>
          </div>
          <p className="text-[11px] text-gray-500">Motor de cancelamentos — motivo · serviço · devolução · motoboy · cliente · competidor</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] bg-app-card border border-app-border px-3 py-1.5 rounded-lg">
          <Zap size={10} className="text-brand-cyan" />
          <span className="font-mono text-brand-cyan">{data.totalCancellations} cancelamentos</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Score Cancelamento" value={engineScore.overallScore} subtitle={CLASS_LABEL[engineScore.classification]} variant={engineScore.overallScore >= 61 ? 'success' : engineScore.overallScore >= 41 ? 'warning' : 'danger'} icon={<Shield size={14} />} iconColor="text-brand-cyan" />
        <KpiCard label="Devolução Equipamento" value={`${returnPct}%`} subtitle={`${data.equipmentPendingCount} pendentes`} variant={returnPct >= 70 ? 'success' : returnPct >= 50 ? 'warning' : 'danger'} icon={<Package size={14} />} iconColor="text-brand-cyan" />
        <KpiCard label="Tempo Médio Motoboy" value={`${data.avgMotoboyDays}d`} subtitle="Entre cancelamento e retirada" variant={data.avgMotoboyDays <= 3 ? 'success' : 'warning'} icon={<Truck size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Receita Anual Perdida" value={formatCurrency(data.totalRevenueAtRisk)} subtitle="Projeção 12 meses" variant="danger" icon={<DollarSign size={14} />} iconColor="text-risk-critical" />
      </div>

      {/* Score Gauges */}
      <Card>
        <CardHeader title="Score Cancelamento Engine" subtitle="Eficiência operacional na gestão de cancelamentos — maior score = melhor processo" icon={<Shield size={14} />} />
        <div className="p-5 flex items-center justify-around gap-4 flex-wrap">
          <Gauge value={engineScore.devolucaoScore} label="Devolução" color={scoreColor(engineScore.devolucaoScore)} />
          <Gauge value={engineScore.motoboyScore} label="Motoboy" color={scoreColor(engineScore.motoboyScore)} />
          <div className="flex flex-col items-center gap-2">
            <div className="w-24 h-24 rounded-full border-4 flex items-center justify-center" style={{ borderColor: overallColor }}>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono" style={{ color: overallColor }}>{engineScore.overallScore}</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-wider">Score</p>
              </div>
            </div>
            <span className="text-xs font-semibold" style={{ color: overallColor }}>{CLASS_LABEL[engineScore.classification]}</span>
            <span className="text-[10px] text-gray-500">Score Geral</span>
          </div>
          <Gauge value={engineScore.motivoScore} label="Motivo" color={scoreColor(engineScore.motivoScore)} />
          <Gauge value={engineScore.competidorScore} label="Competidor" color={scoreColor(engineScore.competidorScore)} />
        </div>
      </Card>

      {/* Component Scores + Motoboy Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Factor bars */}
        <Card>
          <CardHeader title="Componentes do Score" subtitle="Peso de cada dimensão no score geral" icon={<TrendingDown size={14} />} />
          <div className="p-4 space-y-4">
            <ScoreFactorBar label="Devolução Equipamento" score={engineScore.devolucaoScore} weight="30%" description="taxa × velocidade de retorno" />
            <ScoreFactorBar label="Motoboy — Tempo + Visitas" score={engineScore.motoboyScore} weight="25%" description="eficiência de retirada" />
            <ScoreFactorBar label="Competidor — Intel" score={engineScore.competidorScore} weight="15%" description="identificação do destino" />
            <ScoreFactorBar label="Motivo — Prevenibilidade" score={engineScore.motivoScore} weight="15%" description="razões não-preventáveis" />
            <ScoreFactorBar label="Serviço — Impacto" score={engineScore.servicoScore} weight="10%" description="gravidade pelo plano cancelado" />
            <ScoreFactorBar label="Cliente — Perfil" score={engineScore.clienteScore} weight="5%" description="meses de contrato e receita" />
          </div>
        </Card>

        {/* Motoboy detail */}
        <Card>
          <CardHeader title="Motoboy — Retirada de Equipamento" subtitle="Tempo, visitas e performance por colaborador" icon={<Truck size={14} />} />
          <div className="p-4 space-y-3">
            {/* Sub-scores */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-3 rounded-lg bg-app-surface border border-app-border text-center">
                <p className="text-[10px] text-gray-500 mb-1">Tempo (dias)</p>
                <p className="text-xl font-bold font-mono" style={{ color: scoreColor(engineScore.motoboyTempoScore) }}>{engineScore.motoboyTempoScore}</p>
                <p className="text-[9px] text-gray-600">média: {data.avgMotoboyDays}d</p>
              </div>
              <div className="p-3 rounded-lg bg-app-surface border border-app-border text-center">
                <p className="text-[10px] text-gray-500 mb-1">Visitas/tentativas</p>
                <p className="text-xl font-bold font-mono" style={{ color: scoreColor(engineScore.motoboyVisitasScore) }}>{engineScore.motoboyVisitasScore}</p>
                <p className="text-[9px] text-gray-600">score de eficiência</p>
              </div>
            </div>
            {/* Collaborator ranking */}
            {data.motoboyBreakdown.map((m) => {
              const color = m.returnRate >= 70 ? '#10b981' : m.returnRate >= 50 ? '#f59e0b' : '#ef4444'
              return (
                <div key={m.name} className="p-2.5 rounded-lg bg-app-surface border border-app-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-gray-200">{m.name}</span>
                    <span className="text-[10px] font-mono text-gray-500">{m.count} retiradas</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-gray-500">Devolução: <span className="font-mono" style={{ color }}>{m.returnRate}%</span></span>
                    <span className="text-gray-500">Tempo médio: <span className={cn('font-mono', m.avgDays > 5 ? 'text-risk-critical' : 'text-risk-medium')}>{m.avgDays}d</span></span>
                  </div>
                  <div className="mt-1.5 h-1 bg-app-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.returnRate}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Charts row 1: Motivo + Competidor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <Card className="lg:col-span-2">
          <CardHeader title="Motivos de Cancelamento" subtitle="Clique para filtrar a tabela" icon={<XCircle size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.reasonBreakdown} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="reason" tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} tickLine={false} width={155} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Cancelamentos" radius={[0, 4, 4, 0]} onClick={(d) => setReasonFilter(prev => prev === d.reason ? null : d.reason)}>
                  {data.reasonBreakdown.map((_, i) => (
                    <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} opacity={!reasonFilter || data.reasonBreakdown[i].reason === reasonFilter ? 1 : 0.3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Destino — Competidor" subtitle="Para onde foram os clientes" />
          <div className="p-4 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={compPieData} cx="50%" cy="50%" outerRadius={52} innerRadius={28} paddingAngle={2} dataKey="value" nameKey="name">
                  {compPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #1a2236', borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 pb-3 space-y-1">
            {data.competitorBreakdown.slice(0, 5).map((c, i) => (
              <div key={c.name} className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: compPieData[i]?.color ?? '#6b7280' }} />
                  {c.name}
                </span>
                <span className="font-mono text-gray-300">{c.count} <span className="text-gray-600">({c.pct}%)</span></span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts row 2: Trend + City */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <Card>
          <CardHeader title="Tendência Mensal" subtitle="Cancelamentos e devoluções" icon={<TrendingDown size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyTrend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCancel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradReturn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" name="Cancelamentos" stroke="#ef4444" fill="url(#gradCancel)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="returned" name="Devolvidos" stroke="#10b981" fill="url(#gradReturn)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Por Cidade" subtitle="Cancelamentos e taxa de devolução" icon={<AlertTriangle size={14} />} />
          <div className="p-4 space-y-2.5">
            {data.cityBreakdown.map((c) => {
              const color = c.returnRate >= 70 ? '#10b981' : c.returnRate >= 50 ? '#f59e0b' : '#ef4444'
              return (
                <div key={c.city}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-gray-400 w-28 shrink-0">{c.city}</span>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-gray-600"><Clock size={9} className="inline mr-0.5" />{c.avgMotoboyDays}d</span>
                      <span className="font-mono text-gray-500">{c.count} cancel.</span>
                      <span className="font-mono w-8 text-right" style={{ color }}>{c.returnRate}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-app-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.returnRate}%`, background: color }} />
                  </div>
                </div>
              )
            })}
            <p className="text-[9px] text-gray-600 pt-1">Barra = % devolução equipamento</p>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <Card>
        <CardHeader title="AI Insights — Análise de Cancelamentos" subtitle="Padrões detectados pelo modelo preditivo ao correlacionar cancelamentos, motivos e destinos" icon={<Brain size={14} />} />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      </Card>

      {/* Main table */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-app-border">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-100">Registros de Cancelamento</h3>
            {reasonFilter && (
              <button onClick={() => setReasonFilter(null)}
                className="flex items-center gap-1 text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 px-2 py-0.5 rounded-full hover:bg-red-500/20 transition-all">
                <Brain size={9} /> {reasonFilter} ×
              </button>
            )}
          </div>
          <span className="text-[11px] text-gray-500">{filtered.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border">
                {['#', 'Cliente', 'Motivo', 'Serviço', 'Equipamento', 'Motoboy (d/visitas)', 'Colaborador', 'Competidor', 'Data', ''].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageSlice.map((rec, i) => (
                <RecordRow key={rec.id} rec={rec} rank={page * PAGE_SIZE + i + 1} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
          <span className="text-[10px] text-gray-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
          </span>
          <div className="flex gap-1.5">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Anterior</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Próxima</button>
          </div>
        </div>
      </Card>

    </div>
  )
}
