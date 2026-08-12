import { useEffect, useMemo, useState } from 'react'
import {
  Truck, PackageCheck, PackageX, Repeat, Users, UserMinus, UserCheck, Loader2,
  Search, AlertTriangle, PackageOpen, CalendarRange, RefreshCw,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn, formatCurrency } from '@/utils/cn'
import { realWithdrawals, coverageLabel, type RealWithdrawalTech, type RealWithdrawalPerson } from '@/data/realClients'
import { fetchWithdrawalDetail, ApiError, type WithdrawalProtocol, type WithdrawalDetail } from './withdrawalsApi'

const fmtDateBR = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const PEOPLE_PAGE = 12
const MIN_FOR_RATE = 5

function rateColor(rate: number): string {
  if (rate >= 0.7) return '#10b981'
  if (rate >= 0.4) return '#f59e0b'
  return '#ef4444'
}
const pct = (v: number) => `${Math.round(v * 100)}%`
const RETRIEVED = '#10b981'
const NOT_RETRIEVED = '#ef4444'

// ─── Agregação por período (recomputada no cliente a partir dos protocolos) ──
interface Agg {
  total: number; retrieved: number; notRetrieved: number; successRate: number; avgVisits: number
  byStatus: { active: { total: number; retrieved: number }; cancelled: { total: number; retrieved: number } }
  technicians: RealWithdrawalTech[]
  visitsHistogram: { visits: string; count: number }[]
}
function aggregate(protocols: WithdrawalProtocol[]): Agg {
  const st = { active: { total: 0, retrieved: 0 }, cancelled: { total: 0, retrieved: 0 } }
  const techMap = new Map<string, { protocols: number; retrieved: number; visits: number }>()
  const histo: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4+': 0 }
  let total = 0, retrieved = 0, visitsSum = 0
  for (const p of protocols) {
    total++
    const got = p.r === 1
    if (got) retrieved++
    visitsSum += p.v
    const b = p.x === 1 ? st.cancelled : st.active
    b.total++; if (got) b.retrieved++
    const name = (p.t || '').trim() || '(sem técnico)'
    const tm = techMap.get(name) || { protocols: 0, retrieved: 0, visits: 0 }
    tm.protocols++; if (got) tm.retrieved++; tm.visits += p.v
    techMap.set(name, tm)
    const k = p.v >= 4 ? '4+' : String(p.v || 1)
    histo[k] = (histo[k] || 0) + 1
  }
  const technicians = [...techMap.entries()]
    .map(([value, t]) => ({
      value, protocols: t.protocols, retrieved: t.retrieved,
      successRate: t.protocols ? t.retrieved / t.protocols : 0,
      avgVisits: t.protocols ? t.visits / t.protocols : 0,
    }))
    .sort((a, b) => b.protocols - a.protocols)
  return {
    total, retrieved, notRetrieved: total - retrieved,
    successRate: total ? retrieved / total : 0,
    avgVisits: total ? visitsSum / total : 0,
    byStatus: st, technicians,
    visitsHistogram: ['1', '2', '3', '4+'].map((k) => ({ visits: k, count: histo[k] || 0 })),
  }
}

// ─── Período ───────────────────────────────────────────────────
type PeriodKey = 'all' | '30' | '90' | 'year' | 'custom'
const todayISO = () => new Date().toISOString().slice(0, 10)
const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const PRESETS: { key: PeriodKey; label: string; range: () => { from: string; to: string } }[] = [
  { key: 'all', label: 'Tudo', range: () => ({ from: '', to: '' }) },
  { key: '30', label: 'Últimos 30 dias', range: () => ({ from: daysAgoISO(30), to: todayISO() }) },
  { key: '90', label: 'Últimos 90 dias', range: () => ({ from: daysAgoISO(90), to: todayISO() }) },
  { key: 'year', label: 'Este ano', range: () => ({ from: `${todayISO().slice(0, 4)}-01-01`, to: todayISO() }) },
]
const inRange = (d: string | null, from: string, to: string) => !!d && (!from || d >= from) && (!to || d <= to)

// ─── Tooltips ──────────────────────────────────────────────────
const TechTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const t: RealWithdrawalTech = payload[0].payload
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl min-w-[180px]">
      <p className="text-gray-200 font-semibold mb-1 truncate">{t.value}</p>
      <p className="text-gray-400">Protocolos: <strong className="text-gray-200">{t.protocols}</strong></p>
      <p className="text-gray-400">Retirados: <strong style={{ color: rateColor(t.successRate) }}>{t.retrieved} ({pct(t.successRate)})</strong></p>
      <p className="text-gray-400">Visitas/protocolo: <strong className="text-gray-200">{t.avgVisits.toFixed(1)}</strong></p>
    </div>
  )
}
const StatusTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-300 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (<p key={p.dataKey} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>))}
    </div>
  )
}

// ─── Retiradas × Cancelamentos (nível pessoa, já filtrado por período) ──────
type RecoveredFilter = 'all' | 'yes' | 'no'
function CancelledWithdrawalSection({ people, cancelledTotal, windowLabel }: { people: RealWithdrawalPerson[]; cancelledTotal: number; windowLabel: string }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RecoveredFilter>('all')
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [query, filter, people])

  const kpis = useMemo(() => {
    let recovered = 0, notRecovered = 0, mrrAtRisk = 0
    for (const p of people) { if (p.recovered) recovered++; else { notRecovered++; mrrAtRisk += p.monthlyValue || 0 } }
    const withWithdrawal = people.length
    return { withWithdrawal, recovered, notRecovered, mrrAtRisk, recoveryRate: withWithdrawal ? recovered / withWithdrawal : 0 }
  }, [people])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (filter === 'yes' && !p.recovered) return false
      if (filter === 'no' && p.recovered) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || String(p.contractNumber).toLowerCase().includes(q)
    })
  }, [people, query, filter])

  const totalPages = Math.max(1, Math.ceil(rows.length / PEOPLE_PAGE))
  const pageRows = rows.slice(page * PEOPLE_PAGE, page * PEOPLE_PAGE + PEOPLE_PAGE)
  const withPct = cancelledTotal ? kpis.withWithdrawal / cancelledTotal : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserMinus size={14} className="text-risk-critical" />
        <h2 className="text-sm font-bold text-white">Retiradas × Cancelamentos</h2>
        {windowLabel && <span className="text-[11px] text-gray-500">coorte de cancelados: {windowLabel}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Cancelados com retirada" value={kpis.withWithdrawal.toLocaleString('pt-BR')} subtitle={cancelledTotal ? `${pct(withPct)} dos ${cancelledTotal.toLocaleString('pt-BR')} cancelados` : 'no período'} icon={<UserMinus size={14} />} variant="brand" />
        <KpiCard label="Equipamento recuperado" value={pct(kpis.recoveryRate)} subtitle={`${kpis.recovered.toLocaleString('pt-BR')} de ${kpis.withWithdrawal.toLocaleString('pt-BR')} retirados`} icon={<PackageCheck size={14} />} variant="success" iconColor="text-risk-low" />
        <KpiCard label="Equipamento em risco" value={kpis.notRecovered.toLocaleString('pt-BR')} subtitle="cancelados sem retirada concluída" icon={<PackageX size={14} />} variant="danger" iconColor="text-risk-critical" />
        <KpiCard label="MRR do equipamento em risco" value={formatCurrency(kpis.mrrAtRisk)} subtitle="mensalidade dos não recuperados" icon={<AlertTriangle size={14} />} variant="warning" />
      </div>

      <Card>
        <CardHeader
          title="Clientes cancelados com retirada de equipamento"
          subtitle={`${rows.length.toLocaleString('pt-BR')} cliente(s)`}
          icon={<PackageOpen size={14} />}
          action={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-app-surface border border-app-border">
                {([['all', 'Todos'], ['yes', 'Recuperado'], ['no', 'Em aberto']] as [RecoveredFilter, string][]).map(([k, lbl]) => (
                  <button key={k} onClick={() => setFilter(k)} className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition-all', filter === k ? 'bg-gradient-brand text-white shadow-glow' : 'text-gray-400 hover:text-gray-200')}>{lbl}</button>
                ))}
              </div>
              <div className="relative flex items-center">
                <Search size={12} className="absolute left-2.5 text-gray-500 pointer-events-none" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome / contrato"
                  className="pl-7 pr-2.5 h-8 w-44 text-xs bg-app-surface border border-app-border rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all" />
              </div>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border bg-app-surface/50">
                {['Cliente', 'Cancelado em', 'Motivo', 'Mensalidade', 'Visitas', 'Motoboy', 'Equipamento'].map((h) => (
                  <th key={h} className={cn('px-4 py-2.5 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap', (h === 'Mensalidade' || h === 'Visitas') && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={`${p.contractNumber}-${p.name}`} className="border-b border-app-border hover:bg-app-surface/70 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium text-gray-200 truncate max-w-[200px]">{p.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono">#{p.contractNumber} · {p.city}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-risk-critical">{fmtDateBR(p.cancellationDate)}</td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-400 truncate max-w-[200px]" title={p.cancellationMotive || ''}>{p.cancellationMotive || '—'}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-300 text-right">{formatCurrency(p.monthlyValue)}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-400 text-right">{p.visits}{p.protocols > 1 ? ` · ${p.protocols}p` : ''}</td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-400 truncate max-w-[160px]" title={p.technicians.join(', ')}>{p.technicians[0] || '—'}{p.technicians.length > 1 ? ` +${p.technicians.length - 1}` : ''}</td>
                  <td className="px-4 py-2.5">
                    {p.recovered
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-risk-low bg-risk-low/10"><PackageCheck size={11} /> Recuperado</span>
                      : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-risk-critical bg-risk-critical/10"><PackageX size={11} /> Em aberto</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-500">Nenhum cliente nesse período/filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
          <span className="text-[10px] text-gray-500">
            {rows.length > 0 ? `${(page * PEOPLE_PAGE + 1).toLocaleString('pt-BR')}–${Math.min((page + 1) * PEOPLE_PAGE, rows.length).toLocaleString('pt-BR')} de ${rows.length.toLocaleString('pt-BR')}` : '—'}
          </span>
          <div className="flex gap-1.5 items-center">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Anterior</button>
            <span className="text-[10px] text-gray-500 px-1 font-mono">{page + 1}/{totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Próxima</button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Seletor de período ────────────────────────────────────────
function PeriodFilter({ presetKey, from, to, onPreset, onFrom, onTo }: {
  presetKey: PeriodKey; from: string; to: string
  onPreset: (k: PeriodKey) => void; onFrom: (v: string) => void; onTo: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <CalendarRange size={14} className="text-brand-blue shrink-0" />
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-app-surface border border-app-border">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => onPreset(p.key)}
            className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition-all', presetKey === p.key ? 'bg-gradient-brand text-white shadow-glow' : 'text-gray-400 hover:text-gray-200')}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} title="De"
          className={cn('h-8 px-2 text-xs bg-app-surface border rounded-lg text-gray-300 focus:outline-none focus:border-brand-blue/50', presetKey === 'custom' ? 'border-brand-blue/40' : 'border-app-border')} />
        <span className="text-gray-600 text-xs">—</span>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} title="Até"
          className={cn('h-8 px-2 text-xs bg-app-surface border rounded-lg text-gray-300 focus:outline-none focus:border-brand-blue/50', presetKey === 'custom' ? 'border-brand-blue/40' : 'border-app-border')} />
      </div>
    </div>
  )
}

type TechSort = 'protocols' | 'successRate'
type State =
  | { status: 'loading' }
  | { status: 'error'; msg: string }
  | { status: 'ready'; detail: WithdrawalDetail }

export default function EquipmentWithdrawalPage() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [sort, setSort] = useState<TechSort>('successRate')
  const [presetKey, setPresetKey] = useState<PeriodKey>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    fetchWithdrawalDetail()
      .then((detail) => { if (alive) setState({ status: 'ready', detail }) })
      .catch((e) => { if (alive) setState({ status: 'error', msg: e instanceof ApiError ? e.message : 'Erro inesperado.' }) })
    return () => { alive = false }
  }, [reloadKey])

  const applyPreset = (k: PeriodKey) => {
    setPresetKey(k)
    const preset = PRESETS.find((p) => p.key === k)
    if (preset) { const r = preset.range(); setFrom(r.from); setTo(r.to) }
  }

  const detail = state.status === 'ready' ? state.detail : null
  const filteredProtocols = useMemo(
    () => (!detail ? [] : presetKey === 'all' ? detail.protocols : detail.protocols.filter((p) => inRange(p.d, from, to))),
    [detail, presetKey, from, to],
  )
  const agg = useMemo(() => aggregate(filteredProtocols), [filteredProtocols])
  const filteredPeople = useMemo(
    () => (!detail ? [] : presetKey === 'all' ? detail.people : detail.people.filter((p) => inRange(p.lastDate, from, to))),
    [detail, presetKey, from, to],
  )

  const techData = useMemo(() => {
    const base = sort === 'successRate'
      ? agg.technicians.filter((t) => t.protocols >= MIN_FOR_RATE && t.value !== '(sem técnico)')
      : agg.technicians
    return [...base]
      .sort((a, b) => (sort === 'successRate' ? b.successRate - a.successRate : b.protocols - a.protocols))
      .slice(0, 12)
  }, [agg.technicians, sort])

  const statusData = useMemo(() => {
    const mk = (label: string, s: { total: number; retrieved: number }) => ({ label, retrieved: s.retrieved, notRetrieved: s.total - s.retrieved })
    return [mk('Ativos', agg.byStatus.active), mk('Cancelados', agg.byStatus.cancelled)]
  }, [agg.byStatus])

  const cc = realWithdrawals.cancellation
  const windowLabel = cc?.window ? `${fmtDateBR(cc.window.from)} – ${fmtDateBR(cc.window.to)}` : ''
  const periodLabel = presetKey === 'all' ? 'todo o período' : `${from ? fmtDateBR(from) : '…'} a ${to ? fmtDateBR(to) : '…'}`

  const header = (
    <div className="rounded-2xl border border-app-border bg-app-card shadow-card-md px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0"><Truck size={16} className="text-white" /></div>
          <div>
            <h1 className="text-lg font-bold gradient-text tracking-tight leading-none">Retiradas de Equipamento</h1>
            <p className="text-[11px] text-gray-500 mt-1">Processo de retirada: sucesso, visitas e desempenho dos motoboys — cancelados × ativos</p>
          </div>
        </div>
        <PeriodFilter
          presetKey={presetKey} from={from} to={to}
          onPreset={applyPreset}
          onFrom={(v) => { setPresetKey('custom'); setFrom(v) }}
          onTo={(v) => { setPresetKey('custom'); setTo(v) }}
        />
      </div>
    </div>
  )

  if (state.status === 'loading') {
    return (
      <div className="space-y-6 animate-slide-up">
        {header}
        <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-card px-5 py-16 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Carregando protocolos de retirada…
        </div>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-6 animate-slide-up">
        {header}
        <div className="rounded-xl border border-app-border bg-app-card px-5 py-6 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-rose-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div><p className="font-medium text-gray-100">Não foi possível carregar as retiradas</p><p className="mt-0.5 text-[12px] text-gray-400">{state.msg}</p></div></div>
          <button onClick={() => setReloadKey((k) => k + 1)} className="flex items-center gap-1.5 rounded-md border border-app-border px-3 py-1.5 text-[12px] text-gray-300 hover:border-app-borderLight hover:text-gray-100 transition-colors"><RefreshCw size={13} /> Tentar novamente</button>
        </div>
      </div>
    )
  }

  const activeRate = agg.byStatus.active.total ? agg.byStatus.active.retrieved / agg.byStatus.active.total : 0
  const cancelledRate = agg.byStatus.cancelled.total ? agg.byStatus.cancelled.retrieved / agg.byStatus.cancelled.total : 0

  return (
    <div className="space-y-6 animate-slide-up">
      {header}

      {agg.total === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-card px-5 py-12 text-center text-sm text-gray-400">
          <Truck size={22} className="mx-auto mb-3 text-gray-600" />
          Nenhum protocolo de retirada no período selecionado ({periodLabel}).
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Protocolos de retirada" value={agg.total.toLocaleString('pt-BR')} subtitle={`${agg.technicians.filter((t) => t.value !== '(sem técnico)').length} motoboys · ${periodLabel}`} icon={<Users size={14} />} variant="brand" />
            <KpiCard label="Taxa de retirada" value={pct(agg.successRate)} subtitle={`${agg.retrieved.toLocaleString('pt-BR')} retirados · ${agg.notRetrieved.toLocaleString('pt-BR')} não`} icon={<PackageCheck size={14} />} variant="success" iconColor="text-risk-low" />
            <KpiCard label="Média de visitas" value={agg.avgVisits.toFixed(1)} subtitle="por protocolo" icon={<Repeat size={14} />} variant="default" />
            <KpiCard label="Retirada: ativo × cancelado" value={`${pct(activeRate)} · ${pct(cancelledRate)}`} subtitle={`${agg.byStatus.active.total} ativos · ${agg.byStatus.cancelled.total} cancelados`} icon={<UserCheck size={14} />} variant={cancelledRate < activeRate ? 'warning' : 'default'} />
          </div>

          {/* Ranking de motoboys */}
          <Card>
            <CardHeader
              title="Desempenho dos motoboys"
              subtitle={sort === 'successRate' ? `Top por taxa de retirada (mín. ${MIN_FOR_RATE} protocolos)` : 'Top por volume de protocolos'}
              icon={<Truck size={14} />}
              action={
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-app-surface border border-app-border">
                  {([['successRate', 'Taxa'], ['protocols', 'Volume']] as [TechSort, string][]).map(([k, lbl]) => (
                    <button key={k} onClick={() => setSort(k)} className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition-all', sort === k ? 'bg-gradient-brand text-white shadow-glow' : 'text-gray-400 hover:text-gray-200')}>{lbl}</button>
                  ))}
                </div>
              }
            />
            <div className="p-4" style={{ height: Math.max(220, techData.length * 30 + 40) }}>
              {techData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">Sem motoboys com dados suficientes no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={techData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--app-border))" horizontal={false} />
                    <XAxis type="number" domain={sort === 'successRate' ? [0, 1] : [0, 'dataMax']} tickFormatter={(v) => (sort === 'successRate' ? pct(v) : String(v))} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="value" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={150} />
                    <Tooltip content={<TechTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey={sort} radius={[0, 4, 4, 0]} barSize={18}>
                      {techData.map((t, i) => <Cell key={i} fill={rateColor(t.successRate)} />)}
                      <LabelList dataKey={sort} position="right" formatter={(v: number) => (sort === 'successRate' ? pct(v) : String(v))} style={{ fill: '#9ca3af', fontSize: 10 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Situação + histograma */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Retirada por situação do contrato" subtitle="Retirados × não retirados entre ativos e cancelados" icon={<UserMinus size={14} />} />
              <div className="p-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--app-border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<StatusTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="retrieved" name="Retirado" stackId="s" fill={RETRIEVED} barSize={64} />
                    <Bar dataKey="notRetrieved" name="Não retirado" stackId="s" fill={NOT_RETRIEVED} radius={[4, 4, 0, 0]} barSize={64} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Visitas por protocolo" subtitle="Quantos protocolos precisaram de 1, 2, 3 ou 4+ visitas" icon={<Repeat size={14} />} />
              <div className="p-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.visitsHistogram} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--app-border))" vertical={false} />
                    <XAxis dataKey="visits" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<StatusTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="count" name="Protocolos" fill="#ffb000" radius={[4, 4, 0, 0]} barSize={48}>
                      <LabelList dataKey="count" position="top" style={{ fill: '#9ca3af', fontSize: 10 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Retiradas × Cancelamentos (pessoas, filtradas pelo período) */}
          <CancelledWithdrawalSection people={filteredPeople} cancelledTotal={cc?.cancelledTotal ?? 0} windowLabel={windowLabel} />
        </>
      )}

      <p className="text-[10px] text-gray-500 text-center">
        {coverageLabel()} · filtro por data do desfecho da retirada · {periodLabel}
      </p>
    </div>
  )
}
