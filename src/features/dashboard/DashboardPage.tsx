import { useMemo } from 'react'
import { AlertTriangle, Activity, DollarSign, TrendingDown, Users, Zap, MapPin } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { mockCustomers, MONTHLY_CHURN } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { HealthGauge, HEALTH_COLORS, HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { formatCurrency } from '@/utils/cn'
import { cn } from '@/utils/cn'
import { useNavigate } from 'react-router-dom'
import { HealthClassification } from '@/types'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="mt-0.5">
          {p.name}: <strong>{typeof p.value === 'number' && p.value > 999 ? formatCurrency(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

const HEALTH_DIST_ORDER: HealthClassification[] = ['critical', 'high_risk', 'attention', 'healthy', 'excellent']

export default function DashboardPage() {
  const navigate = useNavigate()

  const stats = useMemo(() => {
    const total = mockCustomers.length
    const avgHealth = Math.round(mockCustomers.reduce((a, c) => a + c.healthScores.overall, 0) / total)
    const critical = mockCustomers.filter((c) => c.healthScores.classification === 'critical').length
    const highRisk = mockCustomers.filter((c) => c.healthScores.classification === 'high_risk').length
    const degrading = mockCustomers.filter((c) => c.healthScores.trend === 'degrading').length
    const revenueAtRisk = mockCustomers
      .filter((c) => c.healthScores.classification === 'critical' || c.healthScores.classification === 'high_risk')
      .reduce((a, c) => a + c.derivedRisks.revenueLossMonthly, 0)
    const avgChurnProb = Math.round(mockCustomers.reduce((a, c) => a + c.derivedRisks.churn.probability, 0) / total)
    const equipRisk = mockCustomers.filter((c) => c.derivedRisks.equipmentReturn.probability > 50).length

    return { total, avgHealth, critical, highRisk, degrading, revenueAtRisk, avgChurnProb, equipRisk }
  }, [])

  const healthDistribution = useMemo(() => {
    return HEALTH_DIST_ORDER.map((cls) => ({
      label: HEALTH_LABELS[cls],
      count: mockCustomers.filter((c) => c.healthScores.classification === cls).length,
      color: HEALTH_COLORS[cls],
      cls,
    }))
  }, [])

  const churnByCity = useMemo(() => {
    const map: Record<string, { city: string; critical: number; high_risk: number; attention: number; healthy: number; excellent: number; total: number }> = {}
    mockCustomers.forEach((c) => {
      if (!map[c.city]) map[c.city] = { city: c.city, critical: 0, high_risk: 0, attention: 0, healthy: 0, excellent: 0, total: 0 }
      map[c.city][c.healthScores.classification]++
      map[c.city].total++
    })
    return Object.values(map).sort((a, b) => b.critical - a.critical)
  }, [])

  const topDegrading = useMemo(() =>
    mockCustomers.filter((c) => c.healthScores.trend === 'degrading').sort((a, b) => a.healthScores.overall - b.healthScores.overall).slice(0, 6),
    []
  )

  const forecastData = MONTHLY_CHURN.slice(-8).map((m) => ({
    month: m.month,
    cancelamentos: m.churned,
    novos: m.newCustomers,
    receita: m.revenueAtRisk,
  }))

  return (
    <div className="space-y-6 animate-slide-up">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Health Score Médio" value={`${stats.avgHealth}/100`} subtitle={`Base de ${stats.total} clientes`} icon={<Activity size={14} />} delta={-2.1} deltaLabel="vs. 30d" variant="brand" />
        <KpiCard label="Saúde Crítica" value={`${stats.critical + stats.highRisk}`} subtitle={`${stats.critical} críticos · ${stats.highRisk} alto risco`} icon={<AlertTriangle size={14} />} delta={8.3} deltaLabel="vs. 30d" variant="danger" iconColor="text-risk-critical" />
        <KpiCard label="Receita Mensal em Risco" value={formatCurrency(stats.revenueAtRisk)} subtitle="Crítico + alto risco" icon={<DollarSign size={14} />} delta={5.7} deltaLabel="vs. 30d" variant="warning" iconColor="text-risk-medium" />
        <KpiCard label="Deteriorando" value={stats.degrading} subtitle={`${stats.equipRisk} com risco de equipamento`} icon={<TrendingDown size={14} />} delta={12.1} deltaLabel="vs. 30d" variant="danger" />
      </div>

      {/* Health score distribution + gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overview gauge */}
        <Card className="flex flex-col items-center justify-center py-6 lg:col-span-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Health Score da Base</p>
          <HealthGauge score={stats.avgHealth} size={160} />
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 w-full px-6">
            {healthDistribution.map((h) => (
              <div key={h.cls} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: h.color }} />
                <span className="text-[11px] text-gray-400 flex-1">{h.label}</span>
                <span className="text-[11px] font-bold font-mono" style={{ color: h.color }}>{h.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Distribution bar */}
        <Card className="lg:col-span-2">
          <CardHeader title="Distribuição por Cidade e Saúde" subtitle="Breakdown de health score por cidade" icon={<MapPin size={14} />} />
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={churnByCity} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="city" tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="critical" name="Crítico" stackId="a" fill="#ef4444" />
                <Bar dataKey="high_risk" name="Alto Risco" stackId="a" fill="#f97316" />
                <Bar dataKey="attention" name="Atenção" stackId="a" fill="#f59e0b" />
                <Bar dataKey="healthy" name="Saudável" stackId="a" fill="#10b981" />
                <Bar dataKey="excellent" name="Excelente" stackId="a" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Churn evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Evolução Mensal de Churn" subtitle="Cancelamentos vs. novos clientes" icon={<TrendingDown size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="cancelamentos" name="Cancelamentos" stroke="#ef4444" fill="url(#gC)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="novos" name="Novos Clientes" stroke="#10b981" fill="url(#gN)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Derived risks overview */}
        <Card>
          <CardHeader title="Visão de Riscos Derivados" subtitle="Distribuição na base" icon={<Zap size={14} />} />
          <div className="p-5 space-y-4">
            {[
              { label: 'Risco de Churn', key: 'churn' as const, desc: 'Prob. cancelamento 30d' },
              { label: 'Risco de Equipamento', key: 'equipmentReturn' as const, desc: 'Não devolução' },
            ].map(({ label, key, desc }) => {
              const critical = mockCustomers.filter((c) => c.derivedRisks[key].probability > 75).length
              const high = mockCustomers.filter((c) => c.derivedRisks[key].probability > 55 && c.derivedRisks[key].probability <= 75).length
              const medium = mockCustomers.filter((c) => c.derivedRisks[key].probability > 35 && c.derivedRisks[key].probability <= 55).length
              const low = mockCustomers.filter((c) => c.derivedRisks[key].probability <= 35).length
              const total = mockCustomers.length
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-300">{label}</span>
                    <span className="text-[10px] text-gray-500">{desc}</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                    <div className="h-full bg-risk-critical rounded-l-full" style={{ width: `${(critical / total) * 100}%` }} title={`Crítico: ${critical}`} />
                    <div className="h-full bg-risk-high" style={{ width: `${(high / total) * 100}%` }} title={`Alto: ${high}`} />
                    <div className="h-full bg-risk-medium" style={{ width: `${(medium / total) * 100}%` }} title={`Médio: ${medium}`} />
                    <div className="h-full bg-risk-low rounded-r-full flex-1" title={`Baixo: ${low}`} />
                  </div>
                  <div className="flex justify-between mt-1">
                    {[{ c: '#ef4444', v: critical, l: 'Crítico' }, { c: '#f97316', v: high, l: 'Alto' }, { c: '#f59e0b', v: medium, l: 'Médio' }, { c: '#10b981', v: low, l: 'Baixo' }].map(({ c, v, l }) => (
                      <span key={l} className="text-[10px]" style={{ color: c }}>{l}: <strong>{v}</strong></span>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Revenue at risk */}
            <div className="pt-2 border-t border-app-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Receita Anual em Risco</span>
                <span className="text-sm font-bold text-risk-critical font-mono">
                  {formatCurrency(mockCustomers.reduce((a, c) => a + c.derivedRisks.revenueLossMonthly, 0) * 12)}
                </span>
              </div>
              <p className="text-[10px] text-gray-600 mt-0.5">Projeção baseada em probabilidade de churn × MRR</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Customers in deterioration */}
      <Card>
        <CardHeader
          title="Clientes em Deterioração — Ação Necessária"
          subtitle="Health Score em queda + risco crítico/alto"
          icon={<TrendingDown size={14} />}
          action={<button onClick={() => navigate('/clientes')} className="text-[11px] text-brand-blue hover:text-brand-blueLight">Ver todos →</button>}
        />
        <div className="divide-y divide-app-border">
          {topDegrading.map((c) => {
            const color = HEALTH_COLORS[c.healthScores.classification]
            return (
              <div
                key={c.id}
                onClick={() => navigate(`/cliente360?id=${c.id}`)}
                className="flex items-center gap-4 px-5 py-3 hover:bg-app-cardHover cursor-pointer transition-colors group"
              >
                <div className="w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: color + '15', borderColor: color + '30', color }}>
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-100 truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-500">{c.city} · {c.plan}</p>
                </div>
                <div className="hidden sm:flex flex-col items-center gap-0.5">
                  <span style={{ color }} className="text-lg font-bold tabular-nums leading-none">{c.healthScores.overall}</span>
                  <span className="text-[9px] text-gray-600">health</span>
                </div>
                <div className="hidden md:flex flex-col items-end gap-0.5">
                  <span className="text-xs text-risk-critical font-mono">{c.derivedRisks.churn.probability}% churn</span>
                  <span className="text-[10px] text-gray-500">{formatCurrency(c.monthlyValue)}/mês</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingDown size={11} className="text-risk-critical" />
                  <span className="text-[11px] text-risk-critical font-mono">-{Math.abs(c.healthScores.trendValue)}pts</span>
                </div>
                <span className="text-[10px] text-brand-blue hidden group-hover:inline">360° →</span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
