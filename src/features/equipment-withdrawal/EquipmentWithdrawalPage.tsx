import { useEffect, useMemo, useState } from 'react'
import {
  Truck, PackageCheck, PackageX, Repeat, Users, UserMinus, UserCheck, Loader2,
  Search, AlertTriangle, PackageOpen,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn, formatCurrency } from '@/utils/cn'
import {
  realWithdrawals, coverageLabel, isRealDataLoaded, loadRealData,
  type RealWithdrawalTech, type RealWithdrawalPerson,
} from '@/data/realClients'

const fmtDateBR = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const PEOPLE_PAGE = 12

// Verde (bom) → âmbar → vermelho (ruim), conforme a taxa de sucesso.
function rateColor(rate: number): string {
  if (rate >= 0.7) return '#10b981'
  if (rate >= 0.4) return '#f59e0b'
  return '#ef4444'
}
const pct = (v: number) => `${Math.round(v * 100)}%`
const RETRIEVED = '#10b981'
const NOT_RETRIEVED = '#ef4444'

// Tooltip do ranking de motoboys.
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
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

// ─── Retiradas × Cancelamentos (nível pessoa) ──────────────────
type RecoveredFilter = 'all' | 'yes' | 'no'

function CancelledWithdrawalSection() {
  const w = realWithdrawals
  const cc = w.cancellation
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RecoveredFilter>('all')
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [query, filter])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return w.people.filter((p) => {
      if (filter === 'yes' && !p.recovered) return false
      if (filter === 'no' && p.recovered) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || String(p.contractNumber).toLowerCase().includes(q)
    })
  }, [w.people, query, filter])

  const totalPages = Math.max(1, Math.ceil(rows.length / PEOPLE_PAGE))
  const pageRows = rows.slice(page * PEOPLE_PAGE, page * PEOPLE_PAGE + PEOPLE_PAGE)

  if (!cc || cc.cancelledTotal === 0) return null
  const withPct = cc.cancelledTotal ? cc.withWithdrawal / cc.cancelledTotal : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserMinus size={14} className="text-risk-critical" />
        <h2 className="text-sm font-bold text-white">Retiradas × Cancelamentos</h2>
        <span className="text-[11px] text-gray-500">cancelados de {fmtDateBR(cc.window.from)} a {fmtDateBR(cc.window.to)}</span>
      </div>

      {/* KPIs de recuperação de equipamento dos cancelados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Cancelados com retirada" value={cc.withWithdrawal.toLocaleString('pt-BR')} subtitle={`${pct(withPct)} dos ${cc.cancelledTotal.toLocaleString('pt-BR')} cancelados`} icon={<UserMinus size={14} />} variant="brand" />
        <KpiCard label="Equipamento recuperado" value={pct(cc.recoveryRate)} subtitle={`${cc.recovered.toLocaleString('pt-BR')} de ${cc.withWithdrawal.toLocaleString('pt-BR')} retirados`} icon={<PackageCheck size={14} />} variant="success" iconColor="text-risk-low" />
        <KpiCard label="Equipamento em risco" value={cc.notRecovered.toLocaleString('pt-BR')} subtitle="cancelados sem retirada concluída" icon={<PackageX size={14} />} variant="danger" iconColor="text-risk-critical" />
        <KpiCard label="MRR do equipamento em risco" value={formatCurrency(cc.mrrAtRisk)} subtitle="mensalidade dos não recuperados" icon={<AlertTriangle size={14} />} variant="warning" />
      </div>

      {/* Tabela de pessoas */}
      <Card>
        <CardHeader
          title="Clientes cancelados com retirada de equipamento"
          subtitle={`${rows.length.toLocaleString('pt-BR')} cliente(s)${w.peopleTotal > w.people.length ? ` · mostrando os ${w.people.length.toLocaleString('pt-BR')} mais recentes de ${w.peopleTotal.toLocaleString('pt-BR')}` : ''}`}
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
              {pageRows.map((p: RealWithdrawalPerson) => (
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
                <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-500">Nenhum cliente com esses filtros.</td></tr>
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

type TechSort = 'protocols' | 'successRate'

export default function EquipmentWithdrawalPage() {
  const [ready, setReady] = useState(isRealDataLoaded())
  const [sort, setSort] = useState<TechSort>('successRate')

  // A tela lê o snapshot já carregado no boot; se cair aqui direto, garante o load.
  useEffect(() => {
    if (ready) return
    let alive = true
    loadRealData().then(() => alive && setReady(true)).catch(() => alive && setReady(true))
    return () => { alive = false }
  }, [ready])

  const w = realWithdrawals

  // Para "melhores motoboys" por taxa, exige um mínimo de protocolos (tira ruído
  // de quem fez 1 e acertou 100%). Por volume, mostra os mais atuantes.
  const MIN_FOR_RATE = 5
  const techData = useMemo(() => {
    const base = sort === 'successRate'
      ? w.technicians.filter((t) => t.protocols >= MIN_FOR_RATE && t.value !== '(sem técnico)')
      : w.technicians
    return [...base]
      .sort((a, b) => (sort === 'successRate' ? b.successRate - a.successRate : b.protocols - a.protocols))
      .slice(0, 12)
  }, [w.technicians, sort])

  const statusData = useMemo(() => {
    const mk = (label: string, s: { total: number; retrieved: number }) => ({
      label, retrieved: s.retrieved, notRetrieved: s.total - s.retrieved,
      total: s.total, rate: s.total ? s.retrieved / s.total : 0,
    })
    return [mk('Ativos', w.byStatus.active), mk('Cancelados', w.byStatus.cancelled)]
  }, [w.byStatus])

  if (!ready) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-card px-5 py-16 text-sm text-gray-400 animate-slide-up">
        <Loader2 size={16} className="animate-spin" /> Carregando dados de retiradas…
      </div>
    )
  }

  if (!w.total) {
    return (
      <div className="rounded-xl border border-app-border bg-app-card px-5 py-12 text-center text-sm text-gray-400 animate-slide-up">
        <Truck size={22} className="mx-auto mb-3 text-gray-600" />
        Nenhum protocolo de retirada no snapshot atual.
        <p className="mt-1 text-[11px] text-gray-500">Rode o ETL (<span className="font-mono">node scripts/fetch-clients.mjs</span>) para materializar os dados.</p>
      </div>
    )
  }

  const activeRate = w.byStatus.active.total ? w.byStatus.active.retrieved / w.byStatus.active.total : 0
  const cancelledRate = w.byStatus.cancelled.total ? w.byStatus.cancelled.retrieved / w.byStatus.cancelled.total : 0

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Cabeçalho */}
      <div className="rounded-2xl border border-app-border bg-app-card shadow-card-md px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0">
            <Truck size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text tracking-tight leading-none">Retiradas de Equipamento</h1>
            <p className="text-[11px] text-gray-500 mt-1">Processo de retirada: sucesso, visitas e desempenho dos motoboys — cancelados × ativos</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Protocolos de retirada" value={w.total.toLocaleString('pt-BR')} subtitle={`${w.technicians.filter((t) => t.value !== '(sem técnico)').length} motoboys`} icon={<Users size={14} />} variant="brand" />
        <KpiCard label="Taxa de retirada" value={pct(w.successRate)} subtitle={`${w.retrieved.toLocaleString('pt-BR')} retirados · ${w.notRetrieved.toLocaleString('pt-BR')} não`} icon={<PackageCheck size={14} />} variant="success" iconColor="text-risk-low" />
        <KpiCard label="Média de visitas" value={w.avgVisits.toFixed(1)} subtitle="por protocolo" icon={<Repeat size={14} />} variant="default" />
        <KpiCard
          label="Retirada: ativo × cancelado"
          value={`${pct(activeRate)} · ${pct(cancelledRate)}`}
          subtitle={`${w.byStatus.active.total} ativos · ${w.byStatus.cancelled.total} cancelados`}
          icon={<UserCheck size={14} />}
          variant={cancelledRate < activeRate ? 'warning' : 'default'}
        />
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
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition-all', sort === k ? 'bg-gradient-brand text-white shadow-glow' : 'text-gray-400 hover:text-gray-200')}
                >
                  {lbl}
                </button>
              ))}
            </div>
          }
        />
        <div className="p-4" style={{ height: Math.max(220, techData.length * 30 + 40) }}>
          {techData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">Sem motoboys com dados suficientes.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={techData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--app-border))" horizontal={false} />
                <XAxis
                  type="number"
                  domain={sort === 'successRate' ? [0, 1] : [0, 'dataMax']}
                  tickFormatter={(v) => (sort === 'successRate' ? pct(v) : String(v))}
                  tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
                />
                <YAxis type="category" dataKey="value" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={150} />
                <Tooltip content={<TechTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey={sort} radius={[0, 4, 4, 0]} barSize={18}>
                  {techData.map((t, i) => <Cell key={i} fill={rateColor(t.successRate)} />)}
                  <LabelList
                    dataKey={sort}
                    position="right"
                    formatter={(v: number) => (sort === 'successRate' ? pct(v) : String(v))}
                    style={{ fill: '#9ca3af', fontSize: 10 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Cancelado × ativo + distribuição de visitas */}
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
                <Bar dataKey="retrieved" name="Retirado" stackId="s" fill={RETRIEVED} radius={[0, 0, 0, 0]} barSize={64} />
                <Bar dataKey="notRetrieved" name="Não retirado" stackId="s" fill={NOT_RETRIEVED} radius={[4, 4, 0, 0]} barSize={64} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Visitas por protocolo" subtitle="Quantos protocolos precisaram de 1, 2, 3 ou 4+ visitas" icon={<Repeat size={14} />} />
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={w.visitsHistogram} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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

      {/* Retiradas × Cancelamentos (pessoas) */}
      <CancelledWithdrawalSection />

      <p className="text-[10px] text-gray-500 text-center">
        {coverageLabel()} · retiradas materializadas no snapshot (base completa de protocolos)
      </p>
    </div>
  )
}
