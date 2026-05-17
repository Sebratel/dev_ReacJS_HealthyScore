import { useMemo, useState, useEffect } from 'react'
import { Brain, Zap, AlertTriangle, Activity, ChevronRight, Cpu, Sparkles, Target, Radio, TrendingDown, Package, DollarSign } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, ScatterChart, Scatter, Cell } from 'recharts'
import { mockCustomers, MONTHLY_CHURN } from '@/mocks'
import { Customer } from '@/types'
import { HEALTH_COLORS, HEALTH_LABELS, HealthGauge } from '@/components/ui/HealthGauge'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { formatCurrency } from '@/utils/cn'
import { cn } from '@/utils/cn'
import { useNavigate } from 'react-router-dom'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  )
}

function TypewriterText({ text, speed = 15 }: { text: string; speed?: number }) {
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

function generateAiExplanation(customer: Customer): string {
  const hs = customer.healthScores
  const risks = customer.derivedRisks
  const s = customer.signals
  const parts: string[] = []
  if (s.relationship.cancellationThreats > 0) parts.push(`${s.relationship.cancellationThreats} ameaça(s) de cancelamento`)
  if (s.financial.overdueBills > 1) parts.push(`${s.financial.overdueBills} faturas em atraso (${s.financial.avgPaymentDelay}d)`)
  if (s.network.networkEvents30d > 5) parts.push(`${s.network.networkEvents30d} eventos de rede em 30d`)
  if (s.relationship.planDowngrade) parts.push('downgrade de plano solicitado')
  if (hs.relationship.value < 40) parts.push(`relacionamento degradado (${hs.relationship.value}/100)`)
  if (parts.length === 0) parts.push('deterioração contínua de múltiplos indicadores')
  return `Modelo detecta risco de churn de ${risks.churn.probability}% (${HEALTH_LABELS[hs.classification]}) — causas: ${parts.slice(0, 3).join('; ')}. Risco de equipamento: ${risks.equipmentReturn.probability}%. Perda anual estimada: ${formatCurrency(risks.revenueLossMonthly * 12)}.`
}

const FORECAST_DATA = MONTHLY_CHURN.slice(-6).concat([
  { month: 'Jun/25', churned: 34, newCustomers: 58, churnRate: 5.1, revenueAtRisk: 45900, recovered: 24 },
  { month: 'Jul/25', churned: 31, newCustomers: 65, churnRate: 4.7, revenueAtRisk: 41800, recovered: 27 },
  { month: 'Ago/25', churned: 28, newCustomers: 70, churnRate: 4.2, revenueAtRisk: 37800, recovered: 30 },
])

export default function AiPredictivePage() {
  const navigate = useNavigate()
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [modelRunning, setModelRunning] = useState(false)
  const [modelDone, setModelDone] = useState(false)

  const topRisk = useMemo(() =>
    mockCustomers.filter((c) => c.healthScores.classification === 'critical' || c.healthScores.classification === 'high_risk')
      .sort((a, b) => a.healthScores.overall - b.healthScores.overall).slice(0, 12),
    []
  )

  const totalLostRevenue = useMemo(() =>
    mockCustomers.reduce((a, c) => a + c.derivedRisks.revenueLossMonthly * 12, 0),
    []
  )

  const equipmentHighRisk = useMemo(() =>
    mockCustomers.filter((c) => c.derivedRisks.equipmentReturn.probability > 60).length,
    []
  )

  const autoAlerts = useMemo(() => [
    { type: 'critical', message: `${mockCustomers.filter((c) => c.healthScores.classification === 'critical').length} clientes com Health Score < 20 — deterioração severa detectada`, action: 'Ver lista', path: '/clientes' },
    { type: 'critical', message: `${mockCustomers.filter((c) => c.signals.relationship.cancellationThreats > 0).length} clientes com ameaça ativa de cancelamento — requer ação imediata`, action: 'Priorizar' },
    { type: 'high', message: `${equipmentHighRisk} clientes com risco de não devolução de equipamento > 60%`, action: 'Ver lista' },
    { type: 'medium', message: `${mockCustomers.filter((c) => c.signals.financial.brokenRenegotiations > 0).length} clientes quebraram acordos de renegociação recentemente`, action: 'Acionar cobrança' },
    { type: 'info', message: `Modelo identificou correlação: clientes com NPS < 5 + atraso > 30d têm 4x mais chance de cancelar`, action: 'Ver análise' },
  ], [equipmentHighRisk])

  const radarData = [
    { metric: 'Fin. Score', value: Math.round(mockCustomers.filter(c => c.healthScores.classification === 'critical' || c.healthScores.classification === 'high_risk').reduce((a, c) => a + c.healthScores.financial.value, 0) / Math.max(topRisk.length, 1)) },
    { metric: 'Net. Score', value: Math.round(topRisk.reduce((a, c) => a + c.healthScores.network.value, 0) / Math.max(topRisk.length, 1)) },
    { metric: 'Rel. Score', value: Math.round(topRisk.reduce((a, c) => a + c.healthScores.relationship.value, 0) / Math.max(topRisk.length, 1)) },
    { metric: 'Inst. Score', value: Math.round(topRisk.reduce((a, c) => a + c.healthScores.installation.value, 0) / Math.max(topRisk.length, 1)) },
    { metric: 'Com. Score', value: Math.round(topRisk.reduce((a, c) => a + c.healthScores.commercial.value, 0) / Math.max(topRisk.length, 1)) },
    { metric: 'Perfil', value: Math.round(topRisk.reduce((a, c) => a + c.healthScores.profile.value, 0) / Math.max(topRisk.length, 1)) },
  ]

  const runModel = () => {
    setModelRunning(true); setModelDone(false)
    setTimeout(() => { setModelRunning(false); setModelDone(true) }, 2500)
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
              <h2 className="text-base font-bold text-white">Motor de IA Preditiva — Health Score Engine</h2>
              <p className="text-sm text-gray-400 mt-0.5">6 módulos de score · 3 riscos derivados · análise multivaríavel contínua</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {[{ label: 'Acurácia', value: '89.2%' }, { label: 'AUC-ROC', value: '0.93' }, { label: 'Variáveis', value: '42' }, { label: 'Última exec.', value: 'Hoje 03:00' }].map(({ label, value }) => (
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
        <KpiCard label="Críticos (HS < 20)" value={mockCustomers.filter(c => c.healthScores.classification === 'critical').length} subtitle="Ação imediata" variant="danger" icon={<AlertTriangle size={14} />} iconColor="text-risk-critical" />
        <KpiCard label="Receita Anual em Risco" value={formatCurrency(totalLostRevenue)} subtitle="Probabilidade × MRR × 12" variant="warning" icon={<DollarSign size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Risco de Equipamento" value={equipmentHighRisk} subtitle="Probabilidade > 60%" variant="danger" icon={<Package size={14} />} iconColor="text-risk-high" />
        <KpiCard label="Alertas Automáticos" value={autoAlerts.length} subtitle="Ações recomendadas" variant="brand" icon={<Radio size={14} />} iconColor="text-brand-blue" />
      </div>

      {/* Auto alerts */}
      <Card>
        <CardHeader title="Alertas Automáticos do Modelo" subtitle="Gerados em tempo real pela engine de IA" icon={<Radio size={14} />} />
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
          <CardHeader title="Evolução + Previsão de Churn" subtitle="Histórico e projeção 3 meses" icon={<Activity size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={FORECAST_DATA} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gChurn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRecov" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="churned" name="Cancelamentos" stroke="#7c3aed" fill="url(#gChurn)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="recovered" name="Recuperados" stroke="#22d3ee" fill="url(#gRecov)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Radar de Scores" subtitle="Média dos clientes em risco" />
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

      {/* Top risk with AI explanations */}
      <Card>
        <CardHeader title="Clientes com Maior Risco — Explicação de IA" subtitle="Health Score crítico com análise automatizada por cliente" icon={<Brain size={14} />} />
        <div className="divide-y divide-app-border">
          {topRisk.map((c, i) => {
            const color = HEALTH_COLORS[c.healthScores.classification]
            const isSelected = selectedCustomer?.id === c.id
            return (
              <div key={c.id} className={cn('transition-colors', isSelected && 'bg-app-cardHover')}>
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer group" onClick={() => setSelectedCustomer(isSelected ? null : c)}>
                  <span className="text-sm font-bold text-gray-700 w-5">{i + 1}</span>

                  {/* Mini gauge */}
                  <HealthGauge score={c.healthScores.overall} size={42} showLabel={false} />

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-100 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-500">{c.city} · {c.plan}</p>
                  </div>

                  <div className="hidden sm:flex flex-col items-end">
                    <span style={{ color }} className="text-sm font-bold">{c.healthScores.overall}</span>
                    <span className="text-[9px] text-gray-600">{HEALTH_LABELS[c.healthScores.classification]}</span>
                  </div>

                  <div className="hidden md:flex flex-col items-end">
                    <span className="text-xs font-mono text-risk-critical">{c.derivedRisks.churn.probability}%</span>
                    <span className="text-[10px] text-gray-600">churn</span>
                  </div>

                  <div className="hidden lg:flex flex-col items-end">
                    <span className="text-xs font-mono text-risk-medium">{c.derivedRisks.equipmentReturn.probability}%</span>
                    <span className="text-[10px] text-gray-600">equip.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/cliente360?id=${c.id}`) }}
                      className="hidden group-hover:flex items-center gap-1 text-[10px] text-brand-blue"
                    >
                      <ChevronRight size={10} /> 360°
                    </button>
                    <ChevronRight size={12} className={cn('text-gray-600 transition-transform', isSelected && 'rotate-90')} />
                  </div>
                </div>

                {/* AI explanation panel */}
                {isSelected && (
                  <div className="mx-5 mb-3 p-3.5 rounded-lg bg-brand-violet/10 border border-brand-violet/25">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles size={10} className="text-brand-violetLight" />
                      <span className="text-[10px] font-bold text-brand-violetLight uppercase tracking-wider">Análise de IA</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed font-mono">
                      <TypewriterText text={generateAiExplanation(c)} />
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(['financial', 'network', 'relationship'] as const).map((key) => (
                        <div key={key} className="text-center">
                          <p style={{ color: HEALTH_COLORS[c.healthScores[key].classification] }} className="text-sm font-bold">{c.healthScores[key].value}</p>
                          <p className="text-[9px] text-gray-600 capitalize">{key}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {c.derivedRisks.churn.factors.map((f) => (
                        <span key={f} className="text-[10px] bg-brand-violet/15 border border-brand-violet/25 text-brand-violetLight rounded-full px-2 py-0.5">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
