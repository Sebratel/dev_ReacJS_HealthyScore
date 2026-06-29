import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  UserMinus, Ban, Filter, X, Save, Trash2, TrendingDown, Wallet,
  CalendarClock, RotateCcw, Sparkles, FlaskConical, Plus, Target,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { cn, formatCurrency } from '@/utils/cn'
import {
  CANCELLED, EMPTY_FILTERS, SAMPLE_PROFILES, PLANS, CITIES, PAYMENT_FORMS, REASONS,
  COMPETITORS, VALUE_BUCKETS, TENURE_BUCKETS, applyFilters, hasAnyFilter, describeFilters,
  segmentStats, type ProfileFilters, type CancellationProfile, type CancelledClient,
} from './mockData'

// Cor do "índice de risco" (lift) — mesma paleta de classificação das engines.
function liftColor(lift: number): string {
  if (lift >= 2) return '#ef4444'
  if (lift >= 1.6) return '#f97316'
  if (lift >= 1.25) return '#f59e0b'
  return '#10b981'
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const topReason = (() => {
  const m = new Map<string, number>()
  CANCELLED.forEach((c) => m.set(c.reason, (m.get(c.reason) || 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]
})()

// ─── Campo / Select reutilizável ───────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
      {children}
    </label>
  )
}
const selectCls =
  'h-8 w-full text-xs bg-app-surface border border-app-border rounded-lg text-gray-300 px-2.5 focus:outline-none focus:border-brand-blue/50 transition-all appearance-none cursor-pointer'

function Select({ value, onChange, allLabel, options }: {
  value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      <option value="">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ─── Painel de filtros (construtor de perfil) ──────────────────
function FilterPanel({ filters, onChange }: { filters: ProfileFilters; onChange: (f: ProfileFilters) => void }) {
  const set = (patch: Partial<ProfileFilters>) => onChange({ ...filters, ...patch })
  const active = hasAnyFilter(filters)
  return (
    <Card className="shadow-card-md">
      <CardHeader
        title="Construtor de perfil"
        subtitle="Combine filtros para isolar um padrão de cancelamento"
        icon={<Filter size={14} />}
        action={active ? (
          <button onClick={() => onChange({ ...EMPTY_FILTERS })} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-200 transition-colors">
            <X size={12} /> Limpar
          </button>
        ) : undefined}
      />
      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Field label="Plano">
          <Select value={filters.plan} onChange={(v) => set({ plan: v })} allLabel="Todos os planos"
            options={PLANS.map((p) => ({ value: p.name, label: p.name }))} />
        </Field>
        <Field label="Cidade">
          <Select value={filters.city} onChange={(v) => set({ city: v })} allLabel="Todas as cidades"
            options={CITIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Forma de pagamento">
          <Select value={filters.paymentForm} onChange={(v) => set({ paymentForm: v })} allLabel="Todas"
            options={PAYMENT_FORMS.map((p) => ({ value: p, label: p }))} />
        </Field>
        <Field label="Motivo do cancelamento">
          <Select value={filters.reason} onChange={(v) => set({ reason: v })} allLabel="Todos os motivos"
            options={REASONS.map((r) => ({ value: r, label: r }))} />
        </Field>
        <Field label="Concorrente">
          <Select value={filters.competitor} onChange={(v) => set({ competitor: v })} allLabel="Qualquer"
            options={COMPETITORS.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Faixa de valor">
          <Select value={filters.valueBucket} onChange={(v) => set({ valueBucket: v })} allLabel="Qualquer valor"
            options={VALUE_BUCKETS.map((b) => ({ value: b.key, label: b.label }))} />
        </Field>
        <Field label="Tempo até cancelar">
          <Select value={filters.tenureBucket} onChange={(v) => set({ tenureBucket: v })} allLabel="Qualquer tempo"
            options={TENURE_BUCKETS.map((b) => ({ value: b.key, label: b.label }))} />
        </Field>
        <Field label="Faturas atrasadas (mín.)">
          <Select value={String(filters.minLate)} onChange={(v) => set({ minLate: Number(v) })} allLabel="Qualquer"
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n}` }))} />
        </Field>
        <Field label="Protocolos (mín.)">
          <Select value={String(filters.minProtocols)} onChange={(v) => set({ minProtocols: Number(v) })} allLabel="Qualquer"
            options={[2, 4, 6, 8].map((n) => ({ value: String(n), label: `≥ ${n}` }))} />
        </Field>
        <label className="flex items-center gap-2 self-end h-8 cursor-pointer">
          <input type="checkbox" checked={filters.threatsOnly} onChange={(e) => set({ threatsOnly: e.target.checked })}
            className="accent-brand-blue h-3.5 w-3.5" />
          <span className="text-xs text-gray-300">Só com ameaça de cancelamento</span>
        </label>
      </div>
    </Card>
  )
}

// ─── Resumo do segmento + salvar perfil ─────────────────────────
function SegmentSummary({ filters, segment, onSave }: {
  filters: ProfileFilters; segment: CancelledClient[]; onSave: (name: string, points: number) => void
}) {
  const stats = useMemo(() => segmentStats(segment, CANCELLED), [segment])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [points, setPoints] = useState(stats.suggestedPoints)
  const color = liftColor(stats.lift)
  const active = hasAnyFilter(filters)
  const chips = describeFilters(filters)

  function openNaming() { setPoints(stats.suggestedPoints); setName(''); setNaming(true) }
  function confirm() {
    if (!name.trim()) return
    onSave(name.trim(), points)
    setNaming(false)
  }

  return (
    <Card className="shadow-card-md" glow={active ? 'danger' : 'none'}>
      <CardHeader
        title="Segmento atual"
        subtitle={active ? 'Cancelados que batem com os filtros' : 'Todos os cancelados (nenhum filtro aplicado)'}
        icon={<Target size={14} />}
        action={
          <button
            onClick={openNaming}
            disabled={!active || stats.count === 0}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-1.5 text-[11px] font-semibold text-white shadow-glow hover:-translate-y-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            <Plus size={13} /> Salvar como perfil
          </button>
        }
      />
      <div className="px-5 py-4 space-y-4">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-app-surface border border-app-border px-2 py-0.5 text-[10px] text-gray-300">{c}</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Metric label="Cancelados" value={stats.count.toLocaleString('pt-BR')} sub={`${stats.pctOfTotal.toFixed(0)}% do total`} />
          <Metric label="Ticket médio" value={formatCurrency(stats.avgTicket)} />
          <Metric label="Receita/mês" value={formatCurrency(stats.revenueLost)} sub="perdida" />
          <Metric label="Tempo médio" value={`${stats.avgTenure.toFixed(0)} m`} sub="até cancelar" />
          <Metric label="Índice de risco" value={`${stats.lift.toFixed(1)}×`} sub="vs média" color={color} />
          <Metric label="Pontos sugeridos" value={`+${stats.suggestedPoints}`} sub="churn risk" color={color} />
        </div>

        {naming && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-3">
            <Field label="Nome do perfil">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Inadimplência + Boleto"
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
                className="h-8 w-full sm:w-64 text-xs bg-app-surface border border-app-border rounded-lg text-gray-200 px-2.5 focus:outline-none focus:border-brand-blue/50" />
            </Field>
            <Field label="Pontos de churn risk">
              <input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} min={0} max={60}
                className="h-8 w-24 text-xs bg-app-surface border border-app-border rounded-lg text-gray-200 px-2.5 font-mono focus:outline-none focus:border-brand-blue/50" />
            </Field>
            <div className="flex items-center gap-2">
              <button onClick={confirm} disabled={!name.trim()} className="flex items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-[11px] font-semibold text-neutral-900 hover:bg-secondary transition disabled:opacity-40">
                <Save size={13} /> Salvar
              </button>
              <button onClick={() => setNaming(false)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-app-surface/60 border border-app-border px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums tracking-tight mt-0.5" style={color ? { color } : { color: '#e5e7eb' }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
    </div>
  )
}

// ─── Tabela de cancelados do segmento ──────────────────────────
function CancelledTable({ rows }: { rows: CancelledClient[] }) {
  const shown = rows.slice(0, 40)
  return (
    <Card className="shadow-card-md">
      <CardHeader title="Cancelados no segmento" subtitle={`${rows.length.toLocaleString('pt-BR')} cliente(s) · mostrando ${shown.length}`} icon={<Ban size={14} />} />
      <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-app-card">
            <tr className="border-b border-app-border">
              {['Cliente', 'Cidade', 'Plano', 'Valor', 'Tempo', 'Motivo', 'Atrasos', 'Protoc.', 'Ameaças', 'Equip.'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-b border-app-border/60 hover:bg-app-surface/50 transition-colors">
                <td className="px-3 py-2"><p className="text-xs font-medium text-gray-200 truncate max-w-[130px]">{c.name}</p><p className="text-[10px] text-gray-600 font-mono">{c.id}</p></td>
                <td className="px-3 py-2 text-[11px] text-gray-400">{c.city}</td>
                <td className="px-3 py-2 text-[11px] text-gray-300">{c.plan}</td>
                <td className="px-3 py-2 text-[11px] font-mono text-gray-300">{formatCurrency(c.monthlyValue)}</td>
                <td className="px-3 py-2 text-[11px] font-mono text-gray-400">{c.tenureMonths}m</td>
                <td className="px-3 py-2 text-[11px] text-gray-400 truncate max-w-[150px]">{c.reason}</td>
                <td className="px-3 py-2 text-center"><Cell n={c.lateInvoices} warn={c.lateInvoices >= 3} /></td>
                <td className="px-3 py-2 text-center"><Cell n={c.protocols} warn={c.protocols >= 4} /></td>
                <td className="px-3 py-2 text-center"><Cell n={c.cancelThreats} warn={c.cancelThreats >= 1} /></td>
                <td className="px-3 py-2 text-center text-[11px]">{c.equipmentReturned ? <span className="text-risk-low">✓</span> : <span className="text-risk-critical">pend.</span>}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-gray-500">Nenhum cancelado bate com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
function Cell({ n, warn }: { n: number; warn: boolean }) {
  return <span className={cn('text-[11px] font-mono', warn ? 'text-risk-high font-semibold' : 'text-gray-500')}>{n}</span>
}

// ─── Card de perfil salvo ───────────────────────────────────────
function ProfileCard({ profile, onDelete }: { profile: CancellationProfile; onDelete: () => void }) {
  const segment = useMemo(() => applyFilters(CANCELLED, profile.filters), [profile.filters])
  const stats = useMemo(() => segmentStats(segment, CANCELLED), [segment])
  const chips = describeFilters(profile.filters)
  return (
    <div className="rounded-xl border border-app-border bg-app-card p-4 flex flex-col gap-3 shadow-card hover:shadow-card-md hover:border-app-borderLight transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: profile.color }} />
          <h4 className="text-sm font-semibold text-gray-100 truncate">{profile.name}</h4>
        </div>
        <button onClick={onDelete} className="text-gray-600 hover:text-risk-critical transition-colors shrink-0" title="Excluir perfil">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => <span key={c} className="rounded-full bg-app-surface border border-app-border px-2 py-0.5 text-[10px] text-gray-400">{c}</span>)}
      </div>

      <div className="flex items-center gap-4 mt-auto pt-2 border-t border-app-border">
        <div><p className="text-[10px] text-gray-500 uppercase tracking-wider">Cancelados</p><p className="text-base font-bold text-gray-200 tabular-nums">{stats.count}</p></div>
        <div><p className="text-[10px] text-gray-500 uppercase tracking-wider">Índice</p><p className="text-base font-bold tabular-nums" style={{ color: liftColor(stats.lift) }}>{stats.lift.toFixed(1)}×</p></div>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pontuação</p>
          <p className="text-base font-bold text-brand-blue tabular-nums">+{profile.scorePoints} <span className="text-[10px] font-normal text-gray-500">pts</span></p>
        </div>
      </div>
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────
export default function CancellationProfilesPage() {
  const [filters, setFilters] = useState<ProfileFilters>({ ...EMPTY_FILTERS })
  const [profiles, setProfiles] = useState<CancellationProfile[]>(SAMPLE_PROFILES)
  const idRef = useRef(SAMPLE_PROFILES.length)

  const segment = useMemo(() => applyFilters(CANCELLED, filters), [filters])

  const kpis = useMemo(() => ({
    total: CANCELLED.length,
    avgTicket: avg(CANCELLED.map((c) => c.monthlyValue)),
    revenue: CANCELLED.reduce((a, c) => a + c.monthlyValue, 0),
    avgTenure: avg(CANCELLED.map((c) => c.tenureMonths)),
    returnRate: (CANCELLED.filter((c) => c.equipmentReturned).length / CANCELLED.length) * 100,
  }), [])

  function saveProfile(name: string, points: number) {
    const stats = segmentStats(segment, CANCELLED)
    idRef.current += 1
    setProfiles((p) => [
      { id: `p${idRef.current}`, name, filters: { ...filters }, scorePoints: points, color: liftColor(stats.lift) },
      ...p,
    ])
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-card-md">
        <div className="absolute -top-24 -right-12 w-80 h-80 rounded-full bg-gradient-danger opacity-[0.07] blur-3xl pointer-events-none animate-float" />
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-risk-critical/40 to-transparent" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-danger flex items-center justify-center shadow-glow-danger shrink-0">
                <UserMinus size={18} className="text-white" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold gradient-text tracking-tight">Perfis de Cancelamento</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                  <FlaskConical size={10} /> Mockup · dados ilustrativos
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 max-w-2xl leading-relaxed">
              Analise os clientes cancelados, isole padrões por filtros e salve-os como <strong className="text-gray-300">perfis de cancelamento</strong>.
              Cada perfil vira uma regra que ajusta a pontuação de churn dos clientes ativos — com base em dados reais.
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Cancelados (período)" value={kpis.total.toLocaleString('pt-BR')} icon={<Ban size={16} />} variant="danger" iconColor="text-risk-critical" />
        <KpiCard label="Ticket médio" value={formatCurrency(kpis.avgTicket)} icon={<Wallet size={16} />} />
        <KpiCard label="Receita perdida/mês" value={formatCurrency(kpis.revenue)} icon={<TrendingDown size={16} />} variant="warning" iconColor="text-risk-medium" />
        <KpiCard label="Tempo médio até cancelar" value={`${kpis.avgTenure.toFixed(0)} meses`} icon={<CalendarClock size={16} />} />
        <KpiCard label="Equip. devolvido" value={`${kpis.returnRate.toFixed(0)}%`} icon={<RotateCcw size={16} />} variant="success" iconColor="text-risk-low" />
      </div>

      {/* Construtor de filtros */}
      <FilterPanel filters={filters} onChange={setFilters} />

      {/* Resumo do segmento + salvar */}
      <SegmentSummary filters={filters} segment={segment} onSave={saveProfile} />

      {/* Tabela de cancelados */}
      <CancelledTable rows={segment} />

      {/* Perfis salvos */}
      <Card className="shadow-card-md">
        <CardHeader
          title="Perfis de cancelamento salvos"
          subtitle="Cada perfil aplica os pontos de churn risk aos clientes ativos que batem com seus filtros"
          icon={<Sparkles size={14} />}
        />
        <div className="px-5 py-4">
          {profiles.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-6">Nenhum perfil salvo ainda — monte um filtro acima e clique em “Salvar como perfil”.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {profiles.map((p) => (
                <ProfileCard key={p.id} profile={p} onDelete={() => setProfiles((prev) => prev.filter((x) => x.id !== p.id))} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Como vira pontuação */}
      <div className="flex items-start gap-2.5 rounded-xl border border-brand-blue/15 bg-brand-blue/5 px-4 py-3 text-[11px] text-gray-500">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-blue" />
        <p className="leading-relaxed">
          <strong className="text-gray-300">Como vira pontuação:</strong> ao confirmar um perfil, as mesmas queries (filtradas para a base ativa)
          identificam os clientes que batem com ele e somam os <strong className="text-gray-300">pontos de churn risk</strong> definidos — então o score
          passa a refletir padrões de cancelamento <em>reais</em>, não pesos arbitrários. Os valores aqui são ilustrativos até as telas/queries reais entrarem.
        </p>
      </div>
    </div>
  )
}
