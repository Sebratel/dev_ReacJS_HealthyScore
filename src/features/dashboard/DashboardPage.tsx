import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, DollarSign, Users, Gauge as GaugeIcon, ChevronRight, Brain } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { realTotals, realMeta } from '@/data/realClients'
import { useEngineSummaries, buildClientRiskRanking } from './engineSummaries'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { HealthGauge, HEALTH_COLORS, HEALTH_LABELS, scoreToHealthClass } from '@/components/ui/HealthGauge'
import { formatCurrency, cn } from '@/utils/cn'
import type { HealthClassification } from '@/types'

const DIST_ORDER: HealthClassification[] = ['critical', 'high_risk', 'attention', 'healthy', 'excellent']

function scoreColor(v: number) {
  return v >= 81 ? '#22d3ee' : v >= 61 ? '#10b981' : v >= 41 ? '#f59e0b' : v >= 21 ? '#f97316' : '#ef4444'
}

const CompTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1 font-medium">{label}</p>
      <p style={{ color: payload[0].color }}>Health Score: <strong>{payload[0].value}</strong></p>
    </div>
  )
}

// Mini barra de distribuição (críticos → excelentes)
function DistBar({ dist, total }: { dist: Record<HealthClassification, number>; total: number }) {
  if (!total) return <div className="h-1.5 rounded-full bg-app-border" />
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
      {DIST_ORDER.map((cls) => {
        const pct = (dist[cls] / total) * 100
        if (pct <= 0) return null
        return <div key={cls} className="h-full" style={{ width: `${pct}%`, background: HEALTH_COLORS[cls] }} title={`${HEALTH_LABELS[cls]}: ${dist[cls]}`} />
      })}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const engines = useEngineSummaries()

  const globalHealth = useMemo(
    () => Math.round(engines.reduce((a, e) => a + e.avgHealthScore, 0) / Math.max(1, engines.length)),
    [engines],
  )
  const enginesAtRisk = engines.filter((e) => e.avgHealthScore < 60).length

  const ranking = useMemo(() => buildClientRiskRanking(engines), [engines])
  const criticalClients = ranking.filter((r) => r.classification === 'critical' || r.classification === 'high_risk').length
  const revenueAtRisk = useMemo(
    () => ranking.filter((r) => r.classification === 'critical' || r.classification === 'high_risk').reduce((a, r) => a + r.revenueRisk, 0),
    [ranking],
  )
  const topRisk = ranking.slice(0, 8)

  const compData = useMemo(
    () => engines.map((e) => ({ name: e.label, score: e.avgHealthScore })).sort((a, b) => a.score - b.score),
    [engines],
  )

  const globalColor = scoreColor(globalHealth)

  return (
    <div className="space-y-6 animate-slide-up">
      {/* KPIs — 100% dados reais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clientes Ativos" value={realTotals.clients.toLocaleString('pt-BR')} subtitle={`${realTotals.contracts.toLocaleString('pt-BR')} contratos`} icon={<Users size={14} />} variant="brand" />
        <KpiCard label="MRR (Base Ativa)" value={formatCurrency(realTotals.mrr)} subtitle="Receita recorrente mensal" icon={<DollarSign size={14} />} variant="success" iconColor="text-risk-low" />
        <KpiCard label="Health Score Global" value={`${globalHealth}/100`} subtitle="Média dos 7 módulos" icon={<Activity size={14} />} variant={globalHealth < 50 ? 'danger' : globalHealth < 70 ? 'warning' : 'success'} iconColor={globalHealth < 50 ? 'text-risk-critical' : 'text-risk-low'} />
        <KpiCard label="Clientes em Risco" value={criticalClients.toLocaleString('pt-BR')} subtitle={`Receita em risco: ${formatCurrency(revenueAtRisk)}/mês`} icon={<AlertTriangle size={14} />} variant="danger" iconColor="text-risk-critical" />
      </div>

      {/* Resumo por engine */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <GaugeIcon size={14} className="text-brand-cyan" />
          <h2 className="text-sm font-bold text-white">Resumo dos Health Scores por Módulo</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {engines.map((e) => {
            const cls = scoreToHealthClass(e.avgHealthScore)
            return (
              <button
                key={e.key}
                onClick={() => navigate(e.route)}
                className="text-left bg-app-card border border-app-border rounded-2xl p-4 shadow-card hover:shadow-card-md hover:border-app-borderLight hover:-translate-y-0.5 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-200">{e.label}</span>
                  <ChevronRight size={13} className="text-gray-600 group-hover:text-brand-blue transition-colors" />
                </div>
                <div className="flex items-center gap-3">
                  <HealthGauge score={Math.round(e.avgHealthScore)} size={72} showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: HEALTH_COLORS[cls] }}>{HEALTH_LABELS[cls]}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{e.analyzed.toLocaleString('pt-BR')} analisados</p>
                    <p className="text-[10px] text-gray-500">
                      <span className="text-risk-critical font-mono">{e.criticalCount}</span> crít. ·{' '}
                      <span className="text-risk-high font-mono">{e.highRiskCount}</span> alto
                    </p>
                  </div>
                </div>
                <div className="mt-3"><DistBar dist={e.distribution} total={e.analyzed} /></div>
              </button>
            )
          })}

          {/* Card de score global */}
          <div className="bg-gradient-to-br from-brand-blue/10 to-brand-violet/10 border border-brand-blue/25 rounded-2xl p-4 flex flex-col items-center justify-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Health Global</p>
            <HealthGauge score={globalHealth} size={96} />
            <p className="text-[10px] text-gray-500 mt-1">{enginesAtRisk} de {engines.length} módulos abaixo de 60</p>
          </div>
        </div>
      </div>

      {/* Comparação entre engines + maiores riscos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Comparação de Health Score por Módulo" subtitle="Média do score de cada módulo" icon={<GaugeIcon size={14} />} />
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compData} layout="vertical" margin={{ top: 4, right: 16, left: 24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--app-border))" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={92} />
                <Tooltip content={<CompTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="score" name="Health Score" radius={[0, 4, 4, 0]} barSize={18}>
                  {compData.map((d, i) => <Cell key={i} fill={scoreColor(d.score)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Clientes com Maior Risco"
            subtitle="Score combinado por cliente"
            icon={<AlertTriangle size={14} />}
            action={<button onClick={() => navigate('/ia')} className="text-[11px] text-brand-blue hover:text-brand-blueLight flex items-center gap-1"><Brain size={11} /> Análise de IA →</button>}
          />
          <div className="divide-y divide-app-border">
            {topRisk.map((c, i) => {
              const color = HEALTH_COLORS[c.classification]
              return (
                <div key={c.customerId} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-[10px] font-mono text-gray-600 w-4">{i + 1}</span>
                  <div className="w-8 h-8 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0" style={{ backgroundColor: color + '15', borderColor: color + '30', color }}>
                    {c.customerName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-100 truncate">{c.customerName}</p>
                    <p className="text-[10px] text-gray-500">{c.city} · {c.plan}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-center">
                    <span className="text-[9px] text-gray-600">{c.enginesPresent} módulos</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span style={{ color }} className="text-sm font-bold tabular-nums leading-none">{c.overallHealth}</span>
                    <span className="text-[9px] text-gray-600">health</span>
                  </div>
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded')} style={{ color, background: `${color}15` }}>{HEALTH_LABELS[c.classification]}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <p className="text-[10px] text-gray-500 text-center">
        {realTotals.clients.toLocaleString('pt-BR')} clientes ativos · amostra de {realMeta.sampleSize.toLocaleString('pt-BR')} · atualizado em {new Date(realMeta.generatedAt).toLocaleString('pt-BR')}
      </p>
    </div>
  )
}
