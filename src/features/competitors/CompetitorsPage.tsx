import { useMemo, useState } from 'react'
import { Building2, MapPin, Wifi, TrendingDown, DollarSign, Users, ChevronDown, ChevronUp, Brain, Zap } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { buildCompetitorData } from './competitorsEngine'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import type { Competitor } from '@/types'

const SIZE_LABEL: Record<Competitor['size'], string> = {
  micro: 'Micro',
  pequeno: 'Pequeno',
  médio: 'Médio',
  grande: 'Grande',
}
const SIZE_COLOR: Record<Competitor['size'], string> = {
  micro: '#64748b',
  pequeno: '#f59e0b',
  médio: '#f97316',
  grande: '#ef4444',
}
const TECH_COLOR: Record<string, string> = {
  Fibra: '#22d3ee',
  VDSL: '#a78bfa',
  Coaxial: '#f59e0b',
  Radio: '#f97316',
}

const IMPACT_COLOR = { high: '#ef4444', medium: '#f97316', low: '#f59e0b' }

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

function InsightCard({ insight }: { insight: { finding: string; confidence: number; affectedCount: number; impact: 'high' | 'medium' | 'low'; churnMultiplier: number } }) {
  const impactColor = IMPACT_COLOR[insight.impact]
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-app-card border border-app-border hover:border-app-borderLight transition-all">
      <div className="shrink-0 mt-0.5">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${impactColor}20` }}>
          <Brain size={12} style={{ color: impactColor }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200 leading-relaxed">{insight.finding}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-gray-500">Confiança: <span className="text-brand-cyan font-mono">{insight.confidence}%</span></span>
          <span className="text-[10px] text-gray-500">Afetados: <span className="font-mono text-gray-300">{insight.affectedCount}</span></span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: impactColor, background: `${impactColor}15` }}>
            {insight.impact === 'high' ? 'Alto impacto' : insight.impact === 'medium' ? 'Médio impacto' : 'Baixo impacto'}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-gray-500">Multiplicador</p>
        <p className="text-sm font-bold font-mono" style={{ color: impactColor }}>{insight.churnMultiplier.toFixed(1)}x</p>
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-200 mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-gray-200 font-medium">{typeof p.value === 'number' && p.value > 100 ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

function CompetitorRow({ comp }: { comp: Competitor }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        className="border-b border-app-border hover:bg-white/5 cursor-pointer transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
            <span className="text-gray-100 font-medium text-sm">{comp.name}</span>
          </div>
        </td>
        <td className="py-3 px-4 text-xs text-gray-300">{comp.city}</td>
        <td className="py-3 px-4 text-xs text-gray-300">{comp.neighborhood}</td>
        <td className="py-3 px-4 text-xs text-gray-500">{comp.street ?? <span className="text-gray-700">—</span>}</td>
        <td className="py-3 px-4">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: SIZE_COLOR[comp.size] + '22', color: SIZE_COLOR[comp.size] }}
          >
            {SIZE_LABEL[comp.size]}
          </span>
        </td>
        <td className="py-3 px-4 text-xs text-gray-200 font-mono">{fmt(comp.accessCount)}</td>
        <td className="py-3 px-4">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: TECH_COLOR[comp.technology] + '22', color: TECH_COLOR[comp.technology] }}>
            {comp.technology}
          </span>
        </td>
        <td className="py-3 px-4 text-xs text-gray-300">
          {new Date(comp.entryDate).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
        </td>
        <td className="py-3 px-4 text-xs font-mono text-rose-400">
          R$ {comp.lowestPrice.toFixed(2).replace('.', ',')}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-card/40">
          <td colSpan={9} className="px-6 py-4">
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wide">Planos oferecidos</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {comp.plans.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 bg-app-surface border border-app-border rounded-lg px-3 py-2">
                    <Wifi size={12} className="text-brand-cyan" />
                    <div>
                      <span className="text-xs text-gray-300 font-medium">{p.speed}</span>
                      <span className="text-[10px] text-gray-500 ml-1">{p.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs text-emerald-400 font-mono font-semibold">R$ {p.price.toFixed(2).replace('.', ',')}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin size={11} />
                  {comp.street ? `${comp.street}, ` : ''}{comp.neighborhood} — {comp.city}
                </span>
                <span>Tecnologia: <span className="text-gray-300">{comp.technology}</span></span>
                <span>Entrada: <span className="text-gray-300">{new Date(comp.entryDate).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span></span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function CompetitorsPage() {
  const data = useMemo(() => buildCompetitorData(), [])
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [sizeFilter, setSizeFilter] = useState<string>('all')

  const cities = useMemo(() => Array.from(new Set(data.competitors.map((c) => c.city))).sort(), [data.competitors])

  const filtered = useMemo(() => {
    return data.competitors.filter((c) => {
      if (cityFilter !== 'all' && c.city !== cityFilter) return false
      if (sizeFilter !== 'all' && c.size !== sizeFilter) return false
      return true
    })
  }, [cityFilter, sizeFilter])

  const pieData = data.sizeBreakdown.map((s) => ({
    name: SIZE_LABEL[s.size as Competitor['size']],
    value: s.count,
    color: SIZE_COLOR[s.size as Competitor['size']],
  }))

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
              <Building2 size={13} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-white">Competidores</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-mono">v1.0</span>
          </div>
          <p className="text-[11px] text-gray-500">Mapeamento competitivo — cidade · bairro · rua · porte · acessos · data entrada · plano · preço</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] bg-app-card border border-app-border px-3 py-1.5 rounded-lg">
          <Zap size={10} className="text-brand-cyan" />
          <span className="font-mono text-brand-cyan">{data.totalCompetitors} concorrentes mapeados</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Concorrentes Mapeados"
          value={String(data.totalCompetitors)}
          icon={<Building2 size={16} />}
          subtitle="na área de cobertura"
        />
        <KpiCard
          label="Acessos Competidores"
          value={fmt(data.totalCompetitorAccesses)}
          icon={<Users size={16} />}
          subtitle={`${data.citiesAffected} cidades afetadas`}
          variant="warning"
        />
        <KpiCard
          label="Menor Preço Concorrente"
          value={`R$ ${data.avgLowestPrice.toFixed(2).replace('.', ',')}`}
          icon={<DollarSign size={16} />}
          subtitle="média dos pacotes mais baratos"
          variant="danger"
        />
        <KpiCard
          label="Hotspot de Risco"
          value={data.hotspotCity}
          icon={<MapPin size={16} />}
          subtitle={data.hotspotNeighborhood}
          variant="warning"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* City access bar */}
        <Card className="lg:col-span-2">
          <CardHeader title="Acessos por Cidade" subtitle="Total de conexões ativas dos concorrentes" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cityBreakdown} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="city" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="totalAccesses" name="Acessos" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Size distribution pie */}
        <Card>
          <CardHeader title="Porte dos Concorrentes" subtitle="Distribuição por tamanho" />
          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-300">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Price comparison + entry timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Price comparison */}
        <Card>
          <CardHeader title="Comparativo de Preços" subtitle="Nosso preço vs concorrentes por velocidade" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.priceComparison} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="speed" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip content={<CustomTooltip />} formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
                <Bar dataKey="ourPrice" name="Nosso preço" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgCompetitorPrice" name="Média concorrente" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="minCompetitorPrice" name="Mín concorrente" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-300">{v}</span>} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Entry timeline */}
        <Card>
          <CardHeader title="Entrada de Concorrentes" subtitle="Novos entrantes e acumulado histórico" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.entryTimeline} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="cumulative" name="Acumulado" stroke="#22d3ee" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="newEntries" name="Novos" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* City detail cards */}
      <Card>
        <CardHeader title="Análise por Cidade" subtitle="Presença competitiva e preço médio" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {data.cityBreakdown.map((c) => (
            <div key={c.city} className="bg-app-surface border border-app-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-100">{c.city}</span>
                <span className="text-xs text-gray-500">{c.competitors} concorr.</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <p className="text-gray-500">Acessos</p>
                  <p className="text-gray-200 font-mono font-medium">{fmt(c.totalAccesses)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Preço mín</p>
                  <p className="text-rose-400 font-mono font-medium">R$ {c.avgLowestPrice.toFixed(2).replace('.', ',')}</p>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-gray-500">Maior</p>
                  <p className="text-gray-300 truncate">{c.mostPresent}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Competitors table */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <CardHeader title="Detalhamento dos Concorrentes" subtitle="Clique em um item para ver os planos" />
          <div className="flex items-center gap-2">
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="text-xs bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-app-borderLight"
            >
              <option value="all">Todas as cidades</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="text-xs bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-app-borderLight"
            >
              <option value="all">Todos os portes</option>
              <option value="micro">Micro</option>
              <option value="pequeno">Pequeno</option>
              <option value="médio">Médio</option>
              <option value="grande">Grande</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-app-border">
                {['Concorrente', 'Cidade', 'Bairro', 'Rua', 'Porte', 'Acessos', 'Tecnologia', 'Entrada', 'Menor Preço'].map((h) => (
                  <th key={h} className="text-left py-2 px-4 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((comp) => (
                <CompetitorRow key={comp.id} comp={comp} />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-8">Nenhum concorrente para os filtros selecionados</p>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-2">{filtered.length} de {data.totalCompetitors} concorrentes</p>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader title="AI Insights — Análise Competitiva" subtitle="Padrões detectados pelo modelo ao correlacionar presença, preço e risco de churn por concorrência" icon={<Brain size={14} />} />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      </Card>

      {/* Price pressure insight */}
      <Card>
        <CardHeader title="Pressão de Preço por Velocidade" subtitle="Diferença entre nosso preço e o mínimo do mercado" />
        <div className="mt-3 space-y-3">
          {data.priceComparison.map((p) => {
            const diff = p.ourPrice - p.minCompetitorPrice
            const pct = (diff / p.ourPrice) * 100
            return (
              <div key={p.speed} className="flex items-center gap-4">
                <span className="text-xs text-gray-400 w-16 shrink-0">{p.speed}</span>
                <div className="flex-1 bg-app-surface rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, background: pct > 30 ? '#ef4444' : pct > 15 ? '#f97316' : '#22d3ee' }}
                  />
                </div>
                <div className="text-xs font-mono w-36 shrink-0 flex items-center gap-2">
                  <span className="text-gray-300">R$ {p.ourPrice.toFixed(2).replace('.', ',')}</span>
                  <span className="text-gray-600">vs</span>
                  <span className="text-rose-400">R$ {p.minCompetitorPrice.toFixed(2).replace('.', ',')}</span>
                </div>
                <span className={`text-xs font-semibold w-14 text-right shrink-0 ${diff > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {diff > 0 ? '+' : ''}{pct.toFixed(0)}%
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
          <TrendingDown size={11} className="text-rose-400" />
          Preços acima do mercado em todas as faixas de velocidade aumentam risco de churn por preço
        </p>
      </Card>
    </div>
  )
}
