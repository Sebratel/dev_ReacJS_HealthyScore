import { useEffect, useMemo, useState } from 'react'
import { X, AlertTriangle, Search, Download, Loader2, ShieldAlert } from 'lucide-react'
import { cn, formatCurrency } from '@/utils/cn'
import { useAppStore } from '@/store/appStore'
import { HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { useHealthColors } from '@/hooks/useHealthColors'
import { softenColor } from '@/utils/healthColors'
import { fetchDashboard, ApiError, type RankedClient } from './dashboardApi'
import type { HealthClassification } from '@/types'

const PAGE_SIZE = 50
const QTY_OPTS = [50, 100, 250, 500, 1000]
const CLASS_OPTS: { key: 'all' | HealthClassification; label: string }[] = [
  { key: 'all', label: 'Todas as classificações' },
  { key: 'critical', label: HEALTH_LABELS.critical },
  { key: 'high_risk', label: HEALTH_LABELS.high_risk },
  { key: 'attention', label: HEALTH_LABELS.attention },
  { key: 'healthy', label: HEALTH_LABELS.healthy },
  { key: 'excellent', label: HEALTH_LABELS.excellent },
]

// Colunas do preview e do CSV — value() é o valor bruto (usado nos dois).
const COLUMNS: { key: string; label: string; align?: 'right'; value: (r: RankedClient) => string | number }[] = [
  { key: 'name', label: 'Cliente', value: (r) => r.customerName },
  { key: 'contract', label: 'Contrato', value: (r) => r.contractNumber || r.customerId },
  { key: 'city', label: 'Cidade', value: (r) => r.city },
  { key: 'plan', label: 'Plano', value: (r) => r.plan },
  { key: 'mrr', label: 'Mensalidade', align: 'right', value: (r) => r.monthlyValue },
  { key: 'health', label: 'Health', align: 'right', value: (r) => r.overallHealth },
  { key: 'churn', label: 'Churn %', align: 'right', value: (r) => r.overallChurnRisk },
  { key: 'class', label: 'Classificação', value: (r) => HEALTH_LABELS[r.classification] },
  { key: 'revrisk', label: 'Receita em risco', align: 'right', value: (r) => Math.round(r.revenueRisk) },
  { key: 'modules', label: 'Módulos', align: 'right', value: (r) => r.enginesPresent },
  { key: 'overdue', label: 'Faturas atrasadas', align: 'right', value: (r) => r.signals?.overdue ?? 0 },
  { key: 'threats', label: 'Ameaças cancel.', align: 'right', value: (r) => r.signals?.relCancelThreats ?? 0 },
  { key: 'reneg', label: 'Renegociações', align: 'right', value: (r) => r.signals?.renegotiations ?? 0 },
  { key: 'trust', label: 'Desbloqueios', align: 'right', value: (r) => r.signals?.trustReleases ?? 0 },
  { key: 'massive', label: 'Massivas', align: 'right', value: (r) => r.signals?.netMassiveCount ?? 0 },
  { key: 'sla', label: 'SLA atrasado', align: 'right', value: (r) => r.signals?.slaLateCount ?? 0 },
]

function toCsv(rows: RankedClient[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = COLUMNS.map((c) => esc(c.label)).join(';')
  const body = rows.map((r) => COLUMNS.map((c) => esc(c.value(r))).join(';')).join('\n')
  return `${header}\n${body}`
}

type State = { status: 'loading' } | { status: 'error'; msg: string } | { status: 'ready'; rows: RankedClient[] }

export function WorstHealthModal({ open, onClose, cities }: { open: boolean; onClose: () => void; cities: string[] }) {
  const palette = useHealthColors()
  const s = useAppStore()
  const [qty, setQty] = useState(100)
  const [classification, setClassification] = useState<'all' | HealthClassification>('all')
  const [city, setCity] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Busca (backend): worst N por classificação/cidade. A busca por texto é local.
  useEffect(() => {
    if (!open) return
    let alive = true
    setState({ status: 'loading' })
    const configs = {
      financial: s.financialConfig, commercial: s.commercialConfig, connection: s.connectionConfig,
      network: s.networkConfig, field: s.fieldConfig, installation: s.installationConfig, relationship: s.relationshipConfig,
    }
    fetchDashboard({ configs, thresholds: s.healthThresholds, topN: qty, city: city || undefined, classification: classification === 'all' ? undefined : classification })
      .then((d) => { if (alive) setState({ status: 'ready', rows: d.ranking.top }) })
      .catch((e) => { if (alive) setState({ status: 'error', msg: e instanceof ApiError ? e.message : 'Erro inesperado.' }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, qty, classification, city])

  useEffect(() => { setPage(0) }, [query, qty, classification, city])

  const rows = state.status === 'ready' ? state.rows : []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => COLUMNS.some((c) => String(c.value(r)).toLowerCase().includes(q)))
  }, [rows, query])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const exportCsv = () => {
    const csv = toCsv(filtered)
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const clsPart = classification === 'all' ? 'todos' : classification
    a.download = `piores-health-scores-${clsPart}-${filtered.length}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-6xl max-h-[90vh] flex flex-col bg-surface-container-low border border-outline rounded-2xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-outline shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-danger flex items-center justify-center"><ShieldAlert size={15} className="text-on-primary" /></div>
            <div>
              <h2 className="text-sm font-bold text-on-surface">Piores Health Scores</h2>
              <p className="text-[11px] text-on-surface-variant">Clientes ordenados do pior score combinado para o melhor — filtre e exporte</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1"><X size={18} /></button>
        </div>

        {/* Filtros */}
        <div className="flex items-end justify-between gap-3 px-5 py-3 border-b border-outline shrink-0 flex-wrap">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Quantidade</span>
              <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-8 px-2 text-xs bg-surface-container-lowest border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50">
                {QTY_OPTS.map((n) => <option key={n} value={n}>{n} piores</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Classificação</span>
              <select value={classification} onChange={(e) => setClassification(e.target.value as any)} className="h-8 px-2 text-xs bg-surface-container-lowest border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50">
                {CLASS_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Cidade</span>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="h-8 px-2 text-xs bg-surface-container-lowest border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50">
                <option value="">Todas</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-on-surface-variant pointer-events-none" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar (nome, contrato, cidade)…"
                className="pl-8 pr-3 h-8 w-56 text-xs bg-surface-container-lowest border border-outline rounded-lg text-on-surface/85 placeholder-on-surface-variant/90 focus:outline-none focus:border-primary/50" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-on-surface-variant font-mono">{filtered.length.toLocaleString('pt-BR')} clientes</span>
            <button onClick={exportCsv} disabled={filtered.length === 0}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium disabled:opacity-30">
              <Download size={12} /> Exportar CSV
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          {state.status === 'loading' ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-on-surface/70"><Loader2 size={16} className="animate-spin" /> Calculando os piores scores…</div>
          ) : state.status === 'error' ? (
            <div className="flex items-start gap-2.5 px-5 py-10 text-sm text-risk-critical"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div><p className="font-medium text-on-surface">Não foi possível carregar</p><p className="mt-0.5 text-[12px] text-on-surface/70">{state.msg}</p></div></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-container-low border-b border-outline">
                  <th className="px-3 py-2 text-[10px] text-on-surface-variant uppercase tracking-wider font-medium text-right">#</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={cn('px-3 py-2 text-[10px] text-on-surface-variant uppercase tracking-wider font-medium whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, ri) => (
                  <tr key={r.customerId} className="border-b border-outline/60 hover:bg-surface-container-lowest/60 transition-colors">
                    <td className="px-3 py-2 text-[10px] font-mono text-on-surface-variant/90 text-right">{page * PAGE_SIZE + ri + 1}</td>
                    {COLUMNS.map((c) => {
                      const v = c.value(r)
                      const display = c.key === 'mrr' || c.key === 'revrisk' ? formatCurrency(Number(v))
                        : c.key === 'churn' ? `${v}%`
                        : typeof v === 'number' ? v.toLocaleString('pt-BR') : v
                      return (
                        <td key={c.key} className={cn('px-3 py-2 text-xs whitespace-nowrap', c.align === 'right' ? 'text-right font-mono text-on-surface/85' : 'text-on-surface/85')}
                          style={c.key === 'health' ? { color: palette[r.classification], fontWeight: 700 } : undefined}>
                          {c.key === 'class'
                            ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: palette[r.classification], background: softenColor(palette[r.classification], 0.08) }}>{display}</span>
                            : display}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-xs text-on-surface-variant">Nenhum cliente com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / paginação */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-outline shrink-0">
          <span className="text-[10px] text-on-surface-variant">
            {filtered.length === 0 ? '0' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)}`} de {filtered.length.toLocaleString('pt-BR')}
          </span>
          <div className="flex gap-1.5">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-outline text-on-surface/70 disabled:opacity-30 hover:border-outline-strong transition-all">Anterior</button>
            <span className="text-[10px] text-on-surface-variant px-1 py-1 font-mono">{page + 1}/{totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-outline text-on-surface/70 disabled:opacity-30 hover:border-outline-strong transition-all">Próxima</button>
          </div>
        </div>
      </div>
    </div>
  )
}
