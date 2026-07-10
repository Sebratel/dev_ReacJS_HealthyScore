import { useEffect, useMemo, useState } from 'react'
import {
  UserMinus, Search, FileText, MapPin, X, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Lock, RefreshCw, DollarSign, Wrench, PackageOpen,
  MessageSquare, Router, CalendarX,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn, formatCurrency } from '@/utils/cn'
import { fetchCancelledClients, ApiError, type CancelledClient, type CancelledClientsResult } from './suggestionsApi'

const PAGE_SIZE = 15

const fmtDateBR = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Tempo de contrato (meses) entre a assinatura e o cancelamento.
function contractMonths(c: CancelledClient): number | null {
  if (!c.contractDate || !c.cancellationDate) return null
  const a = new Date(c.contractDate).getTime(), b = new Date(c.cancellationDate).getTime()
  if (isNaN(a) || isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / (30.44 * 86400000)))
}

// ─── Blocos do perfil compacto ─────────────────────────────────
function Stat({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-app-surface/60 border border-app-border px-2.5 py-1.5 min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-gray-500 truncate">{label}</p>
      <p className={cn('text-xs font-mono font-semibold mt-0.5 truncate', danger ? 'text-risk-critical' : 'text-gray-200')}>{value}</p>
    </div>
  )
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-[10px] text-gray-600">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 8).map((t) => (
        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-app-surface border border-app-border text-gray-400 truncate max-w-[180px]" title={t}>{t}</span>
      ))}
      {items.length > 8 && <span className="text-[10px] text-gray-600">+{items.length - 8}</span>}
    </div>
  )
}

function ProfileGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-app-card border border-app-border p-3">
      <div className="flex items-center gap-1.5 mb-2 text-gray-300">
        <span className="text-brand-blue">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  )
}

// Perfil compacto do cliente cancelado — todos os sinais que temos na base.
function CancelledProfile({ c }: { c: CancelledClient }) {
  const months = contractMonths(c)
  const overdue = c.lateInvoices + c.overdueInvoices
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <ProfileGroup icon={<FileText size={12} />} title="Contrato">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Contrato" value={c.contractNumber || '—'} />
          <Stat label="Mensalidade" value={formatCurrency(c.monthlyValue)} />
          <Stat label="Contratado em" value={fmtDateBR(c.contractDate)} />
          <Stat label="Cancelado em" value={fmtDateBR(c.cancellationDate)} danger />
          <Stat label="Tempo de contrato" value={months === null ? '—' : `${months} meses`} />
          <Stat label="Forma pagamento" value={c.paymentForm} />
          <Stat label="Plano" value={c.plan} />
          <Stat label="Vendedor" value={c.seller} />
        </div>
      </ProfileGroup>

      <ProfileGroup icon={<DollarSign size={12} />} title="Financeiro">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Faturas no prazo" value={c.onTimeInvoices} />
          <Stat label="Em atraso / abertas" value={overdue} danger={overdue > 0} />
          <Stat label="Total de faturas" value={c.totalInvoices} />
          <Stat label="Renegociações" value={c.renegotiations} danger={c.renegotiations > 0} />
          <Stat label="Desbloq. confiança" value={c.trustReleases} danger={c.trustReleases > 0} />
        </div>
      </ProfileGroup>

      <ProfileGroup icon={<MessageSquare size={12} />} title="Relacionamento">
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <Stat label="Protocolos" value={c.relProtocolCount} />
          <Stat label="Ameaças de cancel." value={c.relCancelThreats} danger={c.relCancelThreats > 0} />
          <Stat label="Recorrência (dias)" value={c.relRecurrenceDays || '—'} />
          <Stat label="Excedente SLA (h)" value={c.relAvgOverageHours || '—'} />
        </div>
        <Chips items={c.relTypes} />
      </ProfileGroup>

      <ProfileGroup icon={<Wrench size={12} />} title="Manutenção">
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <Stat label="Protocolos" value={c.protocolCount} />
          <Stat label="Agendamentos" value={c.scheduleCount} />
          <Stat label="SLA estourado" value={c.slaLateCount} danger={c.slaLateCount > 0} />
          <Stat label="SLA médio (dias)" value={c.avgSlaDays || '—'} />
        </div>
        <Chips items={c.reasons} />
      </ProfileGroup>

      <ProfileGroup icon={<PackageOpen size={12} />} title="Instalação">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Protocolos" value={c.installProtocols} />
          <Stat label="Agendamentos" value={c.installScheduleCount} />
          <Stat label="SLA estourado" value={c.installSlaLateCount} danger={c.installSlaLateCount > 0} />
          <Stat label="Venda→agenda (dias)" value={c.installSaleToScheduleDays || '—'} />
        </div>
      </ProfileGroup>

      <ProfileGroup icon={<Router size={12} />} title="Equipamentos">
        <Chips items={c.equipment} />
      </ProfileGroup>
    </div>
  )
}

// ─── Linha da tabela (expansível) ──────────────────────────────
function Row({ c }: { c: CancelledClient }) {
  const [open, setOpen] = useState(false)
  const overdue = c.lateInvoices + c.overdueInvoices
  const months = contractMonths(c)
  return (
    <>
      <tr className="border-b border-app-border hover:bg-app-surface/70 cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-risk-critical/15 text-risk-critical">{c.name[0]}</div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate max-w-[180px]">{c.name}</p>
              <p className="text-[10px] text-gray-500 font-mono">{c.contractNumber || c.clientId}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-400">{c.city}</td>
        <td className="px-4 py-2.5 text-xs text-gray-400 truncate max-w-[140px]">{c.plan}</td>
        <td className="px-4 py-2.5 text-xs font-mono text-gray-300 text-right">{formatCurrency(c.monthlyValue)}</td>
        <td className="px-4 py-2.5 text-xs font-mono text-risk-critical">{fmtDateBR(c.cancellationDate)}</td>
        <td className="px-4 py-2.5 text-xs font-mono text-gray-400 text-right hidden sm:table-cell">{months === null ? '—' : `${months}m`}</td>
        <td className="px-4 py-2.5 text-[10px] font-mono hidden md:table-cell">
          <span className={overdue > 0 ? 'text-risk-critical' : 'text-gray-600'}>{overdue} fat. atr.</span>
          <span className="text-gray-600"> · </span>
          <span className={c.relCancelThreats > 0 ? 'text-risk-high' : 'text-gray-600'}>{c.relCancelThreats} ameaça(s)</span>
        </td>
        <td className="px-4 py-2.5 text-gray-500">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-surface/40">
          <td colSpan={8} className="px-5 py-4"><CancelledProfile c={c} /></td>
        </tr>
      )}
    </>
  )
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: CancelledClientsResult }

// ─── Painel ────────────────────────────────────────────────────
export default function CancelledClientsPanel() {
  const [contract, setContract] = useState('')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [page, setPage] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // Mantém a última lista de cidades — o dropdown não pisca durante o loading.
  const [cities, setCities] = useState<string[]>([])

  // Debounce dos filtros de texto (400ms) — cada tecla não vira request.
  const [debounced, setDebounced] = useState({ contract: '', name: '' })
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ contract, name }), 400)
    return () => clearTimeout(t)
  }, [contract, name])
  useEffect(() => { setPage(0) }, [debounced, city])

  useEffect(() => {
    let alive = true
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }))
    fetchCancelledClients({ contract: debounced.contract, name: debounced.name, city, page, pageSize: PAGE_SIZE })
      .then((data) => { if (!alive) return; setState({ status: 'ready', data }); setCities(data.cities) })
      .catch((e) => { if (!alive) return; setState({ status: 'error', error: e instanceof ApiError ? e : new ApiError(0, 'Erro inesperado.') }) })
    return () => { alive = false }
  }, [debounced, city, page])

  const data = state.status === 'ready' ? state.data : null
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const hasFilter = !!(contract || name || city)
  const clearFilters = () => { setContract(''); setName(''); setCity('') }

  const windowLabel = useMemo(() => {
    const w = data?.materializedWindow
    return w ? `${fmtDateBR(w.from)} – ${fmtDateBR(w.to)}` : ''
  }, [data])

  return (
    <Card className="shadow-card-md">
      <CardHeader
        title="Perfil dos Clientes Cancelados"
        subtitle={data ? `${data.total.toLocaleString('pt-BR')} cancelamentos${windowLabel ? ` · ${windowLabel}` : ''}` : 'Quem cancelou e com quais sinais'}
        icon={<UserMinus size={14} />}
      />

      {/* Filtros */}
      <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex items-center">
          <FileText size={12} className="absolute left-2.5 text-gray-500 pointer-events-none" />
          <input value={contract} onChange={(e) => setContract(e.target.value)} placeholder="Contrato (nº / id)"
            className="pl-7 pr-2.5 h-8 w-40 text-xs bg-app-surface border border-app-border rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all" />
        </div>
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2.5 text-gray-500 pointer-events-none" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente"
            className="pl-7 pr-2.5 h-8 w-48 text-xs bg-app-surface border border-app-border rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all" />
        </div>
        <div className="relative flex items-center">
          <MapPin size={12} className="absolute left-2.5 text-gray-500 pointer-events-none z-10" />
          <select value={city} onChange={(e) => setCity(e.target.value)}
            className="pl-7 pr-7 h-8 w-44 text-xs bg-app-surface border border-app-border rounded-lg text-gray-300 focus:outline-none focus:border-brand-blue/50 transition-all appearance-none cursor-pointer">
            <option value="">Todas as cidades</option>
            {cities.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
          </select>
        </div>
        {hasFilter && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200 px-2 h-8 rounded-lg border border-app-border hover:border-app-borderLight transition-all">
            <X size={12} /> Limpar
          </button>
        )}
        {state.status === 'loading' && <Loader2 size={14} className="animate-spin text-gray-500 ml-1" />}
      </div>

      {/* Estados de erro */}
      {state.status === 'error' && (
        <div className="px-5 py-6 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-rose-300">
            {state.error.status === 401 ? <Lock size={16} className="mt-0.5 shrink-0" /> : state.error.status === 503 ? <CalendarX size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium text-gray-100">
                {state.error.status === 503 ? 'Cancelados ainda não disponíveis' : state.error.status === 401 ? 'Sessão expirada' : 'Não foi possível listar os cancelados'}
              </p>
              <p className="mt-0.5 text-[12px] text-gray-400">{state.error.message}</p>
            </div>
          </div>
          <button onClick={() => setPage((p) => p)} className="flex items-center gap-1.5 rounded-md border border-app-border px-3 py-1.5 text-[12px] text-gray-300 hover:border-app-borderLight hover:text-gray-100 transition-colors">
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela */}
      {state.status !== 'error' && (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border bg-app-surface/50">
                  {['Cliente', 'Cidade', 'Plano', 'Mensalidade', 'Cancelado em', 'Tempo', 'Sinais', ''].map((h, i) => (
                    <th key={h || i} className={cn('px-4 py-2.5 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap', (h === 'Mensalidade' || h === 'Tempo') && 'text-right', h === 'Tempo' && 'hidden sm:table-cell', h === 'Sinais' && 'hidden md:table-cell')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((c) => <Row key={`${c.clientId}-${c.contractNumber}`} c={c} />)}
                {state.status === 'loading' && !data && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-gray-500"><Loader2 size={14} className="animate-spin inline mr-2" />Carregando cancelados…</td></tr>
                )}
                {data && data.rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-gray-500">Nenhum cancelamento encontrado com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
            <span className="text-[10px] text-gray-500">
              {data && data.total > 0
                ? `${(data.page * data.pageSize + 1).toLocaleString('pt-BR')}–${Math.min((data.page + 1) * data.pageSize, data.total).toLocaleString('pt-BR')} de ${data.total.toLocaleString('pt-BR')}`
                : '—'}
            </span>
            <div className="flex gap-1.5 items-center">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Anterior</button>
              <span className="text-[10px] text-gray-500 px-1 font-mono">{page + 1}/{totalPages}</span>
              <button disabled={!data || page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Próxima</button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
