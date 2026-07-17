import { useEffect, useMemo, useState } from 'react'
import {
  ScrollText, ChevronDown, ChevronUp, ChevronRight, Loader2, AlertTriangle,
  Lock, CalendarX, RefreshCw, X,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn, formatCurrency } from '@/utils/cn'
import { fetchCancelledClients, ApiError, type CancelledClient, type CancelledClientsResult, type MotiveAgg } from './suggestionsApi'
import { CancelledProfile } from './CancelledClientsPanel'

const PAGE_SIZE = 15

const fmtDateBR = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Cor por posição no ranking de motivos (topo = mais crítico).
function motiveColor(i: number): string {
  return ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22d3ee'][i] || '#6b7280'
}

// Linha da lista de clientes (expansível → perfil completo).
function ClientRow({ c }: { c: CancelledClient }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="border-b border-app-border hover:bg-app-surface/70 cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-risk-critical/15 text-risk-critical">{c.name[0]}</div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate max-w-[200px]">{c.name}</p>
              <p className="text-[10px] text-gray-500 font-mono">{c.contractNumber || c.clientId}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-400">{c.city}</td>
        <td className="px-4 py-2.5 text-xs text-gray-400 truncate max-w-[140px]">{c.plan}</td>
        <td className="px-4 py-2.5 text-xs font-mono text-gray-300 text-right">{formatCurrency(c.monthlyValue)}</td>
        <td className="px-4 py-2.5 text-xs font-mono text-risk-critical">{fmtDateBR(c.cancellationDate)}</td>
        <td className="px-4 py-2.5 text-gray-500">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-surface/40">
          <td colSpan={6} className="px-5 py-4"><CancelledProfile c={c} /></td>
        </tr>
      )}
    </>
  )
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: CancelledClientsResult }

export default function CancelledByMotivePanel() {
  const [motive, setMotive] = useState('')
  const [page, setPage] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // Guarda o último breakdown de motivos — estável ao trocar o motivo/página.
  const [motives, setMotives] = useState<MotiveAgg[]>([])

  useEffect(() => { setPage(0) }, [motive])

  useEffect(() => {
    let alive = true
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }))
    fetchCancelledClients({ motive, page, pageSize: PAGE_SIZE })
      .then((data) => { if (!alive) return; setState({ status: 'ready', data }); if (data.motives?.length) setMotives(data.motives) })
      .catch((e) => { if (!alive) return; setState({ status: 'error', error: e instanceof ApiError ? e : new ApiError(0, 'Erro inesperado.') }) })
    return () => { alive = false }
  }, [motive, page])

  const data = state.status === 'ready' ? state.data : null
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const totalCancelled = useMemo(() => motives.reduce((a, m) => a + m.count, 0), [motives])
  const maxCount = useMemo(() => motives.reduce((a, m) => Math.max(a, m.count), 0), [motives])

  return (
    <Card className="shadow-card-md">
      <CardHeader
        title="Perfis dos Cancelados por Motivo"
        subtitle={totalCancelled ? `${totalCancelled.toLocaleString('pt-BR')} cancelamentos · ${motives.length} motivo(s)` : 'Distribuição dos cancelamentos por motivo'}
        icon={<ScrollText size={14} />}
      />

      {/* Erro */}
      {state.status === 'error' && (
        <div className="px-5 py-6 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-rose-300">
            {state.error.status === 401 ? <Lock size={16} className="mt-0.5 shrink-0" /> : state.error.status === 503 ? <CalendarX size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium text-gray-100">{state.error.status === 503 ? 'Cancelados ainda não disponíveis' : state.error.status === 401 ? 'Sessão expirada' : 'Não foi possível carregar os motivos'}</p>
              <p className="mt-0.5 text-[12px] text-gray-400">{state.error.message}</p>
            </div>
          </div>
          <button onClick={() => setPage((p) => p)} className="flex items-center gap-1.5 rounded-md border border-app-border px-3 py-1.5 text-[12px] text-gray-300 hover:border-app-borderLight hover:text-gray-100 transition-colors">
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {state.status !== 'error' && (
        <>
          {/* Breakdown por motivo (clicável) */}
          <div className="px-5 py-4 border-b border-app-border">
            {motives.length === 0 && state.status === 'loading' ? (
              <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 size={14} className="animate-spin" /> Carregando motivos…</div>
            ) : motives.length === 1 && motives[0].value === 'Não informado' ? (
              <p className="text-xs text-gray-500">Sem dados de motivo ainda — rode o ETL completo para materializar <span className="font-mono">cancellation_motive</span>.</p>
            ) : (
              <div className="space-y-1.5">
                {motives.map((m, i) => {
                  const sel = motive === m.value
                  const share = totalCancelled ? (m.count / totalCancelled) * 100 : 0
                  const avg = m.count ? m.mrr / m.count : 0
                  return (
                    <button
                      key={m.value}
                      onClick={() => setMotive(sel ? '' : m.value)}
                      className={cn('w-full flex items-center gap-3 rounded-lg px-3 py-2 border transition-all text-left', sel ? 'border-brand-blue/40 bg-brand-blue/10' : 'border-app-border hover:border-app-borderLight hover:bg-app-surface/50')}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: motiveColor(i) }} />
                      <span className="text-xs text-gray-200 flex-1 min-w-0 truncate" title={m.value}>{m.value}</span>
                      <div className="hidden sm:block w-28 h-1.5 bg-app-border rounded-full overflow-hidden shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${maxCount ? (m.count / maxCount) * 100 : 0}%`, background: motiveColor(i) }} />
                      </div>
                      <span className="text-[11px] font-mono text-gray-300 w-24 text-right shrink-0">{m.count.toLocaleString('pt-BR')} <span className="text-gray-500">({share.toFixed(0)}%)</span></span>
                      <span className="text-[11px] font-mono text-gray-500 w-24 text-right shrink-0 hidden md:inline" title="Ticket médio">{formatCurrency(avg)}/mês</span>
                      <ChevronRight size={13} className={cn('shrink-0 transition-colors', sel ? 'text-brand-blue' : 'text-gray-600')} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Lista de clientes do escopo (todos ou do motivo selecionado) */}
          <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-400">
              {motive ? <>Motivo: <strong className="text-gray-200">{motive}</strong></> : 'Todos os motivos'}
              {data ? <span className="text-gray-600"> · {data.total.toLocaleString('pt-BR')} cliente(s)</span> : null}
            </span>
            {motive && (
              <button onClick={() => setMotive('')} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200 px-2 h-7 rounded-lg border border-app-border hover:border-app-borderLight transition-all">
                <X size={11} /> Limpar motivo
              </button>
            )}
            {state.status === 'loading' && <Loader2 size={13} className="animate-spin text-gray-500" />}
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border bg-app-surface/50">
                  {['Cliente', 'Cidade', 'Plano', 'Mensalidade', 'Cancelado em', ''].map((h, i) => (
                    <th key={h || i} className={cn('px-4 py-2.5 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap', h === 'Mensalidade' && 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((c) => <ClientRow key={`${c.clientId}-${c.contractNumber}`} c={c} />)}
                {data && data.rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-500">Nenhum cancelamento neste motivo.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
            <span className="text-[10px] text-gray-500">
              {data && data.total > 0 ? `${(data.page * data.pageSize + 1).toLocaleString('pt-BR')}–${Math.min((data.page + 1) * data.pageSize, data.total).toLocaleString('pt-BR')} de ${data.total.toLocaleString('pt-BR')}` : '—'}
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
