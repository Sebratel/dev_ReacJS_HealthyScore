import { useEffect, useMemo, useState } from 'react'
import {
  AlarmClock, Search, Download, Loader2, AlertTriangle, RefreshCw, Info,
  ChevronDown, ChevronRight, Sparkles,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { cn, formatCurrency } from '@/utils/cn'
import { useAppStore } from '@/store/appStore'
import { realByCity } from '@/data/realClients'
import { HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { useHealthColors } from '@/hooks/useHealthColors'
import { useChartTokens } from '@/hooks/useChartTokens'
import { softenColor } from '@/utils/healthColors'
import type { ChartTokens } from '@/utils/chartTokens'
import { fetchChurnForecast, ApiError, type ForecastRow } from './churnForecastApi'
import type { HealthClassification } from '@/types'

const PAGE_SIZE = 25
const QTY_OPTS = [50, 100, 250, 500, 1000]
const CLASS_OPTS: { key: 'all' | HealthClassification; label: string }[] = [
  { key: 'all', label: 'Todas em risco' },
  { key: 'critical', label: HEALTH_LABELS.critical },
  { key: 'high_risk', label: HEALTH_LABELS.high_risk },
  { key: 'attention', label: HEALTH_LABELS.attention },
]

// Cor da urgência pela janela mediana (dias): quanto menor, mais urgente.
// Reaproveita a rampa ordinal de risco — aqui "low" significa "menos urgente",
// não "saudável": todas as linhas desta tela já são clientes em risco.
function urgencyColor(t: ChartTokens, days: number): string {
  if (days <= 30) return t.riskCritical
  if (days <= 90) return t.riskHigh
  if (days <= 180) return t.riskMedium
  return t.riskLow
}
const fmtWindow = (d: number) => (d <= 0 ? 'iminente' : d < 60 ? `~${d} dias` : `~${Math.round(d / 30)} meses`)
const fmtTenure = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)} anos` : `${Math.round(d / 30)} meses`)
const confLabel = (n: number) => (n < 20 ? 'baixa' : n < 100 ? 'média' : 'alta')

// Efeito "IA digitando" — mesmo padrão da tela de IA Preditiva. Não é LLM: é
// narrativa determinística ancorada nos dados, com cara de IA.
function TypewriterText({ text, speed = 8 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setShown(''); setDone(false)
    let i = 0
    const id = setInterval(() => {
      if (i < text.length) { setShown(text.slice(0, i + 1)); i++ }
      else { setDone(true); clearInterval(id) }
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])
  return <span>{shown}{!done && <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 align-middle animate-pulse" />}</span>
}

// Narrativa (grounded): enquadramento, sinais que mais pesam, janela + confiança
// e uma recomendação de ação. O número vem SEMPRE da estatística.
function narrative(r: ForecastRow): string {
  const meses = Math.round(r.tenureDays / 30)
  const s = r.signals
  const drivers: string[] = []
  if (s.relCancelThreats > 0) drivers.push(`${s.relCancelThreats} ameaça(s) de cancelamento`)
  if (s.overdue > 0) drivers.push(`${s.overdue} fatura(s) em atraso/aberto`)
  if (s.renegotiations > 0) drivers.push(`${s.renegotiations} renegociação(ões)`)
  if (s.slaLateCount > 0) drivers.push(`${s.slaLateCount} atendimento(s) com SLA estourado`)
  if (s.netMassiveCount > 0) drivers.push(`${s.netMassiveCount} massiva(s) de rede`)
  if (s.trustReleases > 0) drivers.push(`${s.trustReleases} desbloqueio(s) por confiança`)
  const driverTxt = drivers.length
    ? `Os sinais que mais pesam: ${drivers.slice(0, 4).join(', ')}. `
    : 'Sem sinais críticos isolados — o risco vem do conjunto do perfil. '
  const urg = r.windowMedianDays <= 30 ? 'A janela é curta — priorize o contato imediato.'
    : r.windowMedianDays <= 90 ? 'Há espaço para uma ação de retenção no curto prazo.'
    : 'O risco existe, mas com prazo mais folgado para agir.'
  return `${r.customerName} está classificado como ${HEALTH_LABELS[r.classification as HealthClassification]} `
    + `(health ${r.overallHealth}) e é cliente há ${meses} meses. ${driverTxt}`
    + `Comparando com cancelados de perfil semelhante que passaram desse tempo de contrato, a estimativa é de `
    + `cancelamento em ${fmtWindow(r.windowMedianDays)} (faixa ${r.windowP25Days}–${r.windowP75Days} dias), `
    + `com confiança ${confLabel(r.sampleN)} (${r.sampleN} casos). ${urg} `
    + `É uma faixa de risco estatística, não uma data garantida.`
}

const CSV_COLS: { label: string; value: (r: ForecastRow) => string | number }[] = [
  { label: 'Cliente', value: (r) => r.customerName },
  { label: 'Contrato', value: (r) => r.contractNumber || r.customerId },
  { label: 'Cidade', value: (r) => r.city },
  { label: 'Plano', value: (r) => r.plan },
  { label: 'Mensalidade', value: (r) => r.monthlyValue },
  { label: 'Health', value: (r) => r.overallHealth },
  { label: 'Classificacao', value: (r) => HEALTH_LABELS[r.classification as HealthClassification] },
  { label: 'Tempo de contrato (dias)', value: (r) => r.tenureDays },
  { label: 'Janela estimada (dias)', value: (r) => r.windowMedianDays },
  { label: 'Janela p25 (dias)', value: (r) => r.windowP25Days },
  { label: 'Janela p75 (dias)', value: (r) => r.windowP75Days },
  { label: 'Confianca (n cancelados)', value: (r) => r.sampleN },
  { label: 'Receita em risco', value: (r) => Math.round(r.revenueRisk) },
]
function toCsv(rows: ForecastRow[]): string {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [CSV_COLS.map((c) => esc(c.label)).join(';'), ...rows.map((r) => CSV_COLS.map((c) => esc(c.value(r))).join(';'))].join('\n')
}

function Row({ r, rank }: { r: ForecastRow; rank: number }) {
  const [open, setOpen] = useState(false)
  const tokens = useChartTokens()
  const palette = useHealthColors()
  const uc = urgencyColor(tokens, r.windowMedianDays)
  return (
    <>
      <tr className="border-b border-outline hover:bg-surface-container-low/60 cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-3 py-2.5 text-[10px] font-mono text-on-surface-variant/90 text-right">{rank}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown size={11} className="text-on-surface-variant/90 shrink-0" /> : <ChevronRight size={11} className="text-on-surface-variant/90 shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs font-medium text-on-surface truncate max-w-[190px]">{r.customerName}</p>
              <p className="text-[10px] text-on-surface-variant font-mono">#{r.contractNumber || r.customerId} · {r.city}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums" style={{ color: uc }}>{fmtWindow(r.windowMedianDays)}</span>
            <span className="text-[10px] text-on-surface-variant">{r.windowP25Days}–{r.windowP75Days}d</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: palette[r.classification as HealthClassification], background: softenColor(palette[r.classification as HealthClassification], 0.08) }}>
            {HEALTH_LABELS[r.classification as HealthClassification]}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right text-xs font-mono" style={{ color: palette[r.classification as HealthClassification], fontWeight: 700 }}>{r.overallHealth}</td>
        <td className="px-3 py-2.5 text-right text-xs font-mono text-on-surface/70">{fmtTenure(r.tenureDays)}</td>
        <td className="px-3 py-2.5 text-right text-xs font-mono text-on-surface/85">{formatCurrency(r.monthlyValue)}</td>
        <td className="px-3 py-2.5 text-right text-[10px] text-on-surface-variant">{confLabel(r.sampleN)}</td>
      </tr>
      {open && (
        <tr className="border-b border-outline bg-surface-container-low/40">
          <td colSpan={8} className="px-5 py-3">
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[12px] text-on-surface/85 leading-relaxed"><TypewriterText text={narrative(r)} /></p>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

type State = { status: 'loading' } | { status: 'error'; msg: string } | { status: 'ready'; rows: ForecastRow[]; total: number }

export default function ChurnForecastPage() {
  const s = useAppStore()
  const cities = useMemo(() => realByCity.map((c) => c.city).filter(Boolean), [])
  const [qty, setQty] = useState(100)
  const [classification, setClassification] = useState<'all' | HealthClassification>('all')
  const [city, setCity] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    const configs = {
      financial: s.financialConfig, commercial: s.commercialConfig, connection: s.connectionConfig,
      network: s.networkConfig, field: s.fieldConfig, installation: s.installationConfig, relationship: s.relationshipConfig,
    }
    fetchChurnForecast({ configs, thresholds: s.healthThresholds, topN: qty, city: city || undefined, classification: classification === 'all' ? undefined : classification })
      .then((d) => { if (alive) setState({ status: 'ready', rows: d.rows, total: d.total }) })
      .catch((e) => { if (alive) setState({ status: 'error', msg: e instanceof ApiError ? e.message : 'Erro inesperado.' }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, classification, city, reloadKey])

  useEffect(() => { setPage(0) }, [query, qty, classification, city])

  const allRows = state.status === 'ready' ? state.rows : []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter((r) => r.customerName.toLowerCase().includes(q) || String(r.contractNumber).toLowerCase().includes(q) || r.city.toLowerCase().includes(q))
  }, [allRows, query])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const kpis = useMemo(() => {
    const in30 = filtered.filter((r) => r.windowMedianDays <= 30)
    const in90 = filtered.filter((r) => r.windowMedianDays <= 90)
    const mrr30 = in30.reduce((a, r) => a + r.monthlyValue, 0)
    return { in30: in30.length, in90: in90.length, mrr30 }
  }, [filtered])

  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(filtered)}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `previsao-cancelamento-${classification === 'all' ? 'todos' : classification}-${filtered.length}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Cabeçalho */}
      <div className="rounded-2xl border border-outline bg-surface-container-lowest shadow-card-md px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-danger flex items-center justify-center shadow-glow-danger shrink-0"><AlarmClock size={16} className="text-on-primary" /></div>
          <div>
            <h1 className="text-lg font-bold gradient-text tracking-tight leading-none">Previsão de Cancelamento</h1>
            <p className="text-[11px] text-on-surface-variant mt-1">Clientes em risco ordenados por urgência — janela estimada de cancelamento a partir de hoje</p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-[11px] text-on-surface-variant leading-relaxed">
          <Info size={13} className="text-primary shrink-0 mt-0.5" />
          <p>A janela vem da <strong className="text-on-surface/70">sobrevivência real dos cancelados</strong> com perfil semelhante (mediana e faixa p25–p75), medida a partir do tempo de contrato atual. É uma <strong className="text-on-surface/70">faixa de risco</strong>, não uma data garantida. Clique numa linha para o racional.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Em risco (listados)" value={filtered.length.toLocaleString('pt-BR')} subtitle="janela estimada calculável" icon={<AlarmClock size={14} />} variant="brand" />
        <KpiCard label="Janela ≤ 30 dias" value={kpis.in30.toLocaleString('pt-BR')} subtitle="mais urgentes" icon={<AlertTriangle size={14} />} variant="danger" iconColor="text-risk-critical" />
        <KpiCard label="Janela ≤ 90 dias" value={kpis.in90.toLocaleString('pt-BR')} subtitle="próximo trimestre" icon={<AlarmClock size={14} />} variant="warning" />
        <KpiCard label="MRR em risco ≤ 30d" value={formatCurrency(kpis.mrr30)} subtitle="mensalidade dos mais urgentes" icon={<AlertTriangle size={14} />} variant="danger" iconColor="text-risk-critical" />
      </div>

      <Card>
        <CardHeader title="Fila de risco" subtitle="Ordenado do prazo mais curto para o mais longo" icon={<AlarmClock size={14} />} />

        {/* Filtros */}
        <div className="flex items-end justify-between gap-3 px-5 py-3 border-b border-outline flex-wrap">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Quantidade</span>
              <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50">
                {QTY_OPTS.map((n) => <option key={n} value={n}>{n} clientes</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Classificação</span>
              <select value={classification} onChange={(e) => setClassification(e.target.value as any)} className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50">
                {CLASS_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Cidade</span>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50">
                <option value="">Todas</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-on-surface-variant pointer-events-none" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar (nome, contrato, cidade)…"
                className="pl-8 pr-3 h-8 w-56 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface/85 placeholder-on-surface-variant/90 focus:outline-none focus:border-primary/50" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-on-surface-variant font-mono">{filtered.length.toLocaleString('pt-BR')} clientes</span>
            <button onClick={exportCsv} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium disabled:opacity-30">
              <Download size={12} /> Exportar CSV
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        {state.status === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-on-surface/70"><Loader2 size={16} className="animate-spin" /> Calculando as janelas de cancelamento…</div>
        ) : state.status === 'error' ? (
          <div className="px-5 py-8 space-y-3">
            <div className="flex items-start gap-2.5 text-sm text-risk-critical"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div><p className="font-medium text-on-surface">Não foi possível calcular a previsão</p><p className="mt-0.5 text-[12px] text-on-surface/70">{state.msg}</p></div></div>
            <button onClick={() => setReloadKey((k) => k + 1)} className="flex items-center gap-1.5 rounded-md border border-outline px-3 py-1.5 text-[12px] text-on-surface/85 hover:border-outline-strong hover:text-on-surface transition-colors"><RefreshCw size={13} /> Tentar novamente</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline bg-surface-container-low/50">
                    {['#', 'Cliente', 'Janela estimada', 'Classificação', 'Health', 'Contrato', 'Mensalidade', 'Confiança'].map((h, i) => (
                      <th key={h} className={cn('px-3 py-2.5 text-[10px] text-on-surface-variant uppercase tracking-wider font-medium whitespace-nowrap', i >= 3 ? 'text-right' : i === 0 ? 'text-right' : 'text-left')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => <Row key={r.customerId} r={r} rank={page * PAGE_SIZE + i + 1} />)}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-on-surface-variant">Nenhum cliente em risco com janela calculável para esses filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-outline">
              <span className="text-[10px] text-on-surface-variant">{filtered.length === 0 ? '0' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)}`} de {filtered.length.toLocaleString('pt-BR')}</span>
              <div className="flex gap-1.5">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-outline text-on-surface/70 disabled:opacity-30 hover:border-outline-strong transition-all">Anterior</button>
                <span className="text-[10px] text-on-surface-variant px-1 py-1 font-mono">{page + 1}/{totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-outline text-on-surface/70 disabled:opacity-30 hover:border-outline-strong transition-all">Próxima</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
