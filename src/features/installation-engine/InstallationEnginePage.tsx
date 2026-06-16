import { useMemo, useState } from 'react'
import {
  PackageOpen, AlertTriangle, TrendingDown, TrendingUp, Brain,
  ChevronDown, ChevronUp, Minus, Zap, Home, Cpu, Shield,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { mockCustomers } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { buildInstallationEngineData, UC_LABEL } from './installationEngine'
import { cn } from '@/utils/cn'
import type { InstallationEngineScore } from '@/types'

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

function InsightCard({ insight }: { insight: ReturnType<typeof buildInstallationEngineData>['insights'][0] }) {
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

const UC_ICON: Record<string, string> = { house: '🏠', condo: '🏘️', apartment: '🏢' }

function CustomerRow({ score, rank }: { score: InstallationEngineScore; rank: number }) {
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
              <p className="text-[10px] text-gray-500">{score.city}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono" style={{ color }}>{score.installationScore}</span>
            <div className="w-16"><ScoreBar value={score.installationScore} color={color} /></div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-[11px] text-gray-400">{score.installerName}</td>
        <td className="px-4 py-2.5 text-[11px] text-gray-400">
          {UC_ICON[score.ucType]} {UC_LABEL[score.ucType]}
        </td>
        <td className="px-4 py-2.5 text-[11px] text-gray-400">{score.ontBrand} {score.ontModel}</td>
        <td className="px-4 py-2.5 text-center">
          <span className={cn('text-[10px] font-mono', score.warrantyTickets > 0 ? 'text-risk-critical' : 'text-risk-low')}>
            {score.warrantyTickets}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={cn('text-[10px] font-mono', score.installDelayDays > 5 ? 'text-risk-critical' : score.installDelayDays > 2 ? 'text-risk-medium' : 'text-risk-low')}>
            {score.installDelayDays}d
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, background: `${color}15` }}>
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
            <div className="grid grid-cols-2 gap-4">
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
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function InstallationEnginePage() {
  const data = useMemo(() => buildInstallationEngineData(mockCustomers), [])
  const [tableFilter, setTableFilter] = useState<'all' | 'critical' | 'high_risk' | 'attention'>('all')
  const [tablePage, setTablePage] = useState(0)
  const PAGE_SIZE = 10

  const filteredScores = useMemo(() => {
    const sorted = [...data.scores].sort((a, b) => a.installationScore - b.installationScore)
    if (tableFilter === 'all') return sorted
    return sorted.filter((s) => s.classification === tableFilter)
  }, [data.scores, tableFilter])

  const pageSlice = filteredScores.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filteredScores.length / PAGE_SIZE)

  const warrantyPct  = Math.round((data.scores.filter((s) => s.warrantyTickets > 0).length / data.scores.length) * 100)
  const onTimePct    = Math.round((data.scores.filter((s) => s.installDelayDays === 0).length / data.scores.length) * 100)
  const scoreColor   = data.avgInstallationScore >= 61 ? '#10b981' : data.avgInstallationScore >= 41 ? '#f59e0b' : '#ef4444'

  const warrantyBarData = data.warrantyBreakdown.map((w) => ({ ...w }))
  const ucBarData       = data.ucTypeBreakdown.map((u) => ({ label: u.label, avgScore: u.avgScore, count: u.count, warrantyRate: u.warrantyRate }))
  const cityBarData     = [...data.cityBreakdown].slice(0, 8)

  return (
    <div className="space-y-5 animate-slide-up">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <PackageOpen size={13} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-white">Installation Engine</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono">v1.0</span>
          </div>
          <p className="text-[11px] text-gray-500">Motor de instalação — score baseado em prazo, chamados de garantia, retornos técnicos, tipo de UC e ONT aplicada</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 bg-app-card border border-app-border px-3 py-1.5 rounded-lg">
          <Zap size={10} className="text-brand-cyan" />
          <span className="font-mono text-brand-cyan">{data.scores.length} instalações analisadas</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Installation Score Médio"
          value={data.avgInstallationScore.toFixed(1)}
          subtitle="Score de qualidade de instalação"
          variant={data.avgInstallationScore >= 61 ? 'success' : data.avgInstallationScore >= 41 ? 'warning' : 'danger'}
          icon={<PackageOpen size={14} />}
          iconColor="text-violet-400"
        />
        <KpiCard
          label="Chamados em Garantia"
          value={`${warrantyPct}%`}
          subtitle={`Média ${data.avgWarrantyTickets.toFixed(2)} chamados/cliente`}
          variant={warrantyPct > 25 ? 'danger' : warrantyPct > 10 ? 'warning' : 'success'}
          icon={<Shield size={14} />}
          iconColor="text-risk-critical"
        />
        <KpiCard
          label="Retornos Técnicos"
          value={data.totalReturns}
          subtitle={`Total acumulado na base`}
          variant={data.totalReturns > 200 ? 'danger' : data.totalReturns > 100 ? 'warning' : 'success'}
          icon={<AlertTriangle size={14} />}
          iconColor="text-risk-medium"
        />
        <KpiCard
          label="Instalações no Prazo"
          value={`${onTimePct}%`}
          subtitle={`Atraso médio: ${data.avgInstallDelay.toFixed(1)} dias`}
          variant={onTimePct >= 70 ? 'success' : onTimePct >= 50 ? 'warning' : 'danger'}
          icon={<Home size={14} />}
          iconColor="text-brand-cyan"
        />
      </div>

      {/* Gauges + Score History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Score Overview" subtitle="Indicadores de qualidade de instalação" icon={<PackageOpen size={14} />} />
          <div className="p-4 grid grid-cols-3 gap-2">
            <Gauge value={Math.round(data.avgInstallationScore)} label="Install. Score" color={scoreColor} />
            <Gauge value={warrantyPct} label="% Garantia" color="#ef4444" />
            <Gauge value={onTimePct} label="% No Prazo" color="#10b981" />
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
          <CardHeader title="Evolução do Installation Score" subtitle="Últimos 12 meses" icon={<TrendingDown size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.scoreHistory} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradInstall" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="avgScore" name="Install. Score" stroke="#8b5cf6" fill="url(#gradInstall)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* UC Type, ONT and Warranty */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* UC type breakdown */}
        <Card>
          <CardHeader title="Tipo de UC" subtitle="Score e garantia por tipo de unidade" icon={<Home size={14} />} />
          <div className="p-4 space-y-3">
            {ucBarData.map((u, i) => {
              const color = ['#10b981', '#4f8ef7', '#f59e0b'][i] ?? '#6b7280'
              return (
                <div key={u.label} className="p-3 rounded-lg bg-app-surface border border-app-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-gray-200">{u.label}</span>
                    <span className="text-[10px] font-mono" style={{ color }}>{u.count} instalações</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-gray-500 w-20">Score médio</span>
                    <div className="flex-1 h-1.5 bg-app-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${u.avgScore}%`, background: color }} />
                    </div>
                    <span className="text-[10px] font-mono w-6 text-right" style={{ color }}>{u.avgScore}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">Taxa de garantia</span>
                    <span className={cn('text-[10px] font-mono', u.warrantyRate > 30 ? 'text-risk-critical' : u.warrantyRate > 15 ? 'text-risk-medium' : 'text-risk-low')}>
                      {u.warrantyRate}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Warranty ticket distribution */}
        <Card>
          <CardHeader title="Chamados em Garantia (72h)" subtitle="Distribuição por quantidade" icon={<Shield size={14} />} />
          <div className="p-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={warrantyBarData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Instalações" radius={[4, 4, 0, 0]}>
                  {warrantyBarData.map((_, i) => (
                    <Cell key={i} fill={['#10b981', '#f59e0b', '#f97316', '#ef4444'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 pb-3 space-y-1">
            {data.warrantyBreakdown.map((w) => (
              <div key={w.label} className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500">{w.label}</span>
                <span className="font-mono text-gray-300">{w.count} <span className="text-gray-600">({w.pct}%)</span></span>
              </div>
            ))}
          </div>
        </Card>

        {/* ONT breakdown */}
        <Card>
          <CardHeader title="ONT por Marca" subtitle="Score médio e taxa de garantia por fornecedor" icon={<Cpu size={14} />} />
          <div className="p-4 space-y-2.5">
            {data.ontBreakdown.slice(0, 7).map((o, i) => {
              const color = o.warrantyRate > 30 ? '#ef4444' : o.warrantyRate > 15 ? '#f59e0b' : '#10b981'
              return (
                <div key={o.brand} className="flex items-center gap-2.5">
                  <span className="text-[10px] text-gray-600 w-3">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-gray-300">{o.brand}</span>
                      <span className="text-[10px] font-mono text-gray-500">{o.count} ONTs</span>
                    </div>
                    <div className="h-1 bg-app-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${o.warrantyRate}%`, background: color }} />
                    </div>
                  </div>
                  <span className="text-[10px] font-mono w-10 text-right" style={{ color }}>{o.warrantyRate}%</span>
                </div>
              )
            })}
            <p className="text-[9px] text-gray-600 pt-1">% = taxa de chamados em garantia</p>
          </div>
        </Card>
      </div>

      {/* Installer performance */}
      <Card>
        <CardHeader title="Performance por Instalador" subtitle="Score médio, taxa de garantia, retornos e atraso por instalador" icon={<PackageOpen size={14} />} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-app-border">
                {['Instalador', 'Instalações', 'Instal. Score', 'Taxa Garantia', 'Taxa Retorno', 'Atraso Médio', 'Score Bar'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {data.installerBreakdown.map((inst) => {
                const color = inst.avgScore >= 61 ? '#10b981' : inst.avgScore >= 41 ? '#f59e0b' : '#ef4444'
                return (
                  <tr key={inst.name} className="hover:bg-app-cardHover transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{ background: `${color}20`, color }}>
                          {inst.name[0]}
                        </div>
                        <span className="text-xs font-medium text-gray-200">{inst.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-300">{inst.count}</td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-bold font-mono" style={{ color }}>{inst.avgScore}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-mono', inst.warrantyRate > 30 ? 'text-risk-critical' : inst.warrantyRate > 15 ? 'text-risk-medium' : 'text-risk-low')}>
                        {inst.warrantyRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-mono', inst.returnRate > 20 ? 'text-risk-critical' : inst.returnRate > 10 ? 'text-risk-medium' : 'text-risk-low')}>
                        {inst.returnRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-mono', inst.avgDelay > 5 ? 'text-risk-critical' : inst.avgDelay > 2 ? 'text-risk-medium' : 'text-risk-low')}>
                        {inst.avgDelay}d
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-app-surface rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${inst.avgScore}%`, background: color }} />
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

      {/* City breakdown */}
      <Card>
        <CardHeader title="Installation Score por Cidade" subtitle="Score médio de instalação por município" icon={<AlertTriangle size={14} />} />
        <div className="p-4">
          <div className="space-y-2.5">
            {cityBarData.map((city) => {
              const color = city.avgScore >= 61 ? '#10b981' : city.avgScore >= 41 ? '#f59e0b' : '#ef4444'
              return (
                <div key={city.city} className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-400 w-28 shrink-0">{city.city}</span>
                  <div className="flex-1">
                    <ScoreBar value={city.avgScore} color={color} />
                  </div>
                  <span className="text-[10px] font-mono w-8 text-right" style={{ color }}>{city.avgScore}</span>
                  <span className="text-[10px] font-mono text-gray-500 w-16 text-right">{city.count} inst.</span>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader title="AI Insights — Instalação e Churn" subtitle="Correlações entre qualidade de instalação e risco de cancelamento precoce" icon={<Brain size={14} />} />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      </Card>

      {/* Customer Table */}
      <Card>
        <CardHeader title="Ranking de Installation Score" subtitle="Instalações com menor score — maior risco de churn precoce" icon={<PackageOpen size={14} />} />
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
                  ? 'bg-violet-500/10 text-violet-400 border-violet-500/30'
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
                {['#', 'Cliente', 'Install. Score', 'Instalador', 'UC', 'ONT', 'Garantia', 'Atraso', 'Classif.', 'Tendência', ''].map((h) => (
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
            {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, filteredScores.length)} de {filteredScores.length} instalações
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
