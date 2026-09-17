import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, ChevronDown, ChevronRight, Check, Wand2, Info,
  TrendingDown, TrendingUp, Database, Users, Loader2, AlertTriangle, Lock, RefreshCw,
  CalendarRange, Network, Wifi, ArrowUp, ArrowDown, ArrowUpDown, FileDown,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn, formatCurrency } from '@/utils/cn'
import { useAppStore } from '@/store/appStore'
import { useRole } from '@/features/auth/access'
import { genderLabel } from '@/features/commercial-engine/commercialConfig'
import {
  realPaymentForms, realCommercial, realConnection, realField,
  realInstallation, realRelationship, realNetwork,
} from '@/data/realClients'
import type { SuggestionEngineKey, IndicatorSuggestion, IndexSuggestion } from './suggestionEngine'
import { fetchCancellationSuggestions, ApiError, type SuggestionResult } from './suggestionsApi'
import { useIndicatorLabelMap, resolveIndicatorLabel } from '@/features/settings/indicatorCatalog'
import { useChartTokens } from '@/hooks/useChartTokens'
import { softenColor } from '@/utils/healthColors'
import type { ChartTokens } from '@/utils/chartTokens'

// ─── Datas ─────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10)
const daysAgoISO = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const fmtDateBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const PRESETS = [
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
  { label: '12 meses', days: 365 },
  { label: '24 meses', days: 730 },
]

// ─── Formatação ────────────────────────────────────────────────
const fmtPct = (r: number) => `${(r * 100).toFixed(r * 100 < 10 ? 1 : 0)}%`
const fmtLift = (l: number) => `${l.toFixed(2).replace('.', ',')}×`

// Rampa de 5 passos do lift. O passo "levemente protetivo" é o mesmo verde
// atenuado, em vez de um segundo verde fixo, para acompanhar o tema.
function liftColor(t: ChartTokens, lift: number | null): string {
  if (lift === null) return t.axis
  if (lift >= 1.6) return t.riskCritical
  if (lift >= 1.2) return t.riskHigh
  if (lift <= 0.6) return t.riskLow
  if (lift <= 0.85) return softenColor(t.riskLow, 0.7)
  return t.axisStrong
}
function pointsColor(t: ChartTokens, p: number | null): string {
  if (p === null || p === 0) return t.axis
  return p > 0 ? t.riskLow : t.riskCritical
}

// ─── Tag de pontuação ──────────────────────────────────────────
function PointsTag({ value, size = 'md' }: { value: number | null; size?: 'sm' | 'md' }) {
  const tokens = useChartTokens()
  if (value === null) return <span className="text-[11px] text-on-surface-variant/90">—</span>
  const color = pointsColor(tokens, value)
  return (
    <span className={cn('font-mono font-bold tabular-nums', size === 'md' ? 'text-sm' : 'text-xs')} style={{ color }}>
      {value > 0 ? '+' : ''}{value}<span className="text-[9px] font-normal text-on-surface-variant ml-0.5">pts</span>
    </span>
  )
}

// ─── Detalhe "como cheguei nisso" ──────────────────────────────
function Explanation({ ind, idx }: { ind: IndicatorSuggestion; idx: IndexSuggestion }) {
  if (!idx.enough || idx.lift === null) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-surface-container-low/60 border border-outline px-3 py-2.5 text-[11px] text-on-surface/70 leading-relaxed">
        <Info size={13} className="mt-0.5 shrink-0 text-on-surface-variant" />
        <span>
          Amostra insuficiente na base ativa para sugerir com confiança
          (apenas <strong className="text-on-surface/85">{idx.activeCount}</strong> contrato(s) com este atributo). Precisa de pelo menos 5.
        </span>
      </div>
    )
  }
  const more = idx.lift >= 1
  const verb = more ? 'mais comum' : 'menos comum'
  const kind = more ? 'sinal de risco' : 'fator protetor'
  const KindIcon = more ? TrendingDown : TrendingUp
  const tokens = useChartTokens()
  const color = pointsColor(tokens, idx.suggestedPoints)
  return (
    <div className="rounded-lg bg-surface-container-low/60 border border-outline px-3 py-2.5 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-md bg-risk-critical/5 border border-risk-critical/15 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Entre os cancelados</p>
          <p className="text-xs text-on-surface mt-0.5">
            <strong className="font-mono text-risk-critical">{idx.cancelledCount.toLocaleString('pt-BR')}</strong> de{' '}
            {ind.cancelledRelevant.toLocaleString('pt-BR')} · <strong className="font-mono">{fmtPct(idx.cancelledRate)}</strong>
          </p>
        </div>
        <div className="rounded-md bg-risk-low/5 border border-risk-low/15 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Na base ativa</p>
          <p className="text-xs text-on-surface mt-0.5">
            <strong className="font-mono text-risk-low">{idx.activeCount.toLocaleString('pt-BR')}</strong> de{' '}
            {ind.activeRelevant.toLocaleString('pt-BR')} · <strong className="font-mono">{fmtPct(idx.activeRate)}</strong>
          </p>
        </div>
      </div>
      <p className="text-[11px] text-on-surface/70 leading-relaxed flex items-start gap-1.5">
        <KindIcon size={13} className="mt-0.5 shrink-0" style={{ color }} />
        <span>
          «{idx.label}» é <strong style={{ color: liftColor(tokens, idx.lift) }}>{fmtLift(idx.lift)}</strong>{' '}
          {verb} entre quem cancelou do que na base ativa → <strong style={{ color }}>{kind}</strong> →
          sugestão de <strong style={{ color }}>{idx.suggestedPoints! > 0 ? '+' : ''}{idx.suggestedPoints} pts</strong>.
        </span>
      </p>
      {ind.presence && (
        <p className="text-[10px] text-on-surface-variant leading-relaxed flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0" />
          <span>
            Percentual <strong className="text-on-surface/70">por contrato</strong>, não por fatura/evento: conta quem teve{' '}
            <strong className="text-on-surface/70">ao menos uma</strong> ocorrência no histórico. Por isso indicadores de
            presença não somam 100% entre si — o mesmo contrato pode ter, por exemplo, faturas atrasadas <em>e</em> faturas
            pagas no prazo.
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Linha de um índice (expansível) ───────────────────────────
function IndexRow({ ind, idx, current, onApply }: {
  ind: IndicatorSuggestion; idx: IndexSuggestion; current: number; onApply: () => void
}) {
  const [open, setOpen] = useState(false)
  const tokens = useChartTokens()
  // Aplicar pontuação = editar peso → power_user do setor daquele indicador.
  const canApplyHere = useRole().canEditSector(ind.engineKey)
  const applied = idx.suggestedPoints !== null && current === idx.suggestedPoints
  const canApply = idx.suggestedPoints !== null && !applied
  return (
    <>
      <tr className="border-b border-outline/50 hover:bg-surface-container-low/40 cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown size={11} className="text-on-surface-variant shrink-0" /> : <ChevronRight size={11} className="text-on-surface-variant shrink-0" />}
            <span className="text-xs text-on-surface truncate max-w-[220px]" title={idx.label}>{idx.label}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-right text-[11px] font-mono text-on-surface/70">{idx.enough ? fmtPct(idx.activeRate) : '—'}</td>
        <td className="px-3 py-2 text-right text-[11px] font-mono text-on-surface/70">{idx.enough ? fmtPct(idx.cancelledRate) : '—'}</td>
        <td className="px-3 py-2 text-right">
          <span className="text-[11px] font-mono font-semibold" style={{ color: liftColor(tokens, idx.lift) }}>
            {idx.lift === null ? '—' : fmtLift(idx.lift)}
          </span>
        </td>
        <td className="px-3 py-2 text-right"><PointsTag value={idx.suggestedPoints} /></td>
        <td className="px-3 py-2 text-right">
          <span className="text-[11px] font-mono tabular-nums" style={{ color: current === 0 ? tokens.axis : pointsColor(tokens, current) }}>
            {current > 0 ? '+' : ''}{current}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          {applied ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-risk-low"><Check size={11} /> aplicado</span>
          ) : canApplyHere ? (
            <button
              onClick={(e) => { e.stopPropagation(); onApply() }}
              disabled={!canApply}
              className="text-[10px] px-2 py-1 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Aplicar
            </button>
          ) : (
            <span className="text-[10px] text-on-surface-variant/90">—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-outline/50 bg-surface/30">
          <td colSpan={7} className="px-3 py-2.5"><Explanation ind={ind} idx={idx} /></td>
        </tr>
      )}
    </>
  )
}

// ─── Bloco de um indicador ─────────────────────────────────────
type SortCol = 'activeRate' | 'cancelledRate' | 'lift'
type SortState = { col: SortCol; dir: 'asc' | 'desc' } | null

function IndicatorBlock({ ind, currentOf, onApply, onApplyAll }: {
  ind: IndicatorSuggestion
  currentOf: (indexKey: string) => number
  onApply: (idx: IndexSuggestion) => void
  onApplyAll: (ind: IndicatorSuggestion) => void
}) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState<SortState>(null)
  // "Aplicar todas" = editar pesos → power_user do setor deste indicador.
  const canApplyHere = useRole().canEditSector(ind.engineKey)

  const valid = ind.indices.filter((i) => i.suggestedPoints !== null)
  const top = valid[0] ?? null
  const appliableCount = valid.filter((i) => currentOf(i.indexKey) !== i.suggestedPoints).length
  const LIMIT = 12

  // Ordenação clicável — linhas sem amostra suficiente ficam sempre no fim.
  const sortedIndices = useMemo(() => {
    if (!sort) return ind.indices
    const val = (i: IndexSuggestion): number | null =>
      !i.enough ? null : sort.col === 'lift' ? i.lift : sort.col === 'activeRate' ? i.activeRate : i.cancelledRate
    return [...ind.indices].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return sort.dir === 'asc' ? va - vb : vb - va
    })
  }, [ind.indices, sort])
  const visible = showAll ? sortedIndices : sortedIndices.slice(0, LIMIT)

  const toggleSort = (col: SortCol) =>
    setSort((s) => (s?.col !== col ? { col, dir: 'desc' } : s.dir === 'desc' ? { col, dir: 'asc' } : null))

  return (
    <div className="rounded-xl border border-outline bg-surface-container-lowest overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low/40 transition-colors text-left">
        {open ? <ChevronDown size={14} className="text-on-surface-variant shrink-0" /> : <ChevronRight size={14} className="text-on-surface-variant shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-on-surface">{ind.indicatorLabel}</span>
            {ind.presence && <span title="Indicador de presença: o % é por contrato (ao menos uma ocorrência no histórico). Não é excludente com outros indicadores — os percentuais não somam 100% entre si." className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container-low border border-outline text-on-surface-variant uppercase tracking-wider cursor-help">presença</span>}
            {ind.multi && <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container-low border border-outline text-on-surface-variant uppercase tracking-wider">multi</span>}
          </div>
          <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">{ind.description}</p>
        </div>
        {top && top.suggestedPoints !== null && (
          <div className="shrink-0 text-right hidden sm:block">
            <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Maior impacto</p>
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-[11px] text-on-surface/70 truncate max-w-[120px]" title={top.label}>{top.label}</span>
              <PointsTag value={top.suggestedPoints} size="sm" />
            </div>
          </div>
        )}
      </button>

      {open && (
        <div className="border-t border-outline">
          <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low/30">
            <span className="text-[10px] text-on-surface-variant">
              {valid.length} de {ind.indices.length} {ind.presence ? 'condição' : 'índices'} com amostra suficiente
              {ind.presence && <span className="text-on-surface-variant/90"> · % = contratos com ao menos uma ocorrência no histórico</span>}
            </span>
            {canApplyHere && appliableCount > 0 && (
              <button onClick={() => onApplyAll(ind)} className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md bg-gradient-brand text-on-primary shadow-glow hover:-translate-y-0.5 transition-all">
                <Wand2 size={11} /> Aplicar todas ({appliableCount})
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline bg-surface-container-low/20">
                  {([
                    { h: ind.presence ? 'Condição' : 'Atributo', a: 'left' },
                    { h: '% base ativa', a: 'right', col: 'activeRate' as SortCol },
                    { h: '% cancelados', a: 'right', col: 'cancelledRate' as SortCol },
                    { h: 'Lift', a: 'right', col: 'lift' as SortCol },
                    { h: 'Sugestão', a: 'right' },
                    { h: 'Atual', a: 'right' },
                    { h: '', a: 'right' },
                  ] as { h: string; a: string; col?: SortCol }[]).map(({ h, a, col }) => (
                    <th key={h || 'apply'} className={cn('px-3 py-2 text-[9px] text-on-surface-variant uppercase tracking-wider font-medium whitespace-nowrap', a === 'right' ? 'text-right' : 'text-left')}>
                      {col ? (
                        <button
                          onClick={() => toggleSort(col)}
                          title={`Ordenar por ${h}`}
                          className={cn('inline-flex items-center gap-1 uppercase tracking-wider hover:text-on-surface/85 transition-colors', sort?.col === col ? 'text-primary' : '')}
                        >
                          {h}
                          {sort?.col === col
                            ? (sort.dir === 'desc' ? <ArrowDown size={9} /> : <ArrowUp size={9} />)
                            : <ArrowUpDown size={9} className="opacity-40" />}
                        </button>
                      ) : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((idx) => (
                  <IndexRow key={idx.indexKey} ind={ind} idx={idx} current={currentOf(idx.indexKey)} onApply={() => onApply(idx)} />
                ))}
              </tbody>
            </table>
          </div>
          {ind.indices.length > LIMIT && (
            <button onClick={() => setShowAll((v) => !v)} className="w-full py-2 text-[10px] text-on-surface-variant hover:text-on-surface/85 border-t border-outline transition-colors">
              {showAll ? 'Mostrar menos' : `Ver todos os ${ind.indices.length} atributos`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Seção de uma engine ───────────────────────────────────────
function EngineSection({ label, indicators, defaultOpen, currentOf, onApply, onApplyAll }: {
  label: string
  indicators: IndicatorSuggestion[]
  defaultOpen: boolean
  currentOf: (ind: IndicatorSuggestion, indexKey: string) => number
  onApply: (ind: IndicatorSuggestion, idx: IndexSuggestion) => void
  onApplyAll: (ind: IndicatorSuggestion) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-2">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left group">
        {open ? <ChevronDown size={15} className="text-primary shrink-0" /> : <ChevronRight size={15} className="text-primary shrink-0" />}
        <h3 className="text-sm font-bold text-on-surface tracking-tight">{label}</h3>
        <span className="text-[10px] text-on-surface-variant font-mono">{indicators.length} indicadores</span>
        <div className="flex-1 h-px bg-outline ml-2" />
      </button>
      {open && (
        <div className="space-y-2 pl-1">
          {indicators.map((ind) => (
            <IndicatorBlock
              key={ind.indicatorKey}
              ind={ind}
              currentOf={(indexKey) => currentOf(ind, indexKey)}
              onApply={(idx) => onApply(ind, idx)}
              onApplyAll={onApplyAll}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  const { categorical } = useChartTokens()
  return (
    <div className="rounded-xl bg-surface-container-lowest border border-outline px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container-low ring-1 ring-inset ring-outline shrink-0" style={{ color: color ?? categorical[0] }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className="text-lg font-bold tabular-nums tracking-tight text-on-surface" style={color ? { color } : undefined}>{value}</p>
        {sub && <p className="text-[10px] text-on-surface-variant/90 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// deriveLists agora roda no servidor (suggestionEngine.deriveLists sobre a base
// completa) e vem no resultado como `lists`.

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: SuggestionResult }

// ─── Painel principal ──────────────────────────────────────────
export default function SuggestedScorePanel() {
  const store = useAppStore()
  const tokens = useChartTokens()

  // Sincroniza as categorias dinâmicas (do snapshot) com as configs das engines
  // — necessário para o "Aplicar" gravar a nota dos índices dinâmicos.
  useEffect(() => {
    store.syncPaymentForms(realPaymentForms)
    store.syncCommercialLists({
      seller: realCommercial.sellers.map((e) => ({ key: e.value, label: e.value })),
      plan: realCommercial.plans.map((e) => ({ key: e.value, label: e.value })),
      planValue: realCommercial.values.map((e) => ({ key: String(e.value), label: formatCurrency(e.value) })),
      city: realCommercial.cities.map((e) => ({ key: e.value, label: e.value })),
      neighborhood: realCommercial.neighborhoods.map((e) => ({ key: e.value, label: e.value })),
      clientGender: realCommercial.clientGenders.map((e) => ({ key: e.value, label: genderLabel(e.value) })),
      sellerGender: realCommercial.sellerGenders.map((e) => ({ key: e.value, label: genderLabel(e.value) })),
    })
    store.syncConnectionLists({ equipment: realConnection.models.map((e) => ({ key: e.value, label: e.value })) })
    store.syncFieldLists({
      reasons: realField.reasons.map((e) => ({ key: e.value, label: e.value })),
      technician: realField.technicians.map((e) => ({ key: e.value, label: e.value })),
    })
    store.syncInstallationLists({ technician: realInstallation.technicians.map((e) => ({ key: e.value, label: e.value })) })
    store.syncRelationshipLists({
      protocolType: realRelationship.types.map((e) => ({ key: e.value, label: e.value })),
      attendant: realRelationship.attendants.map((e) => ({ key: e.value, label: e.value })),
    })
    store.syncNetworkLists({
      site: realNetwork.sites.map((e) => ({ key: e.value, label: e.value })),
      concentrator: realNetwork.concentrators.map((e) => ({ key: e.value, label: e.value })),
      accessPoint: realNetwork.accessPoints.map((e) => ({ key: e.value, label: e.value })),
      splitter: realNetwork.splitters.map((e) => ({ key: e.value, label: e.value })),
      slot: realNetwork.slots.map((e) => ({ key: e.value, label: e.value })),
      pon: realNetwork.pons.map((e) => ({ key: e.value, label: e.value })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [from, setFrom] = useState(daysAgoISO(365))
  const [to, setTo] = useState(todayISO())
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [exporting, setExporting] = useState(false)

  // Nomenclaturas vigentes dos indicadores (editáveis em /configuracoes).
  // O servidor devolve os nomes de fábrica — aqui trocamos pelo nome atual
  // para a tela (e o PDF) ficarem coerentes com o resto do sistema.
  const labelMap = useIndicatorLabelMap()

  // Gera o PDF (KPIs + sugestões por módulo) — usa a janela efetiva do servidor.
  async function exportPdf() {
    if (!built || exporting) return
    setExporting(true)
    try {
      const { exportSuggestionsPdf } = await import('./exportPdf')
      await exportSuggestionsPdf(built, { from: built.window.from, to: built.window.to })
    } finally {
      setExporting(false)
    }
  }

  async function load(f: string, t: string) {
    setState({ status: 'loading' })
    try {
      const data = await fetchCancellationSuggestions(f, t)
      setState({ status: 'ready', data })
    } catch (e) {
      setState({ status: 'error', error: e instanceof ApiError ? e : new ApiError(0, 'Erro inesperado.') })
    }
  }
  useEffect(() => { load(from, to) /* carga inicial */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quando os coortes chegam, mescla as categorias que só aparecem entre
  // CANCELADOS (ex.: vendedor/modelo descontinuado) nas listas da store — senão
  // o "Aplicar" nesses índices seria no-op (a chave não existiria em indices).
  useEffect(() => {
    if (state.status !== 'ready') return
    const L = state.data.lists // derivada no servidor (base completa ∪ cancelados)
    const snap = (arr: { value: string | number }[]) => arr.map((e) => ({ key: String(e.value), label: String(e.value) }))
    const merge = (base: { key: string; label: string }[], extra: { key: string; label: string }[]) => {
      const seen = new Set(base.map((b) => b.key))
      return [...base, ...extra.filter((e) => !seen.has(e.key))]
    }
    store.syncPaymentForms([...new Set([...realPaymentForms, ...L.paymentForms.map((x) => x.key)])])
    store.syncCommercialLists({
      seller: merge(snap(realCommercial.sellers), L.sellers),
      plan: merge(snap(realCommercial.plans), L.plans),
      planValue: merge(realCommercial.values.map((e) => ({ key: String(e.value), label: formatCurrency(e.value) })), L.planValues),
      city: merge(snap(realCommercial.cities), L.cities),
      neighborhood: merge(snap(realCommercial.neighborhoods), L.neighborhoods),
      clientGender: merge(realCommercial.clientGenders.map((e) => ({ key: e.value, label: genderLabel(e.value) })), L.clientGenders),
      sellerGender: merge(realCommercial.sellerGenders.map((e) => ({ key: e.value, label: genderLabel(e.value) })), L.sellerGenders),
    })
    store.syncConnectionLists({ equipment: merge(snap(realConnection.models), L.models) })
    store.syncFieldLists({ reasons: merge(snap(realField.reasons), L.reasons), technician: merge(snap(realField.technicians), L.fieldTechnicians) })
    store.syncInstallationLists({ technician: merge(snap(realInstallation.technicians), L.installTechnicians) })
    store.syncRelationshipLists({ protocolType: merge(snap(realRelationship.types), L.relTypes), attendant: merge(snap(realRelationship.attendants), L.attendants) })
    store.syncNetworkLists({
      site: merge(snap(realNetwork.sites), L.netSites),
      concentrator: merge(snap(realNetwork.concentrators), L.netConcentrators),
      accessPoint: merge(snap(realNetwork.accessPoints), L.netAccessPoints),
      splitter: merge(snap(realNetwork.splitters), L.netSplitters),
      slot: merge(snap(realNetwork.slots), L.netSlots),
      pon: merge(snap(realNetwork.pons), L.netPons),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function applyPreset(days: number) {
    const t = todayISO(); const f = daysAgoISO(days)
    setFrom(f); setTo(t); load(f, t)
  }

  // O lift já vem calculado do servidor (base completa materializada) — só
  // renomeamos os indicadores conforme a nomenclatura configurada.
  const built = useMemo<SuggestionResult | null>(() => {
    if (state.status !== 'ready') return null
    const rename = (ind: IndicatorSuggestion): IndicatorSuggestion => ({
      ...ind,
      indicatorLabel: resolveIndicatorLabel(labelMap, ind.engineKey, ind.indicatorKey, ind.indicatorLabel),
    })
    return {
      ...state.data,
      groups: state.data.groups.map((g) => ({ ...g, indicators: g.indicators.map(rename) })),
    }
  }, [state, labelMap])
  // Cobertura real da base: 'full' (ETL noturno completo) vs 'sample' (amostra
  // de dev). Rotula o KPI com honestidade — em dev a base ativa é uma amostra.
  const isFullBase = built?.meta?.coverage === 'full'

  // Dispatch por engine: lê a nota atual e grava a sugestão (acesso genérico → any localizado).
  const DISPATCH: Record<SuggestionEngineKey, { config: any; setIndicator: (k: any, p: any) => void; setIndex: (k: any, i: string, p: number) => void }> = {
    financial: { config: store.financialConfig, setIndicator: store.updateFinancialIndicator, setIndex: store.updateFinancialIndex },
    commercial: { config: store.commercialConfig, setIndicator: store.updateCommercialIndicator, setIndex: store.updateCommercialIndex },
    connection: { config: store.connectionConfig, setIndicator: store.updateConnectionIndicator, setIndex: store.updateConnectionIndex },
    network: { config: store.networkConfig, setIndicator: store.updateNetworkIndicator, setIndex: store.updateNetworkIndex },
    field: { config: store.fieldConfig, setIndicator: store.updateFieldIndicator, setIndex: store.updateFieldIndex },
    installation: { config: store.installationConfig, setIndicator: store.updateInstallationIndicator, setIndex: store.updateInstallationIndex },
    relationship: { config: store.relationshipConfig, setIndicator: store.updateRelationshipIndicator, setIndex: store.updateRelationshipIndex },
  }
  const currentOf = (ind: IndicatorSuggestion, indexKey: string): number => {
    const cfg = DISPATCH[ind.engineKey].config
    const indicator = cfg.indicators[ind.indicatorKey]
    if (!indicator) return 0
    if (ind.presence) return indicator.points ?? 0
    return (indicator.indices ?? []).find((i: any) => i.key === indexKey)?.points ?? 0
  }
  const applyOne = (ind: IndicatorSuggestion, idx: IndexSuggestion) => {
    if (idx.suggestedPoints === null) return
    const d = DISPATCH[ind.engineKey]
    if (ind.presence) d.setIndicator(ind.indicatorKey, { points: idx.suggestedPoints })
    else d.setIndex(ind.indicatorKey, idx.indexKey, idx.suggestedPoints)
  }
  const applyAll = (ind: IndicatorSuggestion) => {
    ind.indices.forEach((idx) => { if (idx.suggestedPoints !== null) applyOne(ind, idx) })
  }

  return (
    <div className="space-y-5">
      {/* Banner explicativo */}
      <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-[11px] text-on-surface/70 leading-relaxed">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-primary" />
        <p>
          <strong className="text-on-surface">Pontuação sugerida pela IA (dados reais).</strong> Para cada indicador,
          comparamos a prevalência do atributo entre <strong className="text-risk-critical">quem cancelou no período</strong> e
          a <strong className="text-risk-low">base ativa</strong>. O <strong className="text-on-surface">lift</strong> vira a
          pontuação: mais comum em quem cancela → risco (negativo); mais comum em quem fica → protetor (positivo).
          Clique numa linha para ver <em>como cheguei no número</em>.
        </p>
      </div>

      {/* Barra de período */}
      <Card className="shadow-card-md">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 px-5 py-4">
          <div className="flex items-center gap-2 text-on-surface/85">
            <CalendarRange size={16} className="text-primary" />
            <span className="text-sm font-semibold">Período de cancelamento</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">De</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                className="h-8 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface px-2.5 focus:outline-none focus:border-primary/50" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Até</span>
              <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)}
                className="h-8 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface px-2.5 focus:outline-none focus:border-primary/50" />
            </label>
            <button onClick={() => load(from, to)} disabled={state.status === 'loading'}
              className="h-8 flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3.5 text-[11px] font-semibold text-on-primary shadow-glow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0">
              {state.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Analisar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
            {PRESETS.map((p) => (
              <button key={p.days} onClick={() => applyPreset(p.days)}
                className="text-[10px] px-2.5 py-1.5 rounded-lg border border-outline text-on-surface/70 hover:text-on-surface hover:border-outline-strong transition-all">
                {p.label}
              </button>
            ))}
            <span className="w-px h-5 bg-outline mx-1 hidden sm:block" />
            <button
              onClick={exportPdf}
              disabled={state.status !== 'ready' || exporting}
              title="Exporta os KPIs e as sugestões de pontuação em PDF"
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
              Exportar PDF
            </button>
          </div>
        </div>
      </Card>

      {/* Estados */}
      {state.status === 'loading' && (
        <div className="flex items-center gap-2 rounded-xl border border-outline bg-surface-container-lowest px-5 py-10 text-sm text-on-surface/70">
          <Loader2 size={16} className="animate-spin" /> Calculando o lift na base…
        </div>
      )}

      {state.status === 'error' && (
        <div className="rounded-xl border border-outline bg-surface-container-lowest px-5 py-6 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-risk-critical">
            {state.error.status === 401 ? <Lock size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium text-on-surface">
                {state.error.status === 0 ? 'Servidor indisponível' : state.error.status === 401 ? 'Sessão expirada' : 'Não foi possível calcular as sugestões'}
              </p>
              <p className="mt-0.5 text-[12px] text-on-surface/70">{state.error.message}</p>
              {state.error.status === 0 && (
                <p className="mt-1.5 text-[11px] text-on-surface-variant">Depende do backend (<span className="font-mono">/api</span>) com acesso ao banco. Suba com <span className="font-mono">npm run api</span>.</p>
              )}
            </div>
          </div>
          <button onClick={() => load(from, to)} className="flex items-center gap-1.5 rounded-md border border-outline px-3 py-1.5 text-[12px] text-on-surface/85 hover:border-outline-strong hover:text-on-surface transition-colors">
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {state.status === 'ready' && built && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={<Users size={15} />} label={isFullBase ? 'Base ativa (completa)' : 'Base ativa (amostra)'} value={state.data.activeCount.toLocaleString('pt-BR')} sub={isFullBase ? 'contratos analisados' : 'amostra de dev — completa no servidor'} />
            <Kpi icon={<TrendingDown size={15} />} label="Cancelados no período" value={state.data.cancelledCount.toLocaleString('pt-BR')} sub={`${fmtDateBR(from)} – ${fmtDateBR(to)}`} color={tokens.riskCritical} />
            <Kpi icon={<Database size={15} />} label="Indicadores" value={String(built.indicatorCount)} sub={`${built.indexCount} índices avaliados`} />
            <Kpi icon={<TrendingDown size={15} />} label="Sinais de risco" value={String(built.riskCount)} sub="índices com lift > 1" color={tokens.riskHigh} />
          </div>

          {/* Janela materializada de madrugada — o filtro de data trabalha dentro dela */}
          {state.data.materializedWindow && (
            <div className="flex items-start gap-2.5 rounded-xl border border-outline bg-surface-container-lowest/60 px-4 py-2.5 text-[11px] text-on-surface-variant leading-relaxed">
              <Info size={14} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <p>
                Base atualizada de madrugada. Cancelados disponíveis de{' '}
                <strong className="text-on-surface/70">{fmtDateBR(state.data.materializedWindow.from)}</strong> a{' '}
                <strong className="text-on-surface/70">{fmtDateBR(state.data.materializedWindow.to)}</strong>{' '}
                ({state.data.materializedWindow.count.toLocaleString('pt-BR')} contratos) — o filtro de data acima opera dentro dessa janela.
              </p>
            </div>
          )}

          {/* Nota: Rede fora — só enquanto não houver sinal de massiva nos cancelados */}
          {!built.groups.some((g) => g.engineKey === 'network') && (
            <div className="flex items-start gap-2.5 rounded-xl border border-outline bg-surface-container-lowest/60 px-4 py-3 text-[11px] text-on-surface-variant leading-relaxed">
              <Network size={15} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <p><strong className="text-on-surface/70">Rede</strong> ainda sem sinal de massiva nos cancelados do período — entra automaticamente assim que o ETL materializar a infra de rede dos cancelados (via histórico de conexão).</p>
            </div>
          )}

          {/* Nota: Quedas de PPPoE fora — só enquanto os cancelados não tiverem sinal de ONU */}
          {!built.groups.some((g) => g.indicators.some((i) => i.indicatorKey.startsWith('onu'))) && (
            <div className="flex items-start gap-2.5 rounded-xl border border-outline bg-surface-container-lowest/60 px-4 py-3 text-[11px] text-on-surface-variant leading-relaxed">
              <Wifi size={15} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <p>
                <strong className="text-on-surface/70">Quedas de PPPoE (Conexão)</strong> ainda sem sinal de ONU materializado
                nos cancelados — os indicadores por status (power_fail, loss_signal, …) entram automaticamente no lift
                assim que o ETL casar eventos do AutoISP com a coorte de cancelados (linha <span className="font-mono">Cancelados/ONU</span> no log do ETL).
              </p>
            </div>
          )}

          {/* Grupos por engine */}
          <Card className="shadow-card-md">
            <CardHeader title="Indicadores × pontuação sugerida" subtitle="Ordenado por impacto dentro de cada indicador" icon={<Sparkles size={14} />} />
            <div className="px-5 py-4 space-y-5">
              {built.groups.length === 0 ? (
                <p className="text-center text-sm text-on-surface-variant py-6">Nenhum cancelamento no período selecionado.</p>
              ) : (
                built.groups.map((g, i) => (
                  <EngineSection key={g.engineKey} label={g.engineLabel} indicators={g.indicators} defaultOpen={i === 0} currentOf={currentOf} onApply={applyOne} onApplyAll={applyAll} />
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
