import { useMemo, useState } from 'react'
import {
  Network, AlertTriangle, TrendingDown, TrendingUp, Brain,
  ChevronDown, ChevronUp, Minus, Zap, Server, Wrench,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { mockCustomers } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { buildNetworkEngineData } from './networkEngine'
import { cn } from '@/utils/cn'
import type { NetworkEngineScore } from '@/types'

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
  const circ = Math.PI * 36
  const dash = (value / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="56" viewBox="0 0 96 56">
        <path d="M 12 48 A 36 36 0 0 1 84 48" fill="none" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" />
        <path d="M 12 48 A 36 36 0 0 1 84 48" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} />
        <text x="48" y="46" textAnchor="middle" fill="#0f172a" fontSize="15" fontWeight="bold" fontFamily="Inter">{value}</text>
      </svg>
      <span className="text-[10px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-600 mb-1.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="mt-0.5">
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

function InsightCard({ insight }: { insight: ReturnType<typeof buildNetworkEngineData>['insights'][0] }) {
  const ic = IMPACT_COLOR[insight.impact]
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-app-card border border-app-border hover:border-app-borderLight transition-all">
      <div className="shrink-0 mt-0.5">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${ic}20` }}>
          <Brain size={12} style={{ color: ic }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-700 leading-relaxed">{insight.finding}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-gray-500">Confiança: <span className="text-brand-cyan font-mono">{insight.confidence}%</span></span>
          <span className="text-[10px] text-gray-500">Afetados: <span className="font-mono text-gray-600">{insight.affectedCount}</span></span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: ic, background: `${ic}15` }}>
            {insight.impact === 'high' ? 'Alto impacto' : 'Médio impacto'}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-gray-500">Multiplicador</p>
        <p className="text-sm font-bold font-mono" style={{ color: ic }}>{insight.churnMultiplier.toFixed(1)}x</p>
      </div>
    </div>
  )
}

function CollaboratorRow({ collab, rank }: { collab: ReturnType<typeof buildNetworkEngineData>['collaboratorBreakdown'][0]; rank: number }) {
  const scoreColor = collab.score > 85 ? '#10b981' : collab.score > 70 ? '#f59e0b' : '#ef4444'
  const netColor = collab.avgNetworkScore >= 61 ? '#10b981' : collab.avgNetworkScore >= 41 ? '#f59e0b' : '#ef4444'
  return (
    <tr className="border-b border-app-border hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-2.5 text-[10px] font-mono text-gray-500">{rank}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: `${scoreColor}20`, color: scoreColor }}>
            {collab.name[0]}
          </div>
          <p className="text-xs font-medium text-gray-700">{collab.name}</p>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono" style={{ color: scoreColor }}>{collab.score}</span>
          <div className="w-14"><ScoreBar value={collab.score} color={scoreColor} /></div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono" style={{ color: netColor }}>{collab.avgNetworkScore.toFixed(0)}</span>
          <div className="w-14"><ScoreBar value={collab.avgNetworkScore} color={netColor} /></div>
        </div>
      </td>
      <td className="px-4 py-2.5 text-[11px] font-mono text-gray-500">{collab.count}</td>
    </tr>
  )
}

function CustomerRow({ score, rank }: { score: NetworkEngineScore; rank: number }) {
  const [open, setOpen] = useState(false)
  const color = CLASS_COLOR[score.classification]
  return (
    <>
      <tr className="border-b border-app-border hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2.5 text-[10px] font-mono text-gray-500">{rank}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: `${color}20`, color }}>
              {score.customerName[0]}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 truncate max-w-[110px]">{score.customerName}</p>
              <p className="text-[10px] text-gray-500">{score.city}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono" style={{ color }}>{score.networkScore}</span>
            <div className="w-12"><ScoreBar value={score.networkScore} color={color} /></div>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">I:{score.infraScore}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600">C:{score.connectionScore}</span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-[10px] text-gray-500 font-mono">{score.site}</td>
        <td className="px-4 py-2.5 text-[10px] text-gray-500 font-mono">{score.olt}</td>
        <td className="px-4 py-2.5 text-[10px] text-gray-500">S{score.slot}/P{score.port}</td>
        <td className="px-4 py-2.5">
          <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded', score.splitter === '1:4' ? 'bg-emerald-500/10 text-emerald-600' : score.splitter === '1:32' ? 'bg-red-500/10 text-red-500' : 'bg-gray-100 text-gray-500')}>
            {score.splitter}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, background: `${color}15` }}>
            {CLASS_LABEL[score.classification]}
          </span>
        </td>
        <td className="px-4 py-2.5">
          {score.trend === 'improving' ? <TrendingUp size={10} className="text-risk-low" /> : score.trend === 'degrading' ? <TrendingDown size={10} className="text-risk-critical" /> : <Minus size={10} className="text-gray-400" />}
        </td>
        <td className="px-4 py-2.5 text-gray-400">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-surface/50">
          <td colSpan={11} className="px-6 py-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Infraestrutura (70%)</p>
                {score.factors.filter((f) => ['gmud','massiva','quebra','infra'].includes(f.category)).map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-gray-600">{f.label}</span>
                    <span className="font-mono" style={{ color: f.impact === 'positive' ? '#10b981' : '#ef4444' }}>{f.points > 0 ? '+' : ''}{f.points}pts</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Técnico Responsável</p>
                {score.factors.filter((f) => f.category === 'collaborator').map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-gray-600">{f.label}</span>
                    <span className="font-mono" style={{ color: f.impact === 'positive' ? '#10b981' : '#ef4444' }}>{f.points > 0 ? '+' : ''}{f.points}pts</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Topologia</p>
                <div className="space-y-1 text-[11px] text-gray-600">
                  <p><span className="text-gray-400">Site:</span> <span className="font-mono">{score.site}</span></p>
                  <p><span className="text-gray-400">OLT:</span> <span className="font-mono">{score.olt}</span></p>
                  <p><span className="text-gray-400">Slot/Porta:</span> <span className="font-mono">{score.slot}/{score.port}</span></p>
                  <p><span className="text-gray-400">Splitter:</span> <span className="font-mono">{score.splitter}</span></p>
                  <p><span className="text-gray-400">GMUDs:</span> <span className="font-mono">{score.gmudCount}</span> · <span className="text-gray-400">Massivas:</span> <span className="font-mono">{score.massivasCount}</span></p>
                  <p><span className="text-gray-400">Quebras:</span> <span className="font-mono">{score.quebraCount}</span></p>
                  <p className="mt-1 pt-1 border-t border-app-border"><span className="text-gray-400">Conexão herdado:</span> <span className="font-mono text-cyan-600">{score.connectionScore}pts (30%)</span></p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function NetworkEnginePage() {
  const data = useMemo(() => buildNetworkEngineData(mockCustomers), [])
  const [tableFilter, setTableFilter] = useState<'all' | 'critical' | 'high_risk' | 'attention'>('all')
  const [tablePage, setTablePage] = useState(0)
  const PAGE_SIZE = 10

  const filteredScores = useMemo(() => {
    const sorted = [...data.scores].sort((a, b) => a.networkScore - b.networkScore)
    if (tableFilter === 'all') return sorted
    return sorted.filter((s) => s.classification === tableFilter)
  }, [data.scores, tableFilter])

  const pageSlice = filteredScores.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filteredScores.length / PAGE_SIZE)

  const OLT_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24']
  const SPLITTER_COLORS = ['#10b981', '#22d3ee', '#f59e0b', '#ef4444']
  const GMUD_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444']
  const SLA_COLORS = ['#10b981', '#22d3ee', '#f59e0b', '#ef4444']

  return (
    <div className="space-y-5 animate-slide-up">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Network size={13} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-white">Network Engine</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-mono">v1.0</span>
          </div>
          <p className="text-[11px] text-gray-500">Motor de infraestrutura — score baseado em GMUDs, massivas, quebras, qualidade do técnico, topologia e score de conexão herdado</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] bg-app-card border border-app-border px-3 py-1.5 rounded-lg">
            <span className="text-gray-500">Pesos: </span>
            <span className="text-amber-600 font-mono">Infraestrutura 70%</span>
            <span className="text-gray-400 mx-1">·</span>
            <span className="text-cyan-600 font-mono">Conexão 30%</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 bg-app-card border border-app-border px-3 py-1.5 rounded-lg">
            <Zap size={10} className="text-brand-cyan" />
            <span className="font-mono text-brand-cyan">{data.scores.length} analisados</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Network Score" value={data.avgNetworkScore.toFixed(1)} subtitle="Score médio de rede" variant={data.avgNetworkScore >= 61 ? 'success' : data.avgNetworkScore >= 41 ? 'warning' : 'danger'} icon={<Network size={14} />} iconColor="text-amber-500" />
        <KpiCard label="Infra Score" value={data.avgInfraScore.toFixed(1)} subtitle="Score médio de infraestrutura" variant="brand" icon={<Server size={14} />} iconColor="text-orange-500" />
        <KpiCard label="Massivas Médias" value={data.avgMassivasCount.toFixed(1)} subtitle="Por cliente em 6 meses" variant={data.avgMassivasCount <= 1 ? 'success' : data.avgMassivasCount <= 3 ? 'warning' : 'danger'} icon={<AlertTriangle size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Em Risco" value={data.criticalCount + data.highRiskCount} subtitle={`${(((data.criticalCount + data.highRiskCount) / data.scores.length) * 100).toFixed(0)}% da base`} variant="danger" icon={<Wrench size={14} />} iconColor="text-risk-critical" />
      </div>

      {/* Score Gauges + Temporal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Score Overview" subtitle="Network · Infra · Conexão herdado" icon={<Network size={14} />} />
          <div className="p-4 grid grid-cols-3 gap-2">
            <Gauge value={Math.round(data.avgNetworkScore)} label="Network" color={data.avgNetworkScore >= 61 ? '#10b981' : data.avgNetworkScore >= 41 ? '#f59e0b' : '#ef4444'} />
            <Gauge value={Math.round(data.avgInfraScore)} label="Infra" color="#f97316" />
            <Gauge value={Math.round(data.avgConnectionScore)} label="Conexão" color="#06b6d4" />
          </div>
          <div className="px-4 pb-4 space-y-2">
            {(['critical','high_risk','attention','healthy','excellent'] as const).map((cls) => {
              const count = data.scores.filter((s) => s.classification === cls).length
              const pct = (count / data.scores.length) * 100
              return (
                <div key={cls} className="flex items-center gap-2">
                  <span className="text-[10px] w-20 text-gray-500 shrink-0">{CLASS_LABEL[cls]}</span>
                  <div className="flex-1 h-1.5 bg-app-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CLASS_COLOR[cls] }} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-500 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Evolução Temporal" subtitle="Network Score · Infra Score · Conexão — 12 meses" icon={<TrendingDown size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.scoreHistory} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradInf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb923c" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#fb923c" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="avgNetworkScore"    name="Network Score" stroke="#f97316" fill="url(#gradNet)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="avgInfraScore"      name="Infra Score"   stroke="#fb923c" fill="url(#gradInf)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="avgConnectionScore" name="Conexão"       stroke="#06b6d4" fill="url(#gradCon)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* OLT Breakdown + Collaborator Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Score por OLT" subtitle="Network Score médio por equipamento OLT" icon={<Server size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.oltBreakdown} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <YAxis dataKey="olt" type="category" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgNetworkScore" name="Network Score" radius={[0, 4, 4, 0]}>
                  {data.oltBreakdown.map((_, i) => <Cell key={i} fill={OLT_COLORS[i % OLT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Leaderboard de Técnicos" subtitle="Ranking por score de qualidade e impacto na rede" icon={<Wrench size={14} />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border">
                  {['#', 'Técnico', 'Qualidade', 'Net. Score', 'Clientes'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.collaboratorBreakdown.map((c, i) => (
                  <CollaboratorRow key={c.name} collab={c} rank={i + 1} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* GMUD + Massivas SLA + Splitter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Impacto de GMUDs" subtitle="Score médio por faixa de mudanças planejadas" />
          <div className="p-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.gmudBreakdown} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgScore" name="Score Médio" radius={[4, 4, 0, 0]}>
                  {data.gmudBreakdown.map((_, i) => <Cell key={i} fill={GMUD_COLORS[i % GMUD_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="SLA de Massivas" subtitle="Score médio por tempo de resolução das massivas" />
          <div className="p-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.massivasSlaBreakdown} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgScore" name="Score Médio" radius={[4, 4, 0, 0]}>
                  {data.massivasSlaBreakdown.map((_, i) => <Cell key={i} fill={SLA_COLORS[i % SLA_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Qualidade do Splitter" subtitle="Score médio por divisão do splitter óptico" />
          <div className="p-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.splitterBreakdown} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="splitter" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgScore" name="Score Médio" radius={[4, 4, 0, 0]}>
                  {data.splitterBreakdown.map((_, i) => <Cell key={i} fill={SPLITTER_COLORS[i % SPLITTER_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <Card>
        <CardHeader title="AI Insights — Infraestrutura e Churn" subtitle="Correlações detectadas entre qualidade de infraestrutura e cancelamento" icon={<Brain size={14} />} />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      </Card>

      {/* Customer Table */}
      <Card>
        <CardHeader title="Ranking de Risco de Rede" subtitle="Clientes com menor Network Score — I=Infra · C=Conexão" icon={<Network size={14} />} />
        <div className="px-5 pt-3 flex items-center gap-2">
          {([
            { key: 'all',       label: 'Todos',      count: data.scores.length },
            { key: 'critical',  label: 'Críticos',   count: data.scores.filter((s) => s.classification === 'critical').length },
            { key: 'high_risk', label: 'Alto Risco', count: data.scores.filter((s) => s.classification === 'high_risk').length },
            { key: 'attention', label: 'Atenção',    count: data.scores.filter((s) => s.classification === 'attention').length },
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => { setTableFilter(key); setTablePage(0) }}
              className={cn('text-[10px] px-2.5 py-1 rounded-md border transition-all',
                tableFilter === key ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'text-gray-500 border-app-border hover:text-gray-700 hover:border-app-borderLight'
              )}>
              {label} <span className="font-mono ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border">
                {['#', 'Cliente', 'Net. Score', 'I / C', 'Site', 'OLT', 'Slot/Porta', 'Splitter', 'Classificação', 'Tend.', ''].map((h) => (
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
            <button disabled={tablePage === 0} onClick={() => setTablePage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-500 disabled:opacity-30 hover:border-app-borderLight transition-all">Anterior</button>
            <button disabled={tablePage >= totalPages - 1} onClick={() => setTablePage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-500 disabled:opacity-30 hover:border-app-borderLight transition-all">Próxima</button>
          </div>
        </div>
      </Card>
    </div>
  )
}