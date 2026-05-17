import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search, FileText, DollarSign, Wifi, AlertTriangle, Wrench, Phone, Package, TrendingDown, Calendar, User, MapPin, CreditCard, Brain } from 'lucide-react'
import { mockCustomers, mockPayments, mockProtocols, mockNetworkEvents, generateTimeline } from '@/mocks'
import { Customer, TimelineEvent } from '@/types'
import { RiskBadge, ScoreBar } from '@/components/ui/RiskBadge'
import { Card } from '@/components/ui/Card'
import { formatCurrency } from '@/utils/cn'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/utils/cn'

const EVENT_CONFIG: Record<TimelineEvent['type'], { icon: any; color: string; bg: string }> = {
  contract: { icon: FileText, color: 'text-risk-low', bg: 'bg-risk-low/10 border-risk-low/30' },
  payment: { icon: DollarSign, color: 'text-risk-low', bg: 'bg-risk-low/10 border-risk-low/30' },
  payment_delay: { icon: DollarSign, color: 'text-risk-critical', bg: 'bg-risk-critical/10 border-risk-critical/30' },
  protocol: { icon: FileText, color: 'text-risk-medium', bg: 'bg-risk-medium/10 border-risk-medium/30' },
  network_failure: { icon: Wifi, color: 'text-risk-high', bg: 'bg-risk-high/10 border-risk-high/30' },
  massiva: { icon: AlertTriangle, color: 'text-risk-critical', bg: 'bg-risk-critical/10 border-risk-critical/30' },
  technical_visit: { icon: Wrench, color: 'text-brand-blue', bg: 'bg-brand-blue/10 border-brand-blue/30' },
  renegotiation: { icon: CreditCard, color: 'text-brand-violet', bg: 'bg-brand-violet/10 border-brand-violet/30' },
  support_contact: { icon: Phone, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30' },
  suspension: { icon: AlertTriangle, color: 'text-risk-critical', bg: 'bg-risk-critical/10 border-risk-critical/30' },
  churn_risk: { icon: TrendingDown, color: 'text-risk-critical', bg: 'bg-risk-critical/20 border-risk-critical/40' },
  plan_change: { icon: Package, color: 'text-brand-cyan', bg: 'bg-brand-cyan/10 border-brand-cyan/30' },
  cancellation_threat: { icon: AlertTriangle, color: 'text-risk-critical', bg: 'bg-risk-critical/20 border-risk-critical/40' },
  health_alert: { icon: Brain, color: 'text-brand-violet', bg: 'bg-brand-violet/15 border-brand-violet/40' },
}

function CustomerCard({ customer }: { customer: Customer }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-brand flex items-center justify-center text-sm font-bold text-white shrink-0">
          {customer.name.split(' ')[0][0]}{customer.name.split(' ')[1]?.[0] ?? ''}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">{customer.name}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">{customer.id} · {customer.cpf}</p>
            </div>
            <RiskBadge level={customer.churnRisk} />
          </div>
          <div className="mt-2 w-48">
            <ScoreBar score={customer.churnScore} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-app-border">
        {[
          { icon: MapPin, label: 'Cidade', value: `${customer.city} · ${customer.neighborhood}` },
          { icon: Package, label: 'Plano', value: customer.plan },
          { icon: DollarSign, label: 'Mensalidade', value: formatCurrency(customer.monthlyValue) },
          { icon: Calendar, label: 'Contrato', value: `${customer.contractMonths} meses` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-1.5">
            <Icon size={12} className="text-gray-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500">{label}</p>
              <p className="text-[11px] text-gray-200 font-medium">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {customer.churnReasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 pt-3 border-t border-app-border">
          {customer.churnReasons.map((r) => (
            <span key={r} className="text-[10px] bg-risk-critical/10 border border-risk-critical/20 text-risk-critical rounded-full px-2 py-0.5">{r}</span>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function TimelinePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<Customer[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const customerId = searchParams.get('id')
  const customer = useMemo(() =>
    customerId ? mockCustomers.find((c) => c.id === customerId) ?? null : null,
    [customerId]
  )

  const timeline = useMemo(() => {
    if (!customer) return []
    return generateTimeline(customer, mockPayments, mockProtocols, mockNetworkEvents)
  }, [customer])

  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return }
    const q = search.toLowerCase()
    setSuggestions(
      mockCustomers.filter((c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 6)
    )
  }, [search])

  const grouped = useMemo(() => {
    const map: Record<string, TimelineEvent[]> = {}
    timeline.forEach((ev) => {
      const month = format(new Date(ev.date), 'MMMM yyyy', { locale: ptBR })
      if (!map[month]) map[month] = []
      map[month].push(ev)
    })
    return Object.entries(map).reverse()
  }, [timeline])

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Search */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <User size={14} className="text-gray-500 shrink-0" />
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true) }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Buscar cliente por nome, ID ou cidade..."
              className="w-full px-3 h-8 text-sm bg-app-surface border border-app-border rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-app-card border border-app-border rounded-lg shadow-xl z-50 overflow-hidden">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { navigate(`/timeline?id=${c.id}`); setSearch(''); setShowSuggestions(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-app-surface transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-full bg-app-surface border border-app-border flex items-center justify-center text-[9px] font-bold text-gray-300">
                      {c.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-200 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-500">{c.id} · {c.city}</p>
                    </div>
                    <RiskBadge level={c.churnRisk} score={c.churnScore} size="sm" />
                  </button>
                ))}
              </div>
            )}
          </div>
          {!customer && (
            <button
              onClick={() => { const r = mockCustomers.find((c) => c.churnRisk === 'critical'); if (r) navigate(`/timeline?id=${r.id}`) }}
              className="whitespace-nowrap text-[11px] text-brand-blue hover:text-brand-blueLight transition-colors"
            >
              Ver exemplo crítico →
            </button>
          )}
        </div>
      </Card>

      {!customer && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search size={40} className="text-gray-700 mb-4" />
          <p className="text-gray-400 font-medium">Selecione um cliente para ver a timeline</p>
          <p className="text-sm text-gray-600 mt-1">Prontuário inteligente com histórico completo</p>
        </div>
      )}

      {customer && (
        <>
          <CustomerCard customer={customer} />

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200">Timeline do Cliente</h2>
            <span className="text-[11px] text-gray-500">{timeline.length} eventos registrados</span>
          </div>

          <div className="space-y-6">
            {grouped.map(([month, events]) => (
              <div key={month}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{month}</span>
                  <div className="flex-1 h-px bg-app-border" />
                  <span className="text-[10px] text-gray-600">{events.length} eventos</span>
                </div>

                <div className="relative ml-3">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-app-border" />
                  <div className="space-y-2">
                    {events.map((ev) => {
                      const cfg = EVENT_CONFIG[ev.type]
                      const Icon = cfg.icon
                      return (
                        <div key={ev.id} className="relative flex items-start gap-3 pl-8">
                          <div className={cn('absolute left-0 w-6 h-6 rounded-full border flex items-center justify-center shrink-0', cfg.bg)}>
                            <Icon size={10} className={cfg.color} />
                          </div>
                          <div className={cn('flex-1 p-3 rounded-lg border transition-all hover:border-app-borderLight', ev.severity === 'danger' ? 'bg-risk-critical/5 border-risk-critical/15' : ev.severity === 'warning' ? 'bg-risk-medium/5 border-risk-medium/15' : ev.severity === 'success' ? 'bg-risk-low/5 border-risk-low/15' : 'bg-app-card border-app-border')}>
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
        </>
      )}
    </div>
  )
}
