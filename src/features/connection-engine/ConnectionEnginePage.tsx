import { useEffect, useMemo, useState } from 'react'
import {
  Wifi, AlertTriangle, TrendingDown, ShieldAlert, Zap, SlidersHorizontal,
  ChevronDown, ChevronUp, Brain, Hand, Router, Package,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { realClients, realTotals, realConnection, realMeta } from '@/data/realClients'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { formatCurrency } from '@/utils/cn'
import { buildConnectionEngineData } from './connectionEngine'
import { ConnectionEngineConfigModal } from './ConnectionEngineConfigModal'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/utils/cn'
import type { ConnectionEngineScore } from '@/types'

const CLASS_COLOR: Record<string, string> = { excellent: '#22d3ee', healthy: '#10b981', attention: '#f59e0b', high_risk: '#f97316', critical: '#ef4444' }
const CLASS_LABEL: Record<string, string> = { excellent: 'Excelente', healthy: 'Saudável', attention: 'Atenção', high_risk: 'Alto Risco', critical: 'Crítico' }
const GRID = 'rgb(var(--app-border))'

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-app-border rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(value / max) * 100}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
    </div>
  )
}

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 36, circumference = Math.PI * radius, dash = (value / 100) * circumference
  const gid = `ng-${label.replace(/\W+/g, '')}`
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="100" height="58" viewBox="0 0 96 56" className="overflow-visible">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={color} stopOpacity={0.55} /><stop offset="100%" stopColor={color} /></linearGradient></defs>
        <path d="M 12 48 A 36 36 0 0 1 84 48" fill="none" stroke={GRID} strokeWidth="8" strokeLinecap="round" />
        <path d="M 12 48 A 36 36 0 0 1 84 48" fill="none" stroke={`url(#${gid})`} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`}
          style={{ filter: `drop-shadow(0 2px 5px ${color}55)`, transition: 'stroke-dasharray 0.7s cubic-bezier(0.16,1,0.3,1)' }} />
        <text x="48" y="46" textAnchor="middle" fill="rgb(var(--color-white))" fontSize="16" fontWeight="bold" fontFamily="Inter">{value}</text>
      </svg>
      <span className="text-[10px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl max-w-[260px]">
      <p className="text-gray-400 mb-1.5 font-medium break-words">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="mt-0.5">{p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong></p>
      ))}
    </div>
  )
}

function CustomerRow({ score, rank }: { score: ConnectionEngineScore; rank: number }) {
  const [open, setOpen] = useState(false)
  const color = CLASS_COLOR[score.classification]
  return (
    <>
      <tr className="border-b border-app-border hover:bg-app-surface/70 cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2.5 text-[10px] font-mono text-gray-500">{rank}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: `${color}20`, color }}>{score.customerName[0]}</div>
            <div><p className="text-xs font-medium text-gray-200 truncate max-w-[150px]">{score.customerName}</p><p className="text-[10px] text-gray-500">{score.city}</p></div>
          </div>
        </td>
        <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="text-sm font-bold font-mono" style={{ color }}>{score.healthScore}</span><div className="w-16"><ScoreBar value={score.healthScore} color={color} /></div></div></td>
        <td className="px-4 py-2.5"><span className="text-xs font-mono" style={{ color: score.churnRisk >= 60 ? '#ef4444' : score.churnRisk >= 40 ? '#f97316' : '#f59e0b' }}>{score.churnRisk.toFixed(0)}%</span></td>
        <td className="px-4 py-2.5 text-[10px] text-gray-500 font-mono">{score.equipment.length} equip.</td>
        <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, background: `${color}15` }}>{CLASS_LABEL[score.classification]}</span></td>
        <td className="px-4 py-2.5 text-gray-500">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-surface/50">
          <td colSpan={7} className="px-6 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Indicadores — atributo real × pontuação</p>
            <div className="space-y-1">
              {score.indicators.map((ind) => (
                <div key={ind.key} className="flex items-start justify-between gap-3 text-[11px] py-0.5 border-b border-app-border/40">
                  <span className="text-gray-400 w-28 shrink-0">{ind.label}</span>
                  <span className="font-mono text-gray-300 flex-1 leading-relaxed">{ind.value}</span>
                  <span className={cn('font-mono w-14 text-right shrink-0', ind.points > 0 ? 'text-risk-low' : ind.points < 0 ? 'text-risk-critical' : 'text-gray-600')}>
                    {ind.points > 0 ? '+' : ''}{ind.points} pts
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function ConnectionEnginePage() {
  const connectionConfig = useAppStore((s) => s.connectionConfig)
  const syncConnectionLists = useAppStore((s) => s.syncConnectionLists)

  useEffect(() => {
    syncConnectionLists({ equipment: realConnection.models.map((e) => ({ key: e.value, label: e.value })) })
  }, [syncConnectionLists, connectionConfig])

  // Analisa apenas clientes que possuem equipamento alocado
  const clientsWithEquip = useMemo(() => realClients.filter((c) => c.equipment.length > 0), [])
  const data = useMemo(() => buildConnectionEngineData(clientsWithEquip, connectionConfig), [clientsWithEquip, connectionConfig])

  const [configOpen, setConfigOpen] = useState(false)
  const [tableFilter, setTableFilter] = useState<'all' | 'critical' | 'high_risk' | 'attention'>('all')
  const [tablePage, setTablePage] = useState(0)
  const PAGE_SIZE = 10

  const filteredScores = useMemo(() => {
    const sorted = [...data.scores].sort((a, b) => a.healthScore - b.healthScore)
    return tableFilter === 'all' ? sorted : sorted.filter((s) => s.classification === tableFilter)
  }, [data.scores, tableFilter])
  const pageSlice = filteredScores.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filteredScores.length / PAGE_SIZE)

  const distData = useMemo(() => {
    const buckets = [{ label: '0-20', range: [0, 20] }, { label: '21-40', range: [21, 40] }, { label: '41-60', range: [41, 60] }, { label: '61-80', range: [61, 80] }, { label: '81-100', range: [81, 100] }]
    return buckets.map(({ label, range }) => ({
      label, count: data.scores.filter((s) => s.healthScore >= range[0] && s.healthScore <= range[1]).length,
      color: range[0] < 21 ? '#ef4444' : range[0] < 41 ? '#f97316' : range[0] < 61 ? '#f59e0b' : range[0] < 81 ? '#10b981' : '#22d3ee',
    }))
  }, [data.scores])

  // rótulo curto do modelo para os gráficos
  const shortModel = (m: string) => (m.length > 28 ? m.slice(0, 28) + '…' : m)

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-card-md">
        <div className="absolute -top-24 -right-12 w-80 h-80 rounded-full bg-gradient-brand opacity-[0.07] blur-3xl pointer-events-none animate-float" />
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/40 to-transparent" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0"><Wifi size={18} className="text-[#fff]" /></div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold gradient-text tracking-tight">Connection Engine</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-risk-low/10 text-risk-low border border-risk-low/20 font-mono">dados reais</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 max-w-xl leading-relaxed">Score de conexão 100% real — baseado no modelo de equipamento alocado, pontuado pelas notas da configuração.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] bg-app-surface border border-app-border px-3 py-2 rounded-xl" title="Clientes com equipamento · total ativos">
              <Zap size={11} className="text-brand-cyan" />
              <span className="font-mono text-gray-600"><span className="text-gray-900 font-semibold">{data.scores.length.toLocaleString('pt-BR')}</span> c/ equip.<span className="text-gray-400"> · {realTotals.clients.toLocaleString('pt-BR')} ativos</span></span>
            </div>
            <button onClick={() => setConfigOpen(true)} className="group flex items-center gap-2 text-xs font-medium text-[#fff] bg-gradient-brand px-3.5 py-2 rounded-xl shadow-glow hover:shadow-glow-violet hover:-translate-y-0.5 transition-all duration-200">
              <SlidersHorizontal size={13} className="group-hover:rotate-90 transition-transform duration-300" />Configurar engine
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard className="shadow-card-md hover:shadow-card-lg hover-lift" label="Connection Health Score" value={data.avgHealthScore.toFixed(1)} subtitle="Média — amostra real" variant={data.avgHealthScore < 50 ? 'danger' : data.avgHealthScore < 70 ? 'warning' : 'success'} icon={<Wifi size={14} />} iconColor={data.avgHealthScore < 50 ? 'text-risk-critical' : 'text-risk-low'} />
        <KpiCard className="shadow-card-md hover:shadow-card-lg hover-lift" label="Connection Churn Risk" value={`${data.avgChurnRisk.toFixed(1)}%`} subtitle="Risco médio (derivado do score)" variant="danger" icon={<AlertTriangle size={14} />} iconColor="text-risk-critical" />
        <KpiCard className="shadow-card-md hover:shadow-card-lg hover-lift" label="Revenue Risk" value={formatCurrency(data.totalRevenueRisk)} subtitle="Receita mensal em risco" variant="warning" icon={<TrendingDown size={14} />} iconColor="text-risk-medium" />
        <KpiCard className="shadow-card-md hover:shadow-card-lg hover-lift" label="Com Equipamento" value={data.withEquipment} subtitle={`${data.criticalCount} críticos · ${data.highRiskCount} alto risco`} icon={<Package size={14} />} iconColor="text-brand-blue" />
      </div>

      {/* Gauges + model breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-card-md hover:shadow-card-lg hover-lift">
          <CardHeader title="Score Overview" subtitle="Indicadores principais" icon={<Wifi size={14} />} />
          <div className="p-4 grid grid-cols-3 gap-2">
            <Gauge value={Math.round(data.avgHealthScore)} label="Connection Health Score" color={data.avgHealthScore >= 61 ? '#10b981' : data.avgHealthScore >= 41 ? '#f59e0b' : '#ef4444'} />
            <Gauge value={Math.round(data.avgChurnRisk)} label="Connection Churn Risk" color={data.avgChurnRisk >= 60 ? '#ef4444' : data.avgChurnRisk >= 40 ? '#f97316' : '#f59e0b'} />
            <Gauge value={Math.round((data.criticalCount + data.highRiskCount) / Math.max(1, data.scores.length) * 100)} label="% Clientes em Risco" color="#f97316" />
          </div>
          <div className="px-4 pb-4 space-y-2">
            {(['critical', 'high_risk', 'attention', 'healthy', 'excellent'] as const).map((cls) => {
              const count = data.scores.filter((s) => s.classification === cls).length
              const pct = (count / Math.max(1, data.scores.length)) * 100
              return (
                <div key={cls} className="flex items-center gap-2">
                  <span className="text-[10px] w-20 text-gray-500 shrink-0">{CLASS_LABEL[cls]}</span>
                  <div className="flex-1 h-1.5 bg-app-border rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: CLASS_COLOR[cls] }} /></div>
                  <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2 shadow-card-md hover:shadow-card-lg hover-lift">
          <CardHeader title="Equipamentos mais alocados (amostra)" subtitle="Clientes por modelo — top 12" icon={<Router size={14} />} />
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.modelBreakdown.map((m) => ({ ...m, short: shortModel(m.model) }))} layout="vertical" margin={{ top: 0, right: 8, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="short" tick={{ fill: '#9ca3af', fontSize: 8 }} axisLine={false} tickLine={false} width={150} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Clientes" radius={[0, 3, 3, 0]} fill="#4f8ef7" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Distribution + city */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-card-md hover:shadow-card-lg hover-lift">
          <CardHeader title="Distribuição de Score" subtitle="Clientes por faixa" />
          <div className="p-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Clientes" radius={[4, 4, 0, 0]}>{distData.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2 shadow-card-md hover:shadow-card-lg hover-lift">
          <CardHeader title="Score por Cidade" subtitle="Score médio e risco (amostra real)" icon={<AlertTriangle size={14} />} />
          <div className="p-4 space-y-2.5">
            {data.cityBreakdown.map((city) => {
              const color = city.avgScore >= 61 ? '#10b981' : city.avgScore >= 41 ? '#f59e0b' : '#ef4444'
              return (
                <div key={city.city} className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-400 w-28 shrink-0 truncate">{city.city}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-gray-600">Score: <span className="font-mono" style={{ color }}>{city.avgScore}</span></span>
                      <span className="text-[10px] text-gray-600">Risco: <span className="font-mono text-risk-critical">{city.avgRisk.toFixed(0)}%</span></span>
                    </div>
                    <ScoreBar value={city.avgScore} color={color} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-500 w-14 text-right">{city.count} cli.</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Indicator summary */}
      <Card className="shadow-card-md hover:shadow-card-lg hover-lift">
        <CardHeader title="Indicadores Configurados" subtitle="Modelos com nota definida" icon={<SlidersHorizontal size={14} />} />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {data.indicatorSummary.map((item) => {
            const isAI = item.mode === 'ai'
            const pct = item.totalIndices ? (item.configuredCount / item.totalIndices) * 100 : 0
            return (
              <div key={item.key} className="flex items-center gap-3 p-3 rounded-xl bg-app-surface border border-app-border">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', isAI ? 'bg-brand-violet/15 text-brand-violet' : 'bg-brand-blue/15 text-brand-blue')}>{isAI ? <Brain size={14} /> : <Hand size={14} />}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-200 truncate">{item.label}</p>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0', isAI ? 'bg-brand-violet/10 text-brand-violet' : 'bg-brand-blue/10 text-brand-blue')}>{isAI ? 'IA' : 'Manual'}</span>
                  </div>
                  <div className="mt-1.5"><ScoreBar value={pct} color={isAI ? '#7c3aed' : '#4f8ef7'} /></div>
                  <span className="text-[10px] text-gray-500">{item.configuredCount} de {item.totalIndices} modelos com nota</span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Ranking */}
      <Card className="shadow-card-md hover:shadow-card-lg hover-lift">
        <CardHeader title="Ranking de Conexão" subtitle="Clientes reais ordenados por Connection Health Score" icon={<ShieldAlert size={14} />} />
        <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
          {([
            { key: 'all', label: 'Todos', count: data.scores.length },
            { key: 'critical', label: 'Críticos', count: data.scores.filter(s => s.classification === 'critical').length },
            { key: 'high_risk', label: 'Alto Risco', count: data.scores.filter(s => s.classification === 'high_risk').length },
            { key: 'attention', label: 'Atenção', count: data.scores.filter(s => s.classification === 'attention').length },
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => { setTableFilter(key); setTablePage(0) }}
              className={cn('text-[10px] px-3 py-1.5 rounded-lg border font-medium transition-all',
                tableFilter === key ? 'bg-gradient-brand text-[#fff] border-transparent shadow-glow' : 'text-gray-500 border-app-border hover:text-gray-700 hover:border-app-borderLight hover:bg-app-surface')}>
              {label} <span className="font-mono ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-app-border bg-app-surface/50">{['#', 'Cliente', 'Health Score', 'Churn Risk', 'Equip.', 'Classificação', ''].map((h) => <th key={h} className="px-4 py-2.5 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium">{h}</th>)}</tr></thead>
            <tbody>{pageSlice.map((score, i) => <CustomerRow key={score.customerId} score={score} rank={tablePage * PAGE_SIZE + i + 1} />)}</tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
          <span className="text-[10px] text-gray-500">{tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, filteredScores.length)} de {filteredScores.length} clientes</span>
          <div className="flex gap-1.5">
            <button disabled={tablePage === 0} onClick={() => setTablePage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Anterior</button>
            <button disabled={tablePage >= totalPages - 1} onClick={() => setTablePage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Próxima</button>
          </div>
        </div>
      </Card>

      <p className="text-[10px] text-gray-500 text-center">Fonte: {realMeta.source} · amostra de {realMeta.sampleSize.toLocaleString('pt-BR')} clientes · gerado em {new Date(realMeta.generatedAt).toLocaleString('pt-BR')}</p>

      <ConnectionEngineConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}
