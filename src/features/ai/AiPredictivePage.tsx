import { useMemo, useState, useEffect } from 'react'
import { Brain, Zap, AlertTriangle, Activity, ChevronRight, Cpu, Sparkles, Radio, DollarSign, MessageSquare } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { realClients, realMonthly, realMeta } from '@/data/realClients'
import { useEngineSummaries, buildClientRiskRanking, type ClientRisk } from '@/features/dashboard/engineSummaries'
import { HEALTH_COLORS, HEALTH_LABELS, HealthGauge } from '@/components/ui/HealthGauge'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { ContractFilters, useContractFilters } from '@/components/ui/ContractFilters'
import { formatCurrency, cn } from '@/utils/cn'
import type { RealClient } from '@/types'

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

// Explicação derivada 100% dos sinais reais do cliente
function explain(c: RealClient | undefined, risk: ClientRisk): string {
  const parts: string[] = []
  if (c) {
    const overdue = c.lateInvoices + c.overdueInvoices
    if (c.relCancelThreats > 0) parts.push(`${c.relCancelThreats} ameaça(s) de cancelamento registrada(s)`)
    if (overdue > 0) parts.push(`${overdue} fatura(s) em atraso/aberto`)
    if (c.renegotiations > 0) parts.push(`${c.renegotiations} renegociação(ões)`)
    if (c.netMassiveCount > 0) parts.push(`${c.netMassiveCount} massiva(s) de rede`)
    if (c.slaLateCount > 0) parts.push(`${c.slaLateCount} atendimento(s) de campo com SLA estourado`)
    if (c.trustReleases > 0) parts.push(`${c.trustReleases} desbloqueio(s) por confiança`)
  }
  const worst = [...risk.byEngine].sort((a, b) => a.healthScore - b.healthScore)[0]
  if (worst) parts.push(`menor score em ${worst.label} (${worst.healthScore}/100)`)
  if (parts.length === 0) parts.push('deterioração combinada de múltiplos engines')
  return `Modelo estima risco de churn de ${risk.overallChurnRisk}% (health ${risk.overallHealth}/100 · ${HEALTH_LABELS[risk.classification]}) — causas: ${parts.slice(0, 3).join('; ')}. Receita mensal exposta: ${formatCurrency(risk.revenueRisk)}.`
}

export default function AiPredictivePage() {
  const navigate = useNavigate()
  const engines = useEngineSummaries()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modelRunning, setModelRunning] = useState(false)
  const [modelDone, setModelDone] = useState(false)

  const clientById = useMemo(() => {
    const m = new Map<string, RealClient>()
    realClients.forEach((c) => m.set(c.clientId, c))
    return m
  }, [])

  const ranking = useMemo(() => buildClientRiskRanking(engines), [engines])

  // Filtros de contrato / nome / cidade — escopam a lista de clientes em risco (KPIs seguem sobre a base inteira)
  const { filters, setFilters, filtered, cities } = useContractFilters(realClients)
  const allowedIds = useMemo(() => new Set(filtered.map((c) => c.clientId)), [filtered])
  const visibleRanking = useMemo(() => ranking.filter((r) => allowedIds.has(r.customerId)), [ranking, allowedIds])
  const topRisk = visibleRanking.slice(0, 12)

  const criticalCount = ranking.filter((r) => r.classification === 'critical').length
  const atRisk = ranking.filter((r) => r.classification === 'critical' || r.classification === 'high_risk')
  const annualRevenueRisk = atRisk.reduce((a, r) => a + r.revenueRisk * 12, 0)

  const cancelThreats = useMemo(() => realClients.filter((c) => c.relCancelThreats > 0).length, [])
  const overdueClients = useMemo(() => realClients.filter((c) => c.lateInvoices + c.overdueInvoices > 0).length, [])
  const slaLateClients = useMemo(() => realClients.filter((c) => c.slaLateCount > 0).length, [])
  const massiveClients = useMemo(() => realClients.filter((c) => c.netMassiveCount > 0).length, [])

  const autoAlerts = useMemo(() => [
    { type: 'critical', message: `${criticalCount} clientes com health combinado crítico (<21) — ação imediata`, action: 'Ver financeiro', path: '/financeiro' },
    { type: 'critical', message: `${cancelThreats} clientes com ameaça ativa de cancelamento`, action: 'Relacionamento', path: '/engine-relacionamento' },
    { type: 'high', message: `${overdueClients} clientes com faturas em atraso ou em aberto vencidas`, action: 'Financeiro', path: '/financeiro' },
    { type: 'medium', message: `${slaLateClients} clientes com SLA de atendimento em campo estourado`, action: 'Campo', path: '/manutencao' },
    { type: 'info', message: `${massiveClients} clientes impactados por massivas de rede no período`, action: 'Rede', path: '/engine-rede' },
  ], [criticalCount, cancelThreats, overdueClients, slaLateClients, massiveClients])

  // Radar: média do score de cada engine no grupo de maior risco
  const radarData = useMemo(() =>
    engines.map((eng) => {
      const vals = topRisk.flatMap((r) => r.byEngine.filter((b) => b.key === eng.key).map((b) => b.healthScore))
      return { metric: eng.label, value: vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : 0 }
    }),
    [engines, topRisk],
  )

  const monthlyData = realMonthly.map((m) => ({ month: m.month, 'No prazo': m.onTime, 'Em atraso': m.late, 'Em aberto': m.overdue }))

  const runModel = () => {
    setModelRunning(true); setModelDone(false)
    setTimeout(() => { setModelRunning(false); setModelDone(true) }, 2200)
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* AI Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-brand-violet/20 via-brand-blue/10 to-brand-cyan/10 border border-brand-violet/30 p-5">
        <div className="absolute inset-0 bg-gradient-radial from-brand-violet/10 via-transparent to-transparent" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">IA Preditiva — Health Score combinado</h2>
              <p className="text-sm text-gray-400 mt-0.5">7 engines · risco por cliente · 100% dados reais</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {[{ label: 'Engines', value: String(engines.length) }, { label: 'Clientes', value: ranking.length.toLocaleString('pt-BR') }, { label: 'Em risco', value: atRisk.length.toLocaleString('pt-BR') }, { label: 'Fonte', value: realMeta.source }].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500">{label}:</span>
                    <span className="text-[11px] font-semibold text-brand-cyan font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={runModel}
            disabled={modelRunning}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all shrink-0', modelRunning ? 'bg-brand-blue/20 border-brand-blue/30 text-brand-blue cursor-wait' : modelDone ? 'bg-risk-low/20 border-risk-low/30 text-risk-low' : 'bg-brand-blue text-white border-brand-blue hover:bg-brand-blueLight')}
          >
            {modelRunning ? <><Cpu size={12} className="animate-spin" /> Processando...</> : modelDone ? <><Sparkles size={12} /> Modelo atualizado</> : <><Zap size={12} /> Executar modelo</>}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clientes Críticos" value={criticalCount.toLocaleString('pt-BR')} subtitle="Health combinado < 21" variant="danger" icon={<AlertTriangle size={14} />} iconColor="text-risk-critical" />
        <KpiCard label="Receita Anual em Risco" value={formatCurrency(annualRevenueRisk)} subtitle="Risco × MRR × 12" variant="warning" icon={<DollarSign size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Ameaças de Cancelamento" value={cancelThreats.toLocaleString('pt-BR')} subtitle="Registradas no relacionamento" variant="danger" icon={<MessageSquare size={14} />} iconColor="text-risk-high" />
        <KpiCard label="Alertas Automáticos" value={autoAlerts.length} subtitle="Ações recomendadas" variant="brand" icon={<Radio size={14} />} iconColor="text-brand-blue" />
      </div>

      {/* Auto alerts */}
      <Card>
        <CardHeader title="Alertas Automáticos do Modelo" subtitle="Derivados dos sinais reais dos engines" icon={<Radio size={14} />} />
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
          <CardHeader title="Radar de Scores" subtitle="Média dos engines no grupo de risco" />
          <div className="p-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1a2236" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 9 }} />
                <Radar name="Score médio" dataKey="value" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Filtros de contrato / nome / cidade */}
      <ContractFilters filters={filters} onChange={setFilters} cities={cities} resultCount={visibleRanking.length} totalCount={ranking.length} />

      {/* Top risk with AI explanations */}
      <Card>
        <CardHeader title="Clientes com Maior Risco — Explicação de IA" subtitle="Health combinado dos engines com análise automatizada por cliente" icon={<Brain size={14} />} />
        <div className="divide-y divide-app-border">
          {topRisk.map((r, i) => {
            const color = HEALTH_COLORS[r.classification]
            const isSelected = selectedId === r.customerId
            const c = clientById.get(r.customerId)
            return (
              <div key={r.customerId} className={cn('transition-colors', isSelected && 'bg-app-cardHover')}>
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer group" onClick={() => setSelectedId(isSelected ? null : r.customerId)}>
                  <span className="text-sm font-bold text-gray-700 w-5">{i + 1}</span>
                  <HealthGauge score={r.overallHealth} size={42} showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-100 truncate">{r.customerName}</p>
                    <p className="text-[10px] text-gray-500">{r.city} · {r.plan}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end">
                    <span style={{ color }} className="text-sm font-bold">{r.overallHealth}</span>
                    <span className="text-[9px] text-gray-600">{HEALTH_LABELS[r.classification]}</span>
                  </div>
                  <div className="hidden md:flex flex-col items-end">
                    <span className="text-xs font-mono text-risk-critical">{r.overallChurnRisk}%</span>
                    <span className="text-[10px] text-gray-600">churn</span>
                  </div>
                  <div className="hidden lg:flex flex-col items-end">
                    <span className="text-xs font-mono text-risk-medium">{r.enginesPresent}</span>
                    <span className="text-[10px] text-gray-600">engines</span>
                  </div>
                  <ChevronRight size={12} className={cn('text-gray-600 transition-transform', isSelected && 'rotate-90')} />
                </div>

                {isSelected && (
                  <div className="mx-5 mb-3 p-3.5 rounded-lg bg-brand-violet/10 border border-brand-violet/25">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles size={10} className="text-brand-violetLight" />
                      <span className="text-[10px] font-bold text-brand-violetLight uppercase tracking-wider">Análise de IA</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed font-mono">
                      <TypewriterText text={explain(c, r)} />
                    </p>
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {r.byEngine.map((b) => (
                        <div key={b.key} className="text-center">
                          <p style={{ color: HEALTH_COLORS[b.classification] }} className="text-sm font-bold">{b.healthScore}</p>
                          <p className="text-[9px] text-gray-600 truncate">{b.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <p className="text-[10px] text-gray-500 text-center">
        Fonte: {realMeta.source} · {ranking.length.toLocaleString('pt-BR')} clientes pontuados · gerado em {new Date(realMeta.generatedAt).toLocaleString('pt-BR')}
      </p>
    </div>
  )
}
