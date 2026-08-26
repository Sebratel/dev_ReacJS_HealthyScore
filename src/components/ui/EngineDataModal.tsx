import { useEffect, useMemo, useState } from 'react'
import { X, Table2, Search, Download, Database, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface DataColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  // Valor bruto da célula — usado tanto na renderização quanto no export CSV
  value: (row: any) => string | number
}

export interface AggregateGroup {
  title: string
  entries: { label: string; value: string | number }[]
}

interface Props {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  columns: DataColumn[]
  rows: any[]
  aggregates?: AggregateGroup[]
  // Seletor de quantidade (opcional): quantas linhas o backend traz. Ao mudar,
  // o pai re-busca e passa `rows` novo. `loading` mostra o spinner nesse meio.
  qty?: number
  qtyOptions?: number[]
  onQtyChange?: (n: number) => void
  loading?: boolean
}

const PAGE_SIZE = 50

function toCsv(columns: DataColumn[], rows: any[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => esc(c.label)).join(';')
  const body = rows.map((r) => columns.map((c) => esc(c.value(r))).join(';')).join('\n')
  return `${header}\n${body}`
}

export function EngineDataModal({ open, onClose, title, subtitle, columns, rows, aggregates, qty, qtyOptions, onQtyChange, loading }: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reseta a paginação ao reabrir, ao buscar ou ao trocar a quantidade
  useEffect(() => { setPage(0) }, [query, open, qty])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => columns.some((c) => String(c.value(r)).toLowerCase().includes(q)))
  }, [query, rows, columns])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const exportCsv = () => {
    const csv = toCsv(columns, filtered)
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-dados.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[88vh] flex flex-col bg-app-surface border border-app-border rounded-2xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-app-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-violet flex items-center justify-center">
              <Table2 size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{title}</h2>
              <p className="text-[11px] text-gray-500">{subtitle ?? 'Dados que alimentam esta tela'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-app-border shrink-0 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {onQtyChange && (
              <label className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">Quantidade</span>
                <select
                  value={qty}
                  onChange={(e) => onQtyChange(Number(e.target.value))}
                  className="h-8 px-2 text-xs bg-app-card border border-app-border rounded-lg text-gray-200 focus:outline-none focus:border-brand-blue/50"
                >
                  {(qtyOptions ?? [50, 100, 200, 500, 1000, 2000]).map((n) => <option key={n} value={n}>{n} linhas</option>)}
                </select>
              </label>
            )}
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-gray-500 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nas linhas..."
                className="pl-8 pr-3 h-8 w-64 text-xs bg-app-card border border-app-border rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading && <Loader2 size={13} className="animate-spin text-gray-500" />}
            <span className="text-[11px] text-gray-500 font-mono">{filtered.length.toLocaleString('pt-BR')} linhas</span>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-brand-blue/15 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/25 transition-all font-medium"
            >
              <Download size={12} />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          {/* Agregados (retorno das queries de listas distintas) */}
          {aggregates && aggregates.length > 0 && (
            <div className="px-5 py-4 border-b border-app-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {aggregates.map((g) => (
                <div key={g.title} className="rounded-xl bg-app-card border border-app-border p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Database size={11} className="text-brand-cyan" />
                    <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">{g.title}</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                    {g.entries.map((e, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-gray-400 truncate">{e.label}</span>
                        <span className="font-mono text-gray-300 shrink-0">{typeof e.value === 'number' ? e.value.toLocaleString('pt-BR') : e.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tabela bruta */}
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-app-surface border-b border-app-border">
                {columns.map((c) => (
                  <th key={c.key} className={cn('px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, ri) => (
                <tr key={ri} className="border-b border-app-border/60 hover:bg-app-card/60 transition-colors">
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2 text-xs whitespace-nowrap', c.align === 'right' ? 'text-right font-mono text-gray-300' : 'text-gray-300')}>
                      {c.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-xs text-gray-500">Nenhuma linha encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / paginação */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border shrink-0">
          <span className="text-[10px] text-gray-500">
            {filtered.length === 0 ? '0' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)}`} de {filtered.length.toLocaleString('pt-BR')}
          </span>
          <div className="flex gap-1.5">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Anterior</button>
            <span className="text-[10px] text-gray-500 px-1 py-1 font-mono">{page + 1}/{totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Próxima</button>
          </div>
        </div>
      </div>
    </div>
  )
}
