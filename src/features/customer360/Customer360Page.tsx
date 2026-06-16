import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, DollarSign, Wifi, Phone, FileText, AlertTriangle,
  Wrench, Package, TrendingDown, Calendar, MapPin, User,
  ChevronDown, ChevronUp, Brain, GitBranch, Activity,
  Clock, Filter, X,
} from 'lucide-react'
import { format, subDays, isAfter } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { mockCustomers, mockPayments, mockProtocols, mockNetworkEvents, generateTimeline } from '@/mocks'
import { Customer, TimelineEvent, HealthClassification } from '@/types'
import { HealthGauge, HEALTH_COLORS, HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { ScoreModule } from '@/components/ui/ScoreModule'
import { RiskCard } from '@/components/ui/RiskCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { formatCurrency } from '@/utils/cn'
import { cn } from '@/utils/cn'

// ─── Timeline event config ────────────────────────────────────
const EV_CFG: Record<TimelineEvent['type'], { icon: any; bg: string; color: string }> = {
  contract:            { icon: FileText,      bg: 'bg-risk-low/10 border-risk-low/30',          color: 'text-risk-low' },
  payment:             { icon: DollarSign,    bg: 'bg-risk-low/10 border-risk-low/30',          color: 'text-risk-low' },
  payment_delay:       { icon: DollarSign,    bg: 'bg-risk-critical/10 border-risk-critical/30',color: 'text-risk-critical' },
  protocol:            { icon: FileText,      bg: 'bg-risk-medium/10 border-risk-medium/30',    color: 'text-risk-medium' },
  network_failure:     { icon: Wifi,          bg: 'bg-risk-high/10 border-risk-high/30',        color: 'text-risk-high' },
  massiva:             { icon: AlertTriangle, bg: 'bg-risk-critical/10 border-risk-critical/30',color: 'text-risk-critical' },
  technical_visit:     { icon: Wrench,        bg: 'bg-brand-blue/10 border-brand-blue/30',      color: 'text-brand-blue' },
  renegotiation:       { icon: DollarSign,    bg: 'bg-brand-violet/10 border-brand-violet/30',  color: 'text-brand-violet' },
  support_contact:     { icon: Phone,         bg: 'bg-gray-500/10 border-gray-500/30',          color: 'text-gray-400' },
  suspension:          { icon: AlertTriangle, bg: 'bg-risk-critical/10 border-risk-critical/30',color: 'text-risk-critical' },
  churn_risk:          { icon: TrendingDown,  bg: 'bg-risk-critical/15 border-risk-critical/40',color: 'text-risk-critical' },
  plan_change:         { icon: Package,       bg: 'bg-brand-cyan/10 border-brand-cyan/30',      color: 'text-brand-cyan' },
  cancellation_threat: { icon: AlertTriangle, bg: 'bg-risk-critical/15 border-risk-critical/40',color: 'text-risk-critical' },
  health_alert:        { icon: Brain,         bg: 'bg-brand-violet/15 border-brand-violet/40',  color: 'text-brand-violetLight' },
}

// ─── Feed event (aggregate) ───────────────────────────────────
interface FeedEvent {
  id: string
  customerId: string
  customerName: string
  classification: HealthClassification
  healthScore: number
  type: TimelineEvent['type']
  title: string
  description: string
  severity: 'danger' | 'warning' | 'info' | 'success'
  date: string
}

const SEV_ORDER = { danger: 0, warning: 1, info: 2, success: 3 }

function buildFeed(limit = 80): FeedEvent[] {
  const cutoff = subDays(new Date(), 90)
  const events: FeedEvent[] = []

  // From protocols
  mockProtocols.forEach((p) => {
    if (!isAfter(new Date(p.openDate), cutoff)) return
    const customer = mockCustomers.find((c) => c.id === p.customerId)
    if (!customer) return
    const sev: FeedEvent['severity'] =
      p.type === 'complaint' ? 'danger'
      : p.type === 'technical' && p.isRecurrent ? 'danger'
      : p.type === 'technical' ? 'warning'
      : 'info'
    events.push({
      id: `proto-${p.id}`,
      customerId: customer.id,
      customerName: customer.name,
      classification: customer.healthScores.classification,
      healthScore: customer.healthScores.overall,
      type: 'protocol',
      title: `${p.subtype}${p.isRecurrent ? ' [REINCIDENTE]' : ''}`,
      description: `${p.type === 'technical' ? 'Técnico' : p.type === 'financial' ? 'Financeiro' : p.type === 'commercial' ? 'Comercial' : 'Reclamação'} · ${customer.city}${p.technicianName ? ` · Técnico: ${p.technicianName}` : ''}`,
      severity: sev,
      date: p.openDate,
    })
  })

  // Customers with cancellation threats
  mockCustomers.forEach((c) => {
    if (c.signals.relationship.cancellationThreats > 0) {
      events.push({
        id: `threat-${c.id}`,
        customerId: c.id,
        customerName: c.name,
        classification: c.healthScores.classification,
        healthScore: c.healthScores.overall,
        type: 'cancellation_threat',
        title: `Ameaça de cancelamento (×${c.signals.relationship.cancellationThreats})`,
        description: `Health Score: ${c.healthScores.overall} · Churn: ${c.derivedRisks.churn.probability}% · ${c.plan}`,
        severity: 'danger',
        date: subDays(new Date(), Math.floor(c.churnScore / 5)).toISOString().split('T')[0],
      })
    }
    // Payment delay events
    if (c.paymentDelayDays > 30) {
      events.push({
        id: `delay-${c.id}`,
        customerId: c.id,
        customerName: c.name,
        classification: c.healthScores.classification,
        healthScore: c.healthScores.overall,
        type: 'payment_delay',
        title: `Inadimplência: ${c.paymentDelayDays} dias em atraso`,
        description: `${c.plan} · ${formatCurrency(c.monthlyValue)}/mês · ${c.city}`,
        severity: c.paymentDelayDays > 60 ? 'danger' : 'warning',
        date: subDays(new Date(), c.paymentDelayDays - 30).toISOString().split('T')[0],
      })
    }
    // Degrading health score
    if (c.healthScores.trend === 'degrading' && c.healthScores.trendValue < -10) {
      events.push({
        id: `degrade-${c.id}`,
        customerId: c.id,
        customerName: c.name,
        classification: c.healthScores.classification,
        healthScore: c.healthScores.overall,
        type: 'health_alert',
        title: `Health Score em queda: ${c.healthScores.trendValue}pts/30d`,
        description: `Score atual: ${c.healthScores.overall}/100 · Risco churn: ${c.derivedRisks.churn.probability}%`,
        severity: c.healthScores.overall < 30 ? 'danger' : 'warning',
        date: subDays(new Date(), 10).toISOString().split('T')[0],
      })
    }
  })

  return events
    .sort((a, b) => {
      const sevDiff = SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
      if (sevDiff !== 0) return sevDiff
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
    .slice(0, limit)
}

// ─── AI explanation ───────────────────────────────────────────
function generateAiInsight(customer: Customer): string {
  const parts: string[] = []
  const s = customer.signals
  const hs = customer.healthScores
  if (s.relationship.cancellationThreats > 0) parts.push(`${s.relationship.cancellationThreats} ameaça(s) de cancelamento`)
  if (s.financial.overdueBills > 1) parts.push(`${s.financial.overdueBills} faturas em atraso`)
  if (s.network.networkEvents30d > 5) parts.push(`${s.network.networkEvents30d} eventos de rede em 30d`)
  if (s.relationship.planDowngrade) parts.push('downgrade de plano detectado')
  if (hs.financial.value < 40) parts.push(`score financeiro crítico (${hs.financial.value}/100)`)
  if (hs.network.value < 40) parts.push(`rede degradada (${hs.network.value}/100)`)
  if (parts.length === 0) parts.push(`múltiplos sinais combinados (HS ${hs.overall}/100)`)
  const equipStr = customer.derivedRisks.equipmentReturn.probability > 50
    ? ` Risco de não devolução de equipamento: ${customer.derivedRisks.equipmentReturn.probability}%.` : ''
  return `Risco de churn ${customer.derivedRisks.churn.probability}% baseado em: ${parts.slice(0, 3).join('; ')}.${equipStr} Recomendação: intervenção imediata.`
}

// ─── Customer detail (header) ─────────────────────────────────
const SCORE_MODULES = [
  { key: 'financial'    as const, name: 'Financial Score',    icon: <DollarSign size={12} /> },
  { key: 'network'      as const, name: 'Network Score',      icon: <Wifi size={12} /> },
  { key: 'relationship' as const, name: 'Relationship Score', icon: <Phone size={12} /> },
  { key: 'installation' as const, name: 'Installation Score', icon: <Wrench size={12} /> },
  { key: 'commercial'   as const, name: 'Commercial Score',   icon: <TrendingDown size={12} /> },
  { key: 'profile'      as const, name: 'Customer Profile',   icon: <User size={12} /> },
]

function CustomerHeader({ customer }: { customer: Customer }) {
  const color = HEALTH_COLORS[customer.healthScores.classification]
  const label = HEALTH_LABELS[customer.healthScores.classification]
  return (
    <Card className="p-5">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl border flex items-center justify-center text-base font-bold shrink-0"
              style={{ backgroundColor: color + '15', borderColor: color + '30', color }}>
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
              { icon: MapPin,    label: 'Localização', value: `${customer.city} · ${customer.neighborhood}` },
              { icon: Package,   label: 'Plano',       value: `${customer.plan} · ${formatCurrency(customer.monthlyValue)}/mês` },
              { icon: Calendar,  label: 'Contrato',    value: `${customer.contractMonths} meses — desde ${format(new Date(customer.contractDate), 'MMM/yy', { locale: ptBR })}` },
              { icon: User,      label: 'Vendedor',    value: `${customer.sellerName} · ${customer.signals.commercial.acquisitionChannel}` },
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
          {customer.churnReasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-gray-600">Motivos:</span>
              {customer.churnReasons.map((r) => (
                <span key={r} className="text-[10px] bg-risk-critical/10 border border-risk-critical/20 text-risk-critical rounded-full px-2 py-0.5">{r}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0">
          <HealthGauge score={customer.healthScores.overall} size={150} />
          <div className="text-[11px]">
            {customer.healthScores.trend === 'degrading' && (
              <span className="text-risk-critical flex items-center gap-1"><TrendingDown size={11} /> -{Math.abs(customer.healthScores.trendValue)}pts/30d</span>
            )}
            {customer.healthScores.trend === 'improving' && (
              <span className="text-risk-low">+{Math.abs(customer.healthScores.trendValue)}pts/30d</span>
            )}
            {customer.healthScores.trend === 'stable' && <span className="text-gray-500">Estável</span>}
          </div>
        </div>
      </div>
      <div className="mt-4 p-3 rounded-lg bg-brand-violet/10 border border-brand-violet/20 flex items-start gap-2.5">
        <Brain size={14} className="text-brand-violetLight mt-0.5 shrink-0" />
        <p className="text-[11px] text-gray-300 leading-relaxed">{generateAiInsight(customer)}</p>
      </div>
    </Card>
  )
}

// ─── Per-customer timeline ────────────────────────────────────
function CustomerTimeline({ customer }: { customer: Customer }) {
  const events = useMemo(() =>
    generateTimeline(customer, mockPayments, mockProtocols, mockNetworkEvents), [customer])
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
                        ev.severity === 'danger'  ? 'bg-risk-critical/5 border-risk-critical/15 hover:border-risk-critical/30' :
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

// ─── Aggregate feed item ──────────────────────────────────────
function FeedItem({ ev, onSelect }: { ev: FeedEvent; onSelect: (id: string) => void }) {
  const cfg = EV_CFG[ev.type] ?? EV_CFG.protocol
  const Icon = cfg.icon
  const color = HEALTH_COLORS[ev.classification]
  const sevBorder =
    ev.severity === 'danger'  ? 'border-risk-critical/20 hover:border-risk-critical/40' :
    ev.severity === 'warning' ? 'border-risk-medium/20 hover:border-risk-medium/40' :
    'border-app-border hover:border-app-borderLight'
  const sevBg =
    ev.severity === 'danger'  ? 'bg-risk-critical/5' :
    ev.severity === 'warning' ? 'bg-risk-medium/5' : 'bg-app-card'

  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer', sevBg, sevBorder)}
      onClick={() => onSelect(ev.customerId)}>
      <div className={cn('w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5', cfg.bg)}>
        <Icon size={10} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-200 truncate">{ev.title}</span>
          {ev.severity === 'danger' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-risk-critical/15 text-risk-critical border border-risk-critical/20">CRÍTICO</span>
          )}
        </div>
        <button
          className="text-[10px] font-medium mt-0.5 hover:underline text-left"
          style={{ color }}
          onClick={(e) => { e.stopPropagation(); onSelect(ev.customerId) }}
        >
          {ev.customerName}
          <span className="text-gray-600 font-mono ml-1">HS {ev.healthScore}</span>
        </button>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{ev.description}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[9px] text-gray-600 font-mono">
          {format(new Date(ev.date), 'dd/MM', { locale: ptBR })}
        </p>
      </div>
    </div>
  )
}

// ─── General overview ─────────────────────────────────────────
function GeneralOverview({ onSelectCustomer }: { onSelectCustomer: (id: string) => void }) {
  const [sevFilter, setSevFilter] = useState<'all' | 'danger' | 'warning'>('all')

  const feed = useMemo(() => buildFeed(80), [])

  const criticalCount  = feed.filter((e) => e.severity === 'danger').length
  const warningCount   = feed.filter((e) => e.severity === 'warning').length
  const degradingCount = mockCustomers.filter((c) => c.healthScores.trend === 'degrading').length
  const threatCount    = mockCustomers.filter((c) => c.signals.relationship.cancellationThreats > 0).length

  const filtered = sevFilter === 'all' ? feed : feed.filter((e) => e.severity === sevFilter)

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Alertas Críticos"
          value={criticalCount}
          subtitle="Eventos de alta severidade"
          variant="danger"
          icon={<AlertTriangle size={14} />}
          iconColor="text-risk-critical"
        />
        <KpiCard
          label="Avisos Ativos"
          value={warningCount}
          subtitle="Eventos que requerem atenção"
          variant="warning"
          icon={<Clock size={14} />}
          iconColor="text-risk-medium"
        />
        <KpiCard
          label="Clientes Degradando"
          value={degradingCount}
          subtitle="Health Score em queda (30d)"
          variant={degradingCount > 100 ? 'danger' : 'warning'}
          icon={<TrendingDown size={14} />}
          iconColor="text-risk-high"
        />
        <KpiCard
          label="Ameaças de Cancelamento"
          value={threatCount}
          subtitle="Intenção declarada de cancelar"
          variant={threatCount > 30 ? 'danger' : 'warning'}
          icon={<Activity size={14} />}
          iconColor="text-risk-critical"
        />
      </div>

      {/* Feed */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-app-border">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-100">Feed de Eventos — Base Geral</h3>
            <span className="text-[10px] text-gray-600 font-mono">últimos 90d</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={10} className="text-gray-600" />
            {(['all', 'danger', 'warning'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSevFilter(s)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded border transition-all',
                  sevFilter === s
                    ? s === 'danger' ? 'bg-risk-critical/10 text-risk-critical border-risk-critical/30'
                      : s === 'warning' ? 'bg-risk-medium/10 text-risk-medium border-risk-medium/30'
                      : 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
                    : 'text-gray-500 border-app-border hover:border-app-borderLight'
                )}
              >
                {s === 'all' ? `Todos (${feed.length})` : s === 'danger' ? `Crítico (${criticalCount})` : `Aviso (${warningCount})`}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 space-y-2 max-h-[520px] overflow-y-auto scrollbar-thin">
          {filtered.map((ev) => (
            <FeedItem key={ev.id} ev={ev} onSelect={onSelectCustomer} />
          ))}
        </div>
      </Card>
    </div>
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
      mockCustomers
        .filter((c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
        .slice(0, 6)
    )
  }, [search])

  const handleSelectCustomer = (id: string) => {
    navigate(`/cliente360?id=${id}`)
    setSearch('')
    setShowSuggestions(false)
  }

  return (
    <div className="space-y-5 animate-slide-up">

      {/* Header + search */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-blue to-brand-cyan flex items-center justify-center shrink-0">
          <GitBranch size={13} className="text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-tight">Timeline Operacional</h1>
          <p className="text-[11px] text-gray-500">Jornada e alertas em tempo real — visão geral e por cliente</p>
        </div>
        <div className="flex-1" />
        {customer && (
          <button
            onClick={() => navigate('/cliente360')}
            className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-200 bg-app-card border border-app-border px-3 py-1.5 rounded-lg transition-all"
          >
            <X size={11} /> Voltar à visão geral
          </button>
        )}
      </div>

      {/* Search bar */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Search size={14} className="text-gray-500 shrink-0" />
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true) }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
              placeholder="Buscar cliente por nome, ID ou cidade para ver sua timeline..."
              className="w-full px-3 h-8 text-sm bg-app-surface border border-app-border rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-app-card border border-app-border rounded-lg shadow-xl z-50 overflow-hidden">
                {suggestions.map((c) => {
                  const color = HEALTH_COLORS[c.healthScores.classification]
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCustomer(c.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-app-surface transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ backgroundColor: color + '20', color }}>
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

      {/* General overview (no customer selected) */}
      {!customer && <GeneralOverview onSelectCustomer={handleSelectCustomer} />}

      {/* Per-customer detail */}
      {customer && (
        <>
          <CustomerHeader customer={customer} />

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Módulos de Score</h3>
              <button
                onClick={() => setScoresExpanded(!scoresExpanded)}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                {scoresExpanded ? <><ChevronUp size={12} /> Recolher</> : <><ChevronDown size={12} /> Expandir fatores</>}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SCORE_MODULES.map(({ key, name, icon }) => (
                <ScoreModule key={key} name={name} icon={icon} score={customer.healthScores[key]} expanded={scoresExpanded} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Riscos Derivados</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <RiskCard type="churn" risk={customer.derivedRisks.churn} />
              <RiskCard type="equipment" risk={customer.derivedRisks.equipmentReturn} />
              <RiskCard type="revenue" risk={customer.derivedRisks.revenueLoss} monthlyValue={customer.monthlyValue} />
            </div>
          </div>

          <CustomerTimeline customer={customer} />
        </>
      )}
    </div>
  )
}
