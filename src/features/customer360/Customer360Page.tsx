import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, DollarSign, Wifi, Phone, FileText, AlertTriangle,
  Wrench, Package, TrendingDown, Calendar, MapPin, User,
  ChevronDown, ChevronUp, Brain, GitBranch,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { mockCustomers, mockPayments, mockProtocols, mockNetworkEvents, generateTimeline } from '@/mocks'
import { Customer, TimelineEvent } from '@/types'
import { HealthGauge, HEALTH_COLORS, HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { ScoreModule } from '@/components/ui/ScoreModule'
import { RiskCard } from '@/components/ui/RiskCard'
import { Card } from '@/components/ui/Card'
import { formatCurrency } from '@/utils/cn'
import { cn } from '@/utils/cn'

// ─── Score module icon map ────────────────────────────────────
const SCORE_MODULES = [
  { key: 'financial' as const, name: 'Financial Score', icon: <DollarSign size={12} /> },
  { key: 'network' as const, name: 'Network Score', icon: <Wifi size={12} /> },
  { key: 'relationship' as const, name: 'Relationship Score', icon: <Phone size={12} /> },
  { key: 'installation' as const, name: 'Installation Score', icon: <Wrench size={12} /> },
  { key: 'commercial' as const, name: 'Commercial Score', icon: <TrendingDown size={12} /> },
  { key: 'profile' as const, name: 'Customer Profile', icon: <User size={12} /> },
]

// ─── Timeline event config ────────────────────────────────────
const EV_CFG: Record<TimelineEvent['type'], { icon: any; bg: string; color: string }> = {
  contract: { icon: FileText, bg: 'bg-risk-low/10 border-risk-low/30', color: 'text-risk-low' },
  payment: { icon: DollarSign, bg: 'bg-risk-low/10 border-risk-low/30', color: 'text-risk-low' },
  payment_delay: { icon: DollarSign, bg: 'bg-risk-critical/10 border-risk-critical/30', color: 'text-risk-critical' },
  protocol: { icon: FileText, bg: 'bg-risk-medium/10 border-risk-medium/30', color: 'text-risk-medium' },
  network_failure: { icon: Wifi, bg: 'bg-risk-high/10 border-risk-high/30', color: 'text-risk-high' },
  massiva: { icon: AlertTriangle, bg: 'bg-risk-critical/10 border-risk-critical/30', color: 'text-risk-critical' },
  technical_visit: { icon: Wrench, bg: 'bg-brand-blue/10 border-brand-blue/30', color: 'text-brand-blue' },
  renegotiation: { icon: DollarSign, bg: 'bg-brand-violet/10 border-brand-violet/30', color: 'text-brand-violet' },
  support_contact: { icon: Phone, bg: 'bg-gray-500/10 border-gray-500/30', color: 'text-gray-400' },
  suspension: { icon: AlertTriangle, bg: 'bg-risk-critical/10 border-risk-critical/30', color: 'text-risk-critical' },
  churn_risk: { icon: TrendingDown, bg: 'bg-risk-critical/15 border-risk-critical/40', color: 'text-risk-critical' },
  plan_change: { icon: Package, bg: 'bg-brand-cyan/10 border-brand-cyan/30', color: 'text-brand-cyan' },
  cancellation_threat: { icon: AlertTriangle, bg: 'bg-risk-critical/15 border-risk-critical/40', color: 'text-risk-critical' },
  health_alert: { icon: Brain, bg: 'bg-brand-violet/15 border-brand-violet/40', color: 'text-brand-violetLight' },
}

// ─── AI explanation generator ─────────────────────────────────
function generateAiInsight(customer: Customer): string {
  const parts: string[] = []
  const s = customer.signals
  const hs = customer.healthScores

  if (s.relationship.cancellationThreats > 0) parts.push(`${s.relationship.cancellationThreats} ameaça(s) de cancelamento registrada(s)`)
  if (s.financial.overdueBills > 1) parts.push(`${s.financial.overdueBills} faturas consecutivas em atraso`)
  if (s.network.networkEvents30d > 5) parts.push(`${s.network.networkEvents30d} eventos de instabilidade de rede em 30 dias`)
  if (s.relationship.planDowngrade) parts.push('solicitação de downgrade de plano detectada')
  if (hs.financial.value < 40) parts.push(`score financeiro crítico de ${hs.financial.value}/100`)
  if (hs.network.value < 40) parts.push(`qualidade de rede degradada (${hs.network.value}/100)`)
  if (parts.length === 0) parts.push(`múltiplos sinais de deterioração combinados (health score ${hs.overall}/100)`)

  const equipStr = customer.derivedRisks.equipmentReturn.probability > 50
    ? ` Risco de não devolução de equipamento: ${customer.derivedRisks.equipmentReturn.probability}%.`
    : ''

  return `Sistema detectou risco de churn (${customer.derivedRisks.churn.probability}%) baseado em: ${parts.slice(0, 3).join('; ')}.${equipStr} Recomendação: intervenção imediata da equipe de retenção.`
}

// ─── Customer header ──────────────────────────────────────────
function CustomerHeader({ customer }: { customer: Customer }) {
  const color = HEALTH_COLORS[customer.healthScores.classification]
  const label = HEALTH_LABELS[customer.healthScores.classification]

  return (
    <Card className="p-5">
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left: info */}
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl border flex items-center justify-center text-base font-bold shrink-0" style={{ backgroundColor: color + '15', borderColor: color + '30', color }}>
              {customer.name.split(' ')[0][0]}{customer.name.split(' ')[1]?.[0] ?? ''}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white">{customer.name}</h2>
                <span className="text-[10px] text-gray-600 font-mono border border-app-border rounded px-1.5 py-0.5">{customer.id}</span>
                <span className="text-[10px] font-semibold border rounded-full px-2 py-0.5" style={{ color, borderColor: color + '40', backgroundColor: color + '12' }}>{label}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{customer.cpf} · {customer.phone} · {customer.email}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: MapPin, label: 'Localização', value: `${customer.city} · ${customer.neighborhood}` },
              { icon: Package, label: 'Plano', value: `${customer.plan} · ${formatCurrency(customer.monthlyValue)}/mês` },
              { icon: Calendar, label: 'Contrato', value: `${customer.contractMonths} meses — desde ${format(new Date(customer.contractDate), 'MMM/yy', { locale: ptBR })}` },
              { icon: User, label: 'Vendedor', value: `${customer.sellerName} · ${customer.signals.commercial.acquisitionChannel}` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-1.5">
                <Icon size={12} className="text-gray-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</p>
                  <p className="text-[11px] text-gray-200 font-medium leading-tight">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Churn reasons */}
          {customer.churnReasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-gray-600">Motivos:</span>
              {customer.churnReasons.map((r) => (
                <span key={r} className="text-[10px] bg-risk-critical/10 border border-risk-critical/20 text-risk-critical rounded-full px-2 py-0.5">{r}</span>
              ))}
            </div>
          )}
        </div>

        {/* Right: health gauge */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <HealthGauge score={customer.healthScores.overall} size={150} />
          <div className="flex items-center gap-3 text-[11px]">
            {customer.healthScores.trend === 'degrading' && (
              <span className="text-risk-critical flex items-center gap-1">
                <TrendingDown size={11} /> -{Math.abs(customer.healthScores.trendValue)}pts/30d
              </span>
            )}
            {customer.healthScores.trend === 'improving' && (
              <span className="text-risk-low">+{Math.abs(customer.healthScores.trendValue)}pts/30d</span>
            )}
            {customer.healthScores.trend === 'stable' && (
              <span className="text-gray-500">Estável</span>
            )}
          </div>
        </div>
      </div>

      {/* AI insight */}
      <div className="mt-4 p-3 rounded-lg bg-brand-violet/10 border border-brand-violet/20 flex items-start gap-2.5">
        <Brain size={14} className="text-brand-violetLight mt-0.5 shrink-0" />
        <p className="text-[11px] text-gray-300 leading-relaxed">{generateAiInsight(customer)}</p>
      </div>
    </Card>
  )
}

// ─── Timeline ─────────────────────────────────────────────────
function Timeline({ customer }: { customer: Customer }) {
  const events = useMemo(() =>
    generateTimeline(customer, mockPayments, mockProtocols, mockNetworkEvents),
    [customer]
  )

  const grouped = useMemo(() => {
    const map: Record<string, TimelineEvent[]> = {}
    events.forEach((ev) => {
      const month = format(new Date(ev.date), 'MMMM yyyy', { locale: ptBR })
      if (!map[month]) map[month] = []
      map[month].push(ev)
    })
    return Object.entries(map).reverse()
  }, [events])

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-app-border">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-100">Timeline — Prontuário Operacional</h3>
        </div>
        <span className="text-[11px] text-gray-500">{events.length} eventos</span>
      </div>

      <div className="p-5 space-y-6 max-h-[560px] overflow-y-auto scrollbar-thin">
        {grouped.map(([month, evs]) => (
          <div key={month}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{month}</span>
              <div className="flex-1 h-px bg-app-border" />
            </div>
            <div className="relative ml-3">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-app-border" />
              <div className="space-y-2">
                {evs.map((ev) => {
                  const cfg = EV_CFG[ev.type] ?? EV_CFG.protocol
                  const Icon = cfg.icon
                  return (
                    <div key={ev.id} className="relative flex items-start gap-3 pl-8">
                      <div className={cn('absolute left-0 w-6 h-6 rounded-full border flex items-center justify-center shrink-0', cfg.bg)}>
                        <Icon size={10} className={cfg.color} />
                      </div>
                      <div className={cn(
                        'flex-1 p-3 rounded-lg border transition-all',
                        ev.severity === 'danger' ? 'bg-risk-critical/5 border-risk-critical/15 hover:border-risk-critical/30' :
                        ev.severity === 'warning' ? 'bg-risk-medium/5 border-risk-medium/15 hover:border-risk-medium/30' :
                        ev.severity === 'success' ? 'bg-risk-low/5 border-risk-low/15 hover:border-risk-low/30' :
                        'bg-app-card border-app-border hover:border-app-borderLight'
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-100">{ev.title}</p>
                          <span className="text-[10px] text-gray-600 font-mono shrink-0">
                            {format(new Date(ev.date), 'dd/MM/yy', { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{ev.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function Customer360Page() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<Customer[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [scoresExpanded, setScoresExpanded] = useState(false)

  const customerId = searchParams.get('id')
  const customer = useMemo(() =>
    customerId ? mockCustomers.find((c) => c.id === customerId) ?? null : null,
    [customerId]
  )

  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return }
    const q = search.toLowerCase()
    setSuggestions(
      mockCustomers.filter((c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 6)
    )
  }, [search])

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Search bar */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Search size={14} className="text-gray-500 shrink-0" />
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true) }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
              placeholder="Buscar cliente por nome, ID ou cidade..."
              className="w-full px-3 h-8 text-sm bg-app-surface border border-app-border rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-app-card border border-app-border rounded-lg shadow-xl z-50 overflow-hidden">
                {suggestions.map((c) => {
                  const color = HEALTH_COLORS[c.healthScores.classification]
                  return (
                    <button
                      key={c.id}
                      onClick={() => { navigate(`/cliente360?id=${c.id}`); setSearch(''); setShowSuggestions(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-app-surface transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: color + '20', color }}>
                        {c.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate">{c.name}</p>
                        <p className="text-[10px] text-gray-500">{c.id} · {c.city}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color }} className="text-sm font-bold">{c.healthScores.overall}</span>
                        <span className="text-[10px] text-gray-600">HS</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {!customer && (
            <button
              onClick={() => { const r = mockCustomers.find((c) => c.healthScores.classification === 'critical'); if (r) navigate(`/cliente360?id=${r.id}`) }}
              className="whitespace-nowrap text-[11px] text-brand-blue hover:text-brand-blueLight transition-colors"
            >
              Ver crítico →
            </button>
          )}
        </div>
      </Card>

      {!customer && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-4">
            <Brain size={28} className="text-gray-600" />
          </div>
          <p className="text-gray-400 font-semibold">Análise 360° do Cliente</p>
          <p className="text-sm text-gray-600 mt-1">Health Score · 6 Módulos · 3 Riscos · Timeline</p>
        </div>
      )}

      {customer && (
        <>
          {/* Customer header with gauge */}
          <CustomerHeader customer={customer} />

          {/* 6 score modules */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Módulos de Score Secundário</h3>
              <button
                onClick={() => setScoresExpanded(!scoresExpanded)}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                {scoresExpanded ? <><ChevronUp size={12} /> Recolher fatores</> : <><ChevronDown size={12} /> Expandir fatores</>}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SCORE_MODULES.map(({ key, name, icon }) => (
                <ScoreModule
                  key={key}
                  name={name}
                  icon={icon}
                  score={customer.healthScores[key]}
                  expanded={scoresExpanded}
                />
              ))}
            </div>
          </div>

          {/* 3 derived risks */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Riscos Derivados</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <RiskCard type="churn" risk={customer.derivedRisks.churn} />
              <RiskCard type="equipment" risk={customer.derivedRisks.equipmentReturn} />
              <RiskCard type="revenue" risk={customer.derivedRisks.revenueLoss} monthlyValue={customer.monthlyValue} />
            </div>
          </div>

          {/* Timeline */}
          <Timeline customer={customer} />
        </>
      )}
    </div>
  )
}
