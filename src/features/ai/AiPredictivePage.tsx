import { useEffect, useMemo, useState } from 'react'
import { Brain, Zap, AlertTriangle, Activity, ChevronRight, Cpu, Sparkles, Radio, DollarSign, MessageSquare, Loader2, Lock, RefreshCw } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { HEALTH_COLORS, HEALTH_LABELS, HealthGauge } from '@/components/ui/HealthGauge'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { ContractFilters, type ContractFilterState } from '@/components/ui/ContractFilters'
import { formatCurrency, cn } from '@/utils/cn'
import { useAppStore } from '@/store/appStore'
import { fetchDashboard, ApiError, type DashboardResponse, type RankedClient } from '@/features/dashboard/dashboardApi'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  )
}

function TypewriterText({ text, speed = 12 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed(''); setDone(false)
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++ }
      else { setDone(true); clearInterval(interval) }
    }, speed)
    return () => clearInterval(interval)
  }, [text, speed])
  return <span>{displayed}{!done && <span className="inline-block w-0.5 h-3.5 bg-brand-blue ml-0.5 animate-pulse" />}</span>
}

// Explicação a partir dos sinais reais (agora vêm do backend com o ranking).
function explain(r: RankedClient): string {
  const parts: string[] = []
  const s = r.signals
  if (s) {
    if (s.relCancelThreats > 0) parts.push(`${s.relCancelThreats} ameaça(s) de cancelamento registrada(s)`)
    if (s.overdue > 0) parts.push(`${s.overdue} fatura(s) em atraso/aberto`)
    if (s.renegotiations > 0) parts.push(`${s.renegotiations} renegociação(ões)`)
    if (s.netMassiveCount > 0) parts.push(`${s.netMassiveCount} massiva(s) de rede`)
    if (s.slaLateCount > 0) parts.push(`${s.slaLateCount} atendimento(s) de campo com SLA estourado`)
    if (s.trustReleases > 0) parts.push(`${s.trustReleases} desbloqueio(s) por confiança`)
  }
  const worst = [...r.byEngine].sort((a, b) => a.healthScore - b.healthScore)[0]
  if (worst) parts.push(`menor score em ${worst.label} (${worst.healthScore}/100)`)
  if (parts.length === 0) parts.push('deterioração combinada de múltiplos módulos')
  return `Modelo estima risco de churn de ${r.overallChurnRisk}% (health ${r.overallHealth}/100 · ${HEALTH_LABELS[r.classification]}) — causas: ${parts.slice(0, 3).join('; ')}. Receita mensal exposta: ${formatCurrency(r.revenueRisk)}.`
}

export default function AiPredictivePage() {
  const navigate = useNavigate()
  const financialConfig = useAppStore((s) => s.financialConfig)
  const commercialConfig = useAppStore((s) => s.commercialConfig)
  const connectionConfig = useAppStore((s) => s.connectionConfig)
  const networkConfig = useAppStore((s) => s.networkConfig)
  const fieldConfig = useAppStore((s) => s.fieldConfig)
  const installationConfig = useAppStore((s) => s.installationConfig)
  const relationshipConfig = useAppStore((s) => s.relationshipConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const criticalThreshold = thresholds.high_risk

  const [filters, setFilters] = useState<ContractFilterState>({ contract: '', name: '', city: '' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modelRunning, setModelRunning] = useState(false)
  const [modelDone, setModelDone] = useState(false)

  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const configs = { financial: financialConfig, commercial: commercialConfig, connection: connectionConfig, network: networkConfig, field: fieldConfig, installation: installationConfig, relationship: relationshipConfig }
    const timer = setTimeout(() => {
      fetchDashboard({ configs, thresholds, name: filters.name, contract: filters.contract, city: filters.city, topN: 12 })
        .then((d) => { if (alive) { setData(d); setError(null) } })
        .catch((e) => { if (alive) setError(e instanceof ApiError ? e : new ApiError(0, 'Erro inesperado.')) })
        .finally(() => { if (alive) setLoading(false) })
    }, 300)
    return () => { alive = false; clearTimeout(timer) }
  }, [financialConfig, commercialConfig, connectionConfig, networkConfig, fieldConfig, installationConfig, relationshipConfig, thresholds, filters.name, filters.contract, filters.city, reloadKey])

  const monthlyData = useMemo(() => (data?.monthly ?? []).map((m) => ({ month: m.month, 'No prazo': m.onTime, 'Em atraso': m.late, 'Em aberto': m.overdue })), [data])

  const autoAlerts = useMemo(() => {
    if (!data) return []
    const bc = data.baseCounts
    return [
      { type: 'critical', message: `${data.ranking.criticalCount} clientes com health combinado crítico (<${criticalThreshold}) — ação imediata`, action: 'Ver financeiro', path: '/financeiro' },
      { type: 'critical', message: `${bc.cancelThreats} clientes com ameaça ativa de cancelamento`, action: 'Relacionamento', path: '/engine-relacionamento' },
      { type: 'high', message: `${bc.overdueClients} clientes com faturas em atraso ou em aberto vencidas`, action: 'Financeiro', path: '/financeiro' },
      { type: 'medium', message: `${bc.slaLateClients} clientes com SLA de atendimento em campo estourado`, action: 'Campo', path: '/manutencao' },
      { type: 'info', message: `${bc.massiveClients} clientes impactados por massivas de rede no período`, action: 'Rede', path: '/engine-rede' },
    ]
  }, [data, criticalThreshold])

  const runModel = () => {
    setModelRunning(true); setModelDone(false)
    setTimeout(() => { setModelRunning(false); setModelDone(true) }, 2200)
  }

  if (loading && !data) {
    return <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-card px-5 py-16 text-sm text-gray-400 animate-slide-up"><Loader2 size={16} className="animate-spin" /> Rodando o modelo no servidor…</div>
  }
  if (error && !data) {
    return (
      <div className="rounded-xl border border-app-border bg-app-card px-5 py-6 space-y-3 animate-slide-up">
        <div className="flex items-start gap-2.5 text-sm text-rose-300">
          {error.status === 401 ? <Lock size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <div>
            <p className="font-medium text-gray-100">{error.status === 0 ? 'Servidor indisponível' : error.status === 401 ? 'Sessão expirada' : 'Não foi possível carregar a IA'}</p>
            <p className="mt-0.5 text-[12px] text-gray-400">{error.message}</p>
          </div>
        </div>
        <button onClick={() => setReloadKey((k) => k + 1)} className="flex items-center gap-1.5 rounded-md border border-app-border px-3 py-1.5 text-[12px] text-gray-300 hover:border-app-borderLight hover:text-gray-100 transition-colors"><RefreshCw size={13} /> Tentar novamente</button>
      </div>
    )
  }
  if (!data) return null

  const rk = data.ranking
  const topRisk = rk.top

  return (
    <div className="space-y-5 animate-slide-up">
      {loading && <div className="flex items-center justify-end gap-1.5 text-[11px] text-gray-500 -mb-3"><Loader2 size={11} className="animate-spin" /> atualizando…</div>}
      {/* AI Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-brand-violet/20 via-brand-blue/10 to-brand-cyan/10 border border-brand-violet/30 p-5">
        <div className="absolute inset-0 bg-gradient-radial from-brand-violet/10 via-transparent to-transparent" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0"><Brain size={18} className="text-white" /></div>
            <div>
              <h2 className="text-base font-bold text-white">IA Preditiva — Health Score combinado</h2>
              <p className="text-sm text-gray-400 mt-0.5">{data.summaries.length} módulos · risco por cliente</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {[{ label: 'Módulos', value: String(data.summaries.length) }, { label: 'Clientes', value: rk.total.toLocaleString('pt-BR') }, { label: 'Em risco', value: rk.atRiskCount.toLocaleString('pt-BR') }].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-1.5"><span className="text-[10px] text-gray-500">{label}:</span><span className="text-[11px] font-semibold text-brand-cyan font-mono">{value}</span></div>
                ))}
              </div>
            </div>
          </div>
          <button onClick={runModel} disabled={modelRunning} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all shrink-0', modelRunning ? 'bg-brand-blue/20 border-brand-blue/30 text-brand-blue cursor-wait' : modelDone ? 'bg-risk-low/20 border-risk-low/30 text-risk-low' : 'bg-brand-blue text-white border-brand-blue hover:bg-brand-blueLight')}>
            {modelRunning ? <><Cpu size={12} className="animate-spin" /> Processando...</> : modelDone ? <><Sparkles size={12} /> Modelo atualizado</> : <><Zap size={12} /> Executar modelo</>}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clientes Críticos" value={rk.criticalCount.toLocaleString('pt-BR')} subtitle={`Health combinado < ${criticalThreshold}`} variant="danger" icon={<AlertTriangle size={14} />} iconColor="text-risk-critical" />
        <KpiCard label="Receita Anual em Risco" value={formatCurrency(rk.annualRevenueRisk)} subtitle="Risco × MRR × 12" variant="warning" icon={<DollarSign size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Ameaças de Cancelamento" value={data.baseCounts.cancelThreats.toLocaleString('pt-BR')} subtitle="Registradas no relacionamento" variant="danger" icon={<MessageSquare size={14} />} iconColor="text-risk-high" />
        <KpiCard label="Alertas Automáticos" value={autoAlerts.length} subtitle="Ações recomendadas" variant="brand" icon={<Radio size={14} />} iconColor="text-brand-blue" />
      </div>

      {/* Auto alerts */}
      <Card>
        <CardHeader title="Alertas Automáticos do Modelo" subtitle="Derivados dos sinais de cada módulo" icon={<Radio size={14} />} />
        <div className="p-4 space-y-2">
          {autoAlerts.map((alert, i) => {
            const cfg = { critical: { bg: 'bg-risk-critical/10 border-risk-critical/25', text: 'text-risk-critical', dot: 'bg-risk-critical animate-pulse' }, high: { bg: 'bg-risk-high/10 border-risk-high/25', text: 'text-risk-high', dot: 'bg-risk-high' }, medium: { bg: 'bg-risk-medium/10 border-risk-medium/25', text: 'text-risk-medium', dot: 'bg-risk-medium' }, info: { bg: 'bg-brand-blue/10 border-brand-blue/25', text: 'text-brand-blue', dot: 'bg-brand-blue' } }[alert.type as 'critical' | 'high' | 'medium' | 'info']!
            return (
              <div key={i} className={cn('flex items-center gap-3 p-3 rounded-lg border', cfg.bg)}>
                <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                <p className="flex-1 text-xs text-gray-300">{alert.message}</p>
                <button onClick={() => alert.path && navigate(alert.path)} className={cn('text-[11px] font-semibold whitespace-nowrap hover:opacity-80', cfg.text)}>{alert.action} →</button>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Adimplência da Base — Histórico Real" subtitle="Faturas no prazo × atraso × em aberto vencidas" icon={<Activity size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gOn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gLate" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gOvd" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="No prazo" stroke="#10b981" fill="url(#gOn)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Em atraso" stroke="#f97316" fill="url(#gLate)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Em aberto" stroke="#ef4444" fill="url(#gOvd)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Radar de Scores" subtitle="Média dos módulos no grupo de risco" />
          <div className="p-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={rk.radar}>
                <PolarGrid stroke="#1a2236" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 9 }} />
                <Radar name="Score médio" dataKey="value" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <ContractFilters filters={filters} onChange={(f) => setFilters(f)} cities={data.cities} resultCount={rk.visibleTotal} totalCount={rk.total} />

      {/* Top risk com explicações de IA */}
      <Card>
        <CardHeader title="Clientes com Maior Risco — Explicação de IA" subtitle="Health combinado dos módulos com análise automatizada por cliente" icon={<Brain size={14} />} />
        <div className="divide-y divide-app-border">
          {topRisk.map((r, i) => {
            const color = HEALTH_COLORS[r.classification]
            const isSelected = selectedId === r.customerId
            return (
              <div key={r.customerId} className={cn('transition-colors', isSelected && 'bg-app-cardHover')}>
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer group" onClick={() => setSelectedId(isSelected ? null : r.customerId)}>
                  <span className="text-sm font-bold text-gray-700 w-5">{i + 1}</span>
                  <HealthGauge score={r.overallHealth} size={42} showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-100 truncate">{r.customerName}</p>
                    <p className="text-[10px] text-gray-500">{r.city} · {r.plan}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end"><span style={{ color }} className="text-sm font-bold">{r.overallHealth}</span><span className="text-[9px] text-gray-600">{HEALTH_LABELS[r.classification]}</span></div>
                  <div className="hidden md:flex flex-col items-end"><span className="text-xs font-mono text-risk-critical">{r.overallChurnRisk}%</span><span className="text-[10px] text-gray-600">churn</span></div>
                  <div className="hidden lg:flex flex-col items-end"><span className="text-xs font-mono text-risk-medium">{r.enginesPresent}</span><span className="text-[10px] text-gray-600">módulos</span></div>
                  <ChevronRight size={12} className={cn('text-gray-600 transition-transform', isSelected && 'rotate-90')} />
                </div>

                {isSelected && (
                  <div className="mx-5 mb-3 p-3.5 rounded-lg bg-brand-violet/10 border border-brand-violet/25">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles size={10} className="text-brand-violetLight" />
                      <span className="text-[10px] font-bold text-brand-violetLight uppercase tracking-wider">Análise de IA</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed font-mono"><TypewriterText text={explain(r)} /></p>
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {r.byEngine.map((b) => (
                        <div key={b.key} className="text-center"><p style={{ color: HEALTH_COLORS[b.classification] }} className="text-sm font-bold">{b.healthScore}</p><p className="text-[9px] text-gray-600 truncate">{b.label}</p></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {topRisk.length === 0 && <p className="px-5 py-8 text-center text-sm text-gray-500">Nenhum cliente encontrado com esses filtros.</p>}
        </div>
      </Card>

      <p className="text-[10px] text-gray-500 text-center">
        {rk.total.toLocaleString('pt-BR')} clientes pontuados · atualizado em {data.meta.generatedAt ? new Date(data.meta.generatedAt).toLocaleString('pt-BR') : '—'}
      </p>
    </div>
  )
}
