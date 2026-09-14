import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ShieldAlert, Zap, SlidersHorizontal, ChevronDown, ChevronUp, Table2,
  Loader2, AlertTriangle, Lock, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { EngineDataModal, type DataColumn, type AggregateGroup } from '@/components/ui/EngineDataModal'
import { ContractFilters, type ContractFilterState } from '@/components/ui/ContractFilters'
import { cn } from '@/utils/cn'
import { softenColor } from '@/utils/healthColors'
import { useHealthColors } from '@/hooks/useHealthColors'
import { useChartTokens } from '@/hooks/useChartTokens'
import type { HealthClassification } from '@/types'
import { fetchEngine, ApiError, coverageLabelFromMeta, type EngineResponse, type EngineMeta } from './engineApi'
import ScoreTimeline from '@/features/score-history/ScoreTimeline'
import { useRole } from '@/features/auth/access'

export const CLASS_LABEL: Record<string, string> = { excellent: 'Excelente', healthy: 'Saudável', attention: 'Atenção', high_risk: 'Alto Risco', critical: 'Crítico' }

export function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-outline rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(value / max) * 100}%`, background: `linear-gradient(90deg, ${softenColor(color, 0.6)}, ${color})` }} />
    </div>
  )
}

// Shape mínimo comum a todos os *EngineScore.
export interface EngineScoreBase {
  customerId: string
  customerName: string
  contractNumber?: string
  city: string
  healthScore: number
  churnRisk: number
  classification: HealthClassification
  indicators: { key: string; label: string; value: string; points: number }[]
}

// sortKey: campo do objeto de score usado para ordenar no servidor quando o
// cabeçalho desta coluna é clicado (omitir → coluna não ordenável).
export interface EngineColumn<S> { header: string; cell: (s: S) => ReactNode; sortKey?: string }

// Detalhamento padrão (indicador × pontuação) — usado no expandir da linha.
export function IndicatorBreakdown({ indicators }: { indicators: EngineScoreBase['indicators'] }) {
  return (
    <div className="space-y-1">
      {indicators.map((ind) => (
        <div key={ind.key} className="flex items-start justify-between gap-3 text-[11px] py-0.5 border-b border-outline/40">
          <span className="text-on-surface/70 w-32 shrink-0">{ind.label}</span>
          <span className="font-mono text-on-surface/85 flex-1 text-right leading-relaxed">{ind.value}</span>
          <span className={cn('font-mono w-14 text-right shrink-0', ind.points > 0 ? 'text-risk-low' : ind.points < 0 ? 'text-risk-critical' : 'text-on-surface-variant/90')}>
            {ind.points > 0 ? '+' : ''}{ind.points} pts
          </span>
        </div>
      ))}
    </div>
  )
}

function EngineRow<S extends EngineScoreBase>({ score, rank, columns, renderExpanded, colSpan }: {
  score: S; rank: number; columns: EngineColumn<S>[]; renderExpanded?: (s: S) => ReactNode; colSpan: number
}) {
  const [open, setOpen] = useState(false)
  const healthColors = useHealthColors()
  const { riskMedium, riskHigh, riskCritical } = useChartTokens()
  const color = healthColors[score.classification]
  return (
    <>
      <tr className="border-b border-outline hover:bg-surface-container-low/70 cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2.5 text-[10px] font-mono text-on-surface-variant">{rank}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: softenColor(color, 0.125), color }}>{score.customerName[0]}</div>
            <div>
              <p className="text-xs font-medium text-on-surface truncate max-w-[150px]">{score.customerName}</p>
              <p className="text-[10px] text-on-surface-variant">
                {score.contractNumber && <><span className="font-mono text-on-surface/70" title="Nº do contrato">#{score.contractNumber}</span> · </>}{score.city}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="text-sm font-bold font-mono" style={{ color }}>{score.healthScore}</span><div className="w-16"><ScoreBar value={score.healthScore} color={color} /></div></div></td>
        <td className="px-4 py-2.5"><span className="text-xs font-mono" style={{ color: score.churnRisk >= 60 ? riskCritical : score.churnRisk >= 40 ? riskHigh : riskMedium }}>{score.churnRisk.toFixed(0)}%</span></td>
        {columns.map((col, i) => <td key={i} className="px-4 py-2.5">{col.cell(score)}</td>)}
        <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, background: softenColor(color, 0.08) }}>{CLASS_LABEL[score.classification]}</span></td>
        <td className="px-4 py-2.5 text-on-surface-variant">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-outline bg-surface-container-low/50">
          <td colSpan={colSpan} className="px-6 py-3">
            {renderExpanded ? renderExpanded(score) : (
              <>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-2">Indicadores — atributo × pontuação</p>
                <IndicatorBreakdown indicators={score.indicators} />
              </>
            )}
            <div className="mt-3 pt-3 border-t border-outline/40">
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Histórico de Health Score</p>
              <ScoreTimeline clientId={score.customerId} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const PAGE_SIZE = 10
type Tab = 'all' | 'critical' | 'high_risk' | 'attention'

export interface EngineScreenProps<Agg, S extends EngineScoreBase> {
  engineKey: string
  icon: ReactNode
  title: string
  subtitle: string
  config: unknown
  thresholds: unknown
  analyzedLabel: string
  rightStat?: (meta: EngineMeta) => ReactNode
  rankingTitle: string
  rankingSubtitle: string
  columns: EngineColumn<S>[]
  tableHeaders: string[]        // rótulos das colunas do meio (entre Churn Risk e Classificação)
  renderExpanded?: (s: S) => ReactNode
  dataTitle: string
  dataColumns: DataColumn[]
  buildAggregates?: (rows: S[], agg: Agg) => AggregateGroup[]
  renderConfigModal: (open: boolean, onClose: () => void) => ReactNode
  footerNote?: string
}

export function EngineScreen<Agg, S extends EngineScoreBase>(props: EngineScreenProps<Agg, S>) {
  const { engineKey, config, thresholds } = props
  const { isPowerUser } = useRole() // "Configurar" (pesos): power_user+ (admin herda)
  const [filters, setFilters] = useState<ContractFilterState>({ contract: '', name: '', city: '' })
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(0)
  // Ordenação clicável — null = padrão do servidor (healthScore asc, pior 1º).
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [data, setData] = useState<EngineResponse<Agg, S> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetchEngine<Agg, S>(engineKey, {
          config, thresholds, page, pageSize: PAGE_SIZE,
          name: filters.name, contract: filters.contract, city: filters.city,
          classification: tab === 'all' ? undefined : tab,
          sortKey: sort?.key, sortDir: sort?.dir,
        })
        if (alive) { setData(res); setError(null) }
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e : new ApiError(0, 'Erro inesperado.'))
      } finally {
        if (alive) setLoading(false)
      }
    }, 300)
    return () => { alive = false; clearTimeout(timer) }
  }, [engineKey, config, thresholds, page, tab, filters.name, filters.contract, filters.city, sort, reloadKey])

  const changeFilters = (f: ContractFilterState) => { setFilters(f); setPage(0) }
  const changeTab = (t: Tab) => { setTab(t); setPage(0) }
  // 1º clique: desc (maior/pior impacto primeiro) → asc → volta ao padrão.
  const changeSort = (key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null))
    setPage(0)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const dist = data?.distribution
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: data?.analyzed ?? 0 },
    { key: 'critical', label: 'Críticos', count: dist?.critical ?? 0 },
    { key: 'high_risk', label: 'Alto Risco', count: dist?.high_risk ?? 0 },
    { key: 'attention', label: 'Atenção', count: dist?.attention ?? 0 },
  ]
  const colSpan = 6 + props.columns.length // #, cliente, health, churn, ...cols, classif, chevron

  // "Ver dados": busca os N de maior risco do backend (N escolhido no modal).
  const [dataRows, setDataRows] = useState<S[]>([])
  const [dataAgg, setDataAgg] = useState<Agg | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataQty, setDataQty] = useState(200)
  useEffect(() => {
    if (!dataOpen) return
    let alive = true
    setDataLoading(true)
    fetchEngine<Agg, S>(engineKey, { config, thresholds, page: 0, pageSize: dataQty, name: filters.name, contract: filters.contract, city: filters.city })
      .then((res) => { if (alive) { setDataRows(res.scores); setDataAgg(res.aggregates) } })
      .catch(() => { if (alive) { setDataRows([]); setDataAgg(null) } })
      .finally(() => { if (alive) setDataLoading(false) })
    return () => { alive = false }
  }, [dataOpen, engineKey, config, thresholds, filters.name, filters.contract, filters.city, dataQty])

  const aggregates = useMemo(
    () => (props.buildAggregates && dataAgg ? props.buildAggregates(dataRows, dataAgg) : undefined),
    [dataRows, dataAgg, props],
  )

  const rightStat = props.rightStat
    ? (data ? props.rightStat(data.meta) : null)
    : <> · {(data?.meta.totals?.clients ?? 0).toLocaleString('pt-BR')} ativos</>

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-outline bg-surface-container-lowest shadow-card-md">
        <div className="absolute -top-24 -right-12 w-80 h-80 rounded-full bg-gradient-brand opacity-[0.07] blur-3xl pointer-events-none animate-float" />
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0">{props.icon}</div>
              <h1 className="text-xl font-bold gradient-text tracking-tight">{props.title}</h1>
            </div>
            <p className="text-xs text-on-surface-variant max-w-xl leading-relaxed">{props.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] bg-surface-container-low border border-outline px-3 py-2 rounded-xl">
              <Zap size={11} className="text-primary-strong" />
              <span className="font-mono text-on-surface-variant/90">
                <span className="text-on-surface font-semibold">{(data?.analyzed ?? 0).toLocaleString('pt-BR')}</span> {props.analyzedLabel}
                <span className="text-on-surface/70">{rightStat}</span>
              </span>
            </div>
            <button onClick={() => setDataOpen(true)} className="flex items-center gap-2 text-xs font-medium text-on-surface/85 bg-surface-container-low border border-outline px-3.5 py-2 rounded-xl hover:border-outline-strong hover:text-on-surface transition-all duration-200"><Table2 size={13} />Ver dados</button>
            {/* Ajustar pesos dos indicadores — power_user+ */}
            {isPowerUser && (
              <button onClick={() => setConfigOpen(true)} className="group flex items-center gap-2 text-xs font-medium text-[#fff] bg-gradient-brand px-3.5 py-2 rounded-xl shadow-glow hover:shadow-glow-violet hover:-translate-y-0.5 transition-all duration-200">
                <SlidersHorizontal size={13} className="group-hover:rotate-90 transition-transform duration-300" />Configurar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <ContractFilters filters={filters} onChange={changeFilters} cities={data?.cities ?? []} resultCount={data?.analyzed} totalCount={data?.populationTotal} />

      {/* Erro */}
      {error && !data && (
        <div className="rounded-xl border border-outline bg-surface-container-lowest px-5 py-6 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-risk-critical">
            {error.status === 401 ? <Lock size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium text-on-surface">{error.status === 0 ? 'Servidor indisponível' : error.status === 401 ? 'Sessão expirada' : 'Não foi possível carregar'}</p>
              <p className="mt-0.5 text-[12px] text-on-surface/70">{error.message}</p>
              {error.status === 0 && <p className="mt-1.5 text-[11px] text-on-surface-variant">Depende do backend (<span className="font-mono">/api</span>). Suba com <span className="font-mono">npm run api</span>.</p>}
            </div>
          </div>
          <button onClick={() => setReloadKey((k) => k + 1)} className="flex items-center gap-1.5 rounded-md border border-outline px-3 py-1.5 text-[12px] text-on-surface/85 hover:border-outline-strong hover:text-on-surface transition-colors">
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {/* Ranking */}
      {(data || loading) && (
        <Card className="shadow-card-md hover:shadow-card-lg hover-lift">
          <CardHeader title={props.rankingTitle} subtitle={props.rankingSubtitle} icon={<ShieldAlert size={14} />} />
          <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
            {tabs.map(({ key, label, count }) => (
              <button key={key} onClick={() => changeTab(key)}
                className={cn('text-[10px] px-3 py-1.5 rounded-lg border font-medium transition-all',
                  tab === key ? 'bg-gradient-brand text-[#fff] border-transparent shadow-glow' : 'text-on-surface-variant border-outline hover:text-on-surface-variant/75 hover:border-outline-strong hover:bg-surface-container-low')}>
                {label} <span className="font-mono ml-1 opacity-70">{count.toLocaleString('pt-BR')}</span>
              </button>
            ))}
            {loading && <span className="flex items-center gap-1 text-[10px] text-on-surface-variant ml-1"><Loader2 size={11} className="animate-spin" /> atualizando…</span>}
          </div>

          <div className="mt-3 overflow-x-auto min-h-[200px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline bg-surface-container-low/50">
                  {([
                    { label: '#' },
                    { label: 'Cliente', sortKey: 'customerName' },
                    { label: 'Health Score', sortKey: 'healthScore' },
                    { label: 'Churn Risk', sortKey: 'churnRisk' },
                    ...props.tableHeaders.map((h, i) => ({ label: h, sortKey: props.columns[i]?.sortKey })),
                    { label: 'Classificação', sortKey: 'classification' },
                    { label: '' },
                  ] as { label: string; sortKey?: string }[]).map(({ label, sortKey }, i) => (
                    <th key={`${label}-${i}`} className="px-4 py-2.5 text-left text-[10px] text-on-surface-variant uppercase tracking-wider font-medium whitespace-nowrap">
                      {sortKey ? (
                        <button
                          onClick={() => changeSort(sortKey)}
                          title={`Ordenar por ${label}`}
                          className={cn('inline-flex items-center gap-1 uppercase tracking-wider hover:text-on-surface/85 transition-colors', sort?.key === sortKey ? 'text-primary' : '')}
                        >
                          {label}
                          {sort?.key === sortKey
                            ? (sort.dir === 'desc' ? <ArrowDown size={9} /> : <ArrowUp size={9} />)
                            : <ArrowUpDown size={9} className="opacity-40" />}
                        </button>
                      ) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.scores.map((score, i) => (
                  <EngineRow key={score.customerId} score={score} rank={page * PAGE_SIZE + i + 1} columns={props.columns} renderExpanded={props.renderExpanded} colSpan={colSpan} />
                ))}
                {!loading && data && data.scores.length === 0 && (
                  <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-on-surface-variant">Nenhum cliente encontrado com esses filtros.</td></tr>
                )}
                {loading && !data && (
                  <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-on-surface-variant"><Loader2 size={16} className="animate-spin inline mr-2" /> Carregando…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-outline">
            <span className="text-[10px] text-on-surface-variant">
              {data && data.total > 0 ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, data.total)} de ${data.total.toLocaleString('pt-BR')}` : '0'} clientes
            </span>
            <div className="flex gap-1.5">
              <button disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-outline text-on-surface/70 disabled:opacity-30 hover:border-outline-strong transition-all">Anterior</button>
              <span className="text-[10px] text-on-surface-variant px-1 py-1 font-mono">{page + 1}/{totalPages}</span>
              <button disabled={page >= totalPages - 1 || loading} onClick={() => setPage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-outline text-on-surface/70 disabled:opacity-30 hover:border-outline-strong transition-all">Próxima</button>
            </div>
          </div>
        </Card>
      )}

      {data && (
        <p className="text-[10px] text-on-surface-variant text-center">
          {props.footerNote ? `${props.footerNote} · ` : ''}{coverageLabelFromMeta(data.meta)} · pontuado no servidor · atualizado em {data.meta.generatedAt ? new Date(data.meta.generatedAt).toLocaleString('pt-BR') : '—'}
        </p>
      )}

      {props.renderConfigModal(configOpen, () => setConfigOpen(false))}
      <EngineDataModal
        open={dataOpen}
        onClose={() => setDataOpen(false)}
        title={props.dataTitle}
        subtitle={dataLoading ? 'Carregando…' : `${dataRows.length.toLocaleString('pt-BR')} clientes de maior risco · pontuados no servidor`}
        columns={props.dataColumns}
        rows={dataRows}
        aggregates={aggregates}
        qty={dataQty}
        qtyOptions={[50, 100, 200, 500, 1000, 2000]}
        onQtyChange={setDataQty}
        loading={dataLoading}
      />
    </div>
  )
}
