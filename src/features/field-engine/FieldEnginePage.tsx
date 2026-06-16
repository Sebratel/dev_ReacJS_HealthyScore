import { useMemo, useState } from 'react'
import {
  Wrench, AlertTriangle, TrendingDown, TrendingUp, Brain,
  ChevronDown, ChevronUp, Minus, Zap, Clock, CalendarX, MapPin,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { mockCustomers, mockProtocols } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { buildFieldEngineData } from './fieldEngine'
import { cn } from '@/utils/cn'
import type { FieldEngineScore } from '@/types'

const CLASS_COLOR: Record<string, string> = {
  excellent: '#22d3ee', healthy: '#10b981', attention: '#f59e0b', high_risk: '#f97316', critical: '#ef4444',
}
const CLASS_LABEL: Record<string, string> = {
  excellent: 'Excelente', healthy: 'Saudável', attention: 'Atenção', high_risk: 'Alto Risco', critical: 'Crítico',
}
const IMPACT_COLOR = { high: '#ef4444', medium: '#f97316', low: '#f59e0b' }

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-app-border rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
    </div>
  )
}

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  const circumference = Math.PI * 36
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="mt-0.5">
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

function InsightCard({ insight }: { insight: ReturnType<typeof buildFieldEngineData>['insights'][0] }) {
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
            {insight.impact === 'high' ? 'Alto impacto' : 'Médio impacto'}
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

const CHANGE_BY_LABEL: Record<string, string> = {
  none: 'Sem reagend.', client: 'Por cliente', us: 'Por nós', both: 'Ambos',
}

function CustomerRow({ score, rank }: { score: FieldEngineScore; rank: number }) {
  const [open, setOpen] = useState(false)
  const color = CLASS_COLOR[score.classification]
  return (
    <>
      <tr
        className="border-b border-app-border hover:bg-white/[0.02] cursor-pointer transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-2.5 text-[10px] font-mono text-gray-500">{rank}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: `${color}20`, color }}>
              {score.customerName[0]}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-200 truncate max-w-[130px]">{score.customerName}</p>
              <p className="text-[10px] text-gray-500">{score.city} · {score.neighborhood}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono" style={{ color }}>{score.fieldScore}</span>
            <div className="w-16"><ScoreBar value={score.fieldScore} color={color} /></div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-[11px] text-gray-400">{score.technicianName}</td>
        <td className="px-4 py-2.5 text-center">
          <span className={cn('text-[10px] font-mono', score.fieldVisits >= 3 ? 'text-risk-critical' : score.fieldVisits >= 1 ? 'text-risk-medium' : 'text-risk-low')}>
            {score.fieldVisits}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={cn('text-[10px] font-mono', score.schedulingChanges >= 2 ? 'text-risk-critical' : score.schedulingChanges === 1 ? 'text-risk-medium' : 'text-gray-500')}>
            {CHANGE_BY_LABEL[score.schedulingChangeBy]}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center">
          {score.arrivedLate
            ? <span className="text-[10px] font-semibold text-risk-critical">Sim</span>
            : <span className="text-[10px] text-gray-500">Não</span>}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={cn('text-[10px] font-mono', !score.slaCompliant ? 'text-risk-critical' : 'text-risk-low')}>
            {score.slaBreaches} quebra(s)
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color, background: `${color}15` }}>
            {CLASS_LABEL[score.classification]}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1 text-[10px]">
            {score.trend === 'improving'
              ? <TrendingUp size={10} className="text-risk-low" />
              : score.trend === 'degrading'
                ? <TrendingDown size={10} className="text-risk-critical" />
                : <Minus size={10} className="text-gray-500" />}
            <span className={score.trend === 'improving' ? 'text-risk-low' : score.trend === 'degrading' ? 'text-risk-critical' : 'text-gray-500'}>
              {score.trendValue > 0 ? '+' : ''}{score.trendValue}
            </span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-gray-500">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-surface/50">
          <td colSpan={11} className="px-6 py-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Fatores negativos</p>
                <div className="space-y-1">
                  {score.negativeFactors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-400">{f.label}</span>
                      <span className="font-mono text-risk-critical">{f.points}pts</span>
                    </div>
                  ))}
                  {score.negativeFactors.length === 0 && <p className="text-[11px] text-gray-600">Nenhum fator negativo</p>}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Fatores positivos</p>
                <div className="space-y-1">
                  {score.positiveFactors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-400">{f.label}</span>
                      <span className="font-mono text-risk-low">+{f.points}pts</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Motivos de visita</p>
                {score.visitMotives.length === 0
                  ? <p className="text-[11px] text-gray-600">Nenhuma visita registrada</p>
                  : score.visitMotives.map((m, i) => (
                    <p key={i} className="text-[11px] text-gray-400">· {m}</p>
                  ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function FieldEnginePage() {
  const data = useMemo(() => buildFieldEngineData(mockCustomers, mockProtocols), [])
  const [tableFilter, setTableFilter] = useState<'all' | 'critical' | 'high_risk' | 'attention'>('all')
  const [tablePage, setTablePage] = useState(0)
  const PAGE_SIZE = 10

  const filteredScores = useMemo(() => {
    const sorted = [...data.scores].sort((a, b) => a.fieldScore - b.fieldScore)
    if (tableFilter === 'all') return sorted
    return sorted.filter((s) => s.classification === tableFilter)
  }, [data.scores, tableFilter])

  const pageSlice = filteredScores.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filteredScores.length / PAGE_SIZE)

  const slaOkCount  = data.scores.filter((s) => s.slaCompliant).length
  const slaOkPct    = Math.round((slaOkCount / data.scores.length) * 100)
  const latePct     = Math.round((data.lateArrivalCount / data.scores.length) * 100)

  const schedPieData = data.schedulingChangeBreakdown
    .filter((s) => s.count > 0)
    .map((s, i) => ({
      name: s.label,
      value: s.count,
      color: ['#6b7280', '#22d3ee', '#ef4444', '#f59e0b'][i] ?? '#6b7280',
    }))

  const scoreGaugeColor = data.avgFieldScore >= 61 ? '#10b981' : data.avgFieldScore >= 41 ? '#f59e0b' : '#ef4444'

  return (
    <div className="space-y-5 animate-slide-up">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
              <Wrench size={13} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-white">Field Engine</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-mono">v1.0</span>
          </div>
          <p className="text-[11px] text-gray-500">Motor de campo — score baseado em visitas, reagendamentos, pontualidade e cumprimento de SLA</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 bg-app-card border border-app-border px-3 py-1.5 rounded-lg">
          <Zap size={10} className="text-brand-cyan" />
          <span className="font-mono text-brand-cyan">{data.scores.length} clientes analisados</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Field Score Médio"
          value={data.avgFieldScore.toFixed(1)}
          subtitle="Score de atendimento a campo"
          variant={data.avgFieldScore >= 61 ? 'success' : data.avgFieldScore >= 41 ? 'warning' : 'danger'}
          icon={<Wrench size={14} />}
          iconColor="text-orange-400"
        />
        <KpiCard
          label="Clientes em Risco"
          value={data.criticalCount + data.highRiskCount}
          subtitle={`${data.criticalCount} críticos · ${data.highRiskCount} alto risco`}
          variant="danger"
          icon={<AlertTriangle size={14} />}
          iconColor="text-risk-critical"
        />
        <KpiCard
          label="Atrasos na Chegada"
          value={`${latePct}%`}
          subtitle={`${data.lateArrivalCount} atendimentos atrasados`}
          variant={latePct > 30 ? 'danger' : latePct > 15 ? 'warning' : 'success'}
          icon={<Clock size={14} />}
          iconColor="text-risk-medium"
        />
        <KpiCard
          label="Quebras de SLA"
          value={data.totalSlaBreaches}
          subtitle={`${slaOkPct}% em conformidade com SLA`}
          variant={slaOkPct >= 80 ? 'success' : slaOkPct >= 60 ? 'warning' : 'danger'}
          icon={<CalendarX size={14} />}
          iconColor="text-risk-critical"
        />
      </div>

      {/* Gauges + Score History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Score Overview" subtitle="Indicadores de atendimento a campo" icon={<Wrench size={14} />} />
          <div className="p-4 grid grid-cols-3 gap-2">
            <Gauge value={Math.round(data.avgFieldScore)} label="Field Score" color={scoreGaugeColor} />
            <Gauge value={latePct} label="% Atrasos" color="#f97316" />
            <Gauge value={100 - slaOkPct} label="% SLA Violado" color="#ef4444" />
          </div>
          <div className="px-4 pb-4 space-y-2">
            {(['critical', 'high_risk', 'attention', 'healthy', 'excellent'] as const).map((cls) => {
              const count = data.scores.filter((s) => s.classification === cls).length
              const pct = (count / data.scores.length) * 100
              return (
                <div key={cls} className="flex items-center gap-2">
                  <span className="text-[10px] w-20 text-gray-500 shrink-0">{CLASS_LABEL[cls]}</span>
                  <div className="flex-1 h-1.5 bg-app-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CLASS_COLOR[cls] }} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Evolução do Field Score" subtitle="Últimos 12 meses" icon={<TrendingDown size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.scoreHistory} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradField" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="avgScore" name="Field Score" stroke="#f97316" fill="url(#gradField)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Visits, Scheduling, SLA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Visit motives */}
        <Card>
          <CardHeader title="Motivos de Visita" subtitle="Principais causas de atendimento" icon={<MapPin size={14} />} />
          <div className="p-4 space-y-2.5">
            {data.visitMotiveBreakdown.slice(0, 6).map((m, i) => (
              <div key={m.motive} className="flex items-center gap-2.5">
                <span className="text-[10px] text-gray-600 w-3">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-300 truncate">{m.motive}</p>
                  <div className="mt-0.5 h-1 bg-app-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${data.visitMotiveBreakdown[0] ? (m.count / data.visitMotiveBreakdown[0].count) * 100 : 0}%`,
                        background: '#f97316',
                      }}
                    />
                  </div>
                </div>
                <span className="text-[10px] font-mono text-gray-400">{m.count}</span>
                <span className="text-[10px] font-mono text-gray-600">{m.pct}%</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Scheduling change by */}
        <Card>
          <CardHeader title="Reagendamentos — Por quem?" subtitle="Cliente vs. operacional" icon={<CalendarX size={14} />} />
          <div className="p-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={schedPieData}
                  cx="50%" cy="50%"
                  outerRadius={55} innerRadius={28}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {schedPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #1a2236', borderRadius: 8, fontSize: 11 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 pb-3 space-y-1">
            {data.schedulingChangeBreakdown.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500">{s.label}</span>
                <span className="font-mono text-gray-300">{s.count} <span className="text-gray-600">({s.pct}%)</span></span>
              </div>
            ))}
          </div>
        </Card>

        {/* SLA hours distribution */}
        <Card>
          <CardHeader title="Distribuição SLA Médio" subtitle="Tempo médio de atendimento (h)" icon={<Clock size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.slaBreakdown} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Clientes" radius={[4, 4, 0, 0]}>
                  {data.slaBreakdown.map((_, i) => (
                    <Cell key={i} fill={['#10b981', '#4f8ef7', '#f59e0b', '#ef4444'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Technician breakdown */}
      <Card>
        <CardHeader title="Performance por Técnico" subtitle="Score médio, atrasos e quebras de SLA por técnico de campo" icon={<Wrench size={14} />} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-app-border">
                {['Técnico', 'Clientes', 'Field Score Médio', 'Visitas Médias', 'Atrasos', 'Quebras de SLA', 'SLA Bar'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {data.technicianBreakdown.map((t) => {
                const color = t.avgScore >= 61 ? '#10b981' : t.avgScore >= 41 ? '#f59e0b' : '#ef4444'
                const latePct = Math.round((t.lateArrivals / Math.max(t.count, 1)) * 100)
                return (
                  <tr key={t.name} className="hover:bg-app-cardHover transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{ background: `${color}20`, color }}>
                          {t.name[0]}
                        </div>
                        <span className="text-xs font-medium text-gray-200">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-300">{t.count}</td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-bold font-mono" style={{ color }}>{t.avgScore}</span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-400">{t.avgVisits}</td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-mono', latePct > 30 ? 'text-risk-critical' : latePct > 15 ? 'text-risk-medium' : 'text-risk-low')}>
                        {t.lateArrivals} ({latePct}%)
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-300">{t.slaBreaches}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-app-surface rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${t.avgScore}%`, background: color }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader title="AI Insights — Campo e Churn" subtitle="Correlações entre atendimento a campo e risco de cancelamento" icon={<Brain size={14} />} />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      </Card>

      {/* Customer Table */}
      <Card>
        <CardHeader title="Ranking de Field Score" subtitle="Clientes com pior desempenho de atendimento a campo" icon={<Wrench size={14} />} />
        <div className="px-5 pt-3 flex items-center gap-2">
          {([
            { key: 'all',       label: 'Todos',      count: data.scores.length },
            { key: 'critical',  label: 'Críticos',   count: data.scores.filter((s) => s.classification === 'critical').length },
            { key: 'high_risk', label: 'Alto Risco', count: data.scores.filter((s) => s.classification === 'high_risk').length },
            { key: 'attention', label: 'Atenção',    count: data.scores.filter((s) => s.classification === 'attention').length },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => { setTableFilter(key); setTablePage(0) }}
              className={cn(
                'text-[10px] px-2.5 py-1 rounded-md border transition-all',
                tableFilter === key
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                  : 'text-gray-500 border-app-border hover:text-gray-300 hover:border-app-borderLight',
              )}
            >
              {label} <span className="font-mono ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border">
                {['#', 'Cliente', 'Field Score', 'Técnico', 'Visitas', 'Reagend.', 'Atrasou?', 'SLA', 'Classif.', 'Tendência', ''].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageSlice.map((score, i) => (
                <CustomerRow key={score.customerId} score={score} rank={tablePage * PAGE_SIZE + i + 1} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
          <span className="text-[10px] text-gray-500">
            {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, filteredScores.length)} de {filteredScores.length} clientes
          </span>
          <div className="flex gap-1.5">
            <button
              disabled={tablePage === 0}
              onClick={() => setTablePage((p) => p - 1)}
              className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all"
            >Anterior</button>
            <button
              disabled={tablePage >= totalPages - 1}
              onClick={() => setTablePage((p) => p + 1)}
              className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all"
            >Próxima</button>
          </div>
        </div>
      </Card>

    </div>
  )
}
