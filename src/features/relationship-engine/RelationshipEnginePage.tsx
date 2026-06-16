import { useMemo, useState } from 'react'
import { MessageSquare, Star, TrendingDown, AlertTriangle, Phone, MessageCircle, Award, Brain, Zap, ArrowDownCircle, FileText } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'
import { buildRelationshipEngineData } from './relationshipEngine'
import { mockCustomers, mockProtocols } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import type { RelationshipEngineScore } from '@/types'

const CLASS_COLOR: Record<string, string> = {
  excellent: '#22d3ee', healthy: '#10b981', attention: '#f59e0b', high_risk: '#f97316', critical: '#ef4444',
}
const CLASS_LABEL: Record<string, string> = {
  excellent: 'Excelente', healthy: 'Saudável', attention: 'Atenção', high_risk: 'Alto Risco', critical: 'Crítico',
}

function fmt(n: number) { return n.toLocaleString('pt-BR') }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-200 mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-gray-200 font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="flex-1 bg-app-surface rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
    </div>
  )
}

const IMPACT_COLOR = { high: '#ef4444', medium: '#f97316', low: '#f59e0b' }

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
          <span className="text-[10px] text-gray-500">Afetados: <span className="font-mono text-gray-300">{fmt(insight.affectedCount)}</span></span>
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

const PAGE_SIZE = 15

// NPS score bar color
function npsColor(score: number) {
  if (score >= 9) return '#10b981'
  if (score >= 7) return '#f59e0b'
  return '#ef4444'
}

export default function RelationshipEnginePage() {
  const data = useMemo(() => buildRelationshipEngineData(mockCustomers, mockProtocols), [])
  const [page, setPage] = useState(0)
  const [classFilter, setClassFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return data.scores
      .filter((s) => {
        if (classFilter !== 'all' && s.classification !== classFilter) return false
        if (search && !s.customerName.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => a.relationshipScore - b.relationshipScore)
  }, [classFilter, search])

  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const radarData = data.attendantBreakdown.slice(0, 5).map((a) => ({
    attendant: a.name.split(' ')[0],
    Score: a.avgScore,
    NPS: a.avgNps * 10,
    SLA: Math.max(0, 100 - a.slaBreaches * 5),
  }))

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' }}>
              <MessageSquare size={13} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-white">Relationship Engine</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono">v1.0</span>
          </div>
          <p className="text-[11px] text-gray-500">Motor de relacionamento — Tickets · NPS · Sentimento · Scrapping · SLA</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] bg-app-card border border-app-border px-3 py-1.5 rounded-lg">
          <Zap size={10} className="text-brand-cyan" />
          <span className="font-mono text-brand-cyan">{data.scores.length} clientes analisados</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Score Relacionamento"
          value={String(data.avgRelationshipScore)}
          icon={<Star size={14} />}
          subtitle={`${data.criticalCount} críticos · ${data.highRiskCount} alto risco`}
          variant={data.avgRelationshipScore >= 61 ? 'success' : 'danger'}
        />
        <KpiCard
          label="NPS Médio"
          value={String(data.avgNps)}
          icon={<Award size={14} />}
          subtitle={`${data.totalNpsSurveysAnswered} pesquisas respondidas`}
          variant={data.avgNps >= 7 ? 'success' : 'warning'}
        />
        <KpiCard
          label="Quebras de SLA"
          value={fmt(data.totalSlaBreaches)}
          icon={<AlertTriangle size={14} />}
          subtitle="em todos os chamados"
          variant="danger"
        />
        <KpiCard
          label="Contatos Scrapping"
          value={fmt(data.totalNativeContacts + data.totalMatrixContacts)}
          icon={<Phone size={14} />}
          subtitle={`${fmt(data.totalNativeContacts)} native · ${fmt(data.totalMatrixContacts)} matrix`}
        />
      </div>

      {/* Score history + NPS breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Evolução do Relacionamento" subtitle="Score médio e NPS nos últimos 6 meses" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.scoreHistory} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line yAxisId="left" type="monotone" dataKey="avgScore" name="Score" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="avgNps" name="NPS" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-300">{v}</span>} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="NPS" subtitle="Promotores / Neutros / Detratores" />
          <div className="h-40 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.npsBreakdown} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={60} innerRadius={32}>
                  {data.npsBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-300">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 pb-3 space-y-1">
            {data.npsBreakdown.map((n) => (
              <div key={n.label} className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: n.color }} />
                  {n.label} <span className="text-gray-600">({n.scoreRange})</span>
                </span>
                <span className="font-mono text-gray-300">{n.count} <span className="text-gray-600">({n.pct}%)</span></span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* NPS Distribution + Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* NPS Score Distribution */}
        <Card>
          <CardHeader title="Distribuição de Notas NPS" subtitle={`${fmt(data.totalNpsSurveysAnswered)} pesquisas respondidas — distribuição por nota (0–10)`} icon={<Award size={14} />} />
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.npsScoreDistribution} margin={{ left: -10, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="score" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => String(v)} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Clientes" radius={[3, 3, 0, 0]}>
                  {data.npsScoreDistribution.map((entry) => (
                    <Cell key={entry.score} fill={npsColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 pb-3 flex items-center gap-4 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Promotores (9-10)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Neutros (7-8)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Detratores (0-6)</span>
          </div>
        </Card>

        {/* Sentiment */}
        <Card>
          <CardHeader title="Análise de Sentimentos" subtitle="IA classifica interações — nossa IA faz isso de forma automática" icon={<Brain size={14} />} />
          <div className="mt-3 space-y-3">
            {data.sentimentBreakdown.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-sm w-20 shrink-0">
                  {s.avgScore > 0.2 ? '😊' : s.avgScore > -0.2 ? '😐' : '😠'} {s.label}
                </span>
                <ScoreBar value={s.pct} max={100} color={s.color} />
                <span className="text-xs font-mono text-gray-300 w-16 text-right shrink-0">{fmt(s.count)} ({s.pct}%)</span>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-app-surface rounded-lg border border-app-border">
            <p className="text-xs text-gray-400 leading-relaxed">
              Sentimento médio geral: <span className={`font-semibold ${data.avgSentiment > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{data.avgSentiment > 0 ? '+' : ''}{data.avgSentiment}</span>
              {' — '}análise de linguagem natural aplicada automaticamente em chamados, ligações e chats pela IA.
            </p>
          </div>
        </Card>
      </div>

      {/* Tickets section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ticket area breakdown with all fields */}
        <Card>
          <CardHeader title="Chamados por Área / Motivo" subtitle="Qtde · Recorrências · SLA médio · Quebras SLA" icon={<FileText size={14} />} />
          <div className="mt-2 space-y-2">
            {data.ticketAreaBreakdown.slice(0, 6).map((a) => (
              <div key={a.area} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate">{a.area}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-500 flex-wrap">
                    <span>SLA médio: <span className="text-gray-300 font-mono">{a.avgSlaHours}h</span></span>
                    <span>Reincid.: <span className={`font-mono ${a.recurrenceRate > 20 ? 'text-rose-400' : 'text-gray-300'}`}>{a.recurrenceRate}%</span></span>
                    <span>Quebras SLA: <span className={`font-mono ${a.slaBreachRate > 15 ? 'text-rose-400' : 'text-gray-300'}`}>{a.slaBreachRate}%</span></span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-mono font-semibold text-gray-200">{fmt(a.count)}</span>
                  <p className="text-[10px] text-gray-500">chamados</p>
                </div>
              </div>
            ))}
          </div>
          {/* Aggregate ticket stats */}
          <div className="mx-4 mb-4 mt-3 grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg bg-app-surface border border-app-border text-center">
              <p className="text-[10px] text-gray-500">Solicitações 2ª Via</p>
              <p className="text-lg font-bold font-mono text-gray-200">{fmt(data.totalSecondCopyRequests)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-app-surface border border-app-border text-center">
              <p className="text-[10px] text-gray-500">Reduções de Plano</p>
              <p className="text-lg font-bold font-mono text-rose-400">{fmt(data.totalPlanDowngrades)}</p>
            </div>
          </div>
        </Card>

        {/* Ticket area breakdown chart */}
        <Card>
          <CardHeader title="Volume de Chamados por Área" subtitle="Distribuição e recorrência" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ticketAreaBreakdown} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis type="category" dataKey="area" tick={{ fill: '#9ca3af', fontSize: 9 }} width={165} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Chamados" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Scrapping native + matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Scrapping Native — Sem Chamado"
            subtitle="Native é nossa plataforma de ligações · contatos sem abertura de protocolo"
            icon={<Phone size={14} />}
          />
          <div className="flex items-center gap-3 mb-3 mt-2 px-4">
            <Phone size={14} className="text-purple-400" />
            <span className="text-2xl font-bold text-white font-mono">{fmt(data.totalNativeContacts)}</span>
            <span className="text-xs text-gray-500">ligações sem protocolo</span>
          </div>
          <div className="h-40 px-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.nativeReasonBreakdown} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis type="category" dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} width={155} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Ligações" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Scrapping Matrix — Sem Chamado"
            subtitle="Matrix é nossa plataforma de chats · contatos sem abertura de protocolo"
            icon={<MessageCircle size={14} />}
          />
          <div className="flex items-center gap-3 mb-3 mt-2 px-4">
            <MessageCircle size={14} className="text-pink-400" />
            <span className="text-2xl font-bold text-white font-mono">{fmt(data.totalMatrixContacts)}</span>
            <span className="text-xs text-gray-500">chats sem protocolo</span>
          </div>
          <div className="h-40 px-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.matrixReasonBreakdown} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis type="category" dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} width={155} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Chats" fill="#ec4899" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Attendant performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Performance por Colaborador" subtitle="Score de relacionamento, NPS e quebras de SLA" />
          <div className="mt-2 space-y-2">
            {data.attendantBreakdown.map((a, i) => (
              <div key={a.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                <span className="text-xs text-gray-600 w-4 shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200">{a.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <ScoreBar value={a.avgScore} color={CLASS_COLOR[a.avgScore >= 81 ? 'excellent' : a.avgScore >= 61 ? 'healthy' : a.avgScore >= 41 ? 'attention' : 'high_risk']} />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                  <span className="text-gray-400">NPS <span className="text-gray-200">{a.avgNps}</span></span>
                  <span className={a.slaBreaches > 30 ? 'text-rose-400' : 'text-gray-400'}>
                    SLA <span className="font-semibold">{a.slaBreaches}</span>
                  </span>
                  <span className="font-semibold" style={{ color: CLASS_COLOR[a.avgScore >= 81 ? 'excellent' : a.avgScore >= 61 ? 'healthy' : a.avgScore >= 41 ? 'attention' : 'high_risk'] }}>
                    {a.avgScore}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Radar de Colaboradores" subtitle="Score, NPS normalizado e SLA (top 5)" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#ffffff15" />
                <PolarAngleAxis dataKey="attendant" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Radar name="Score" dataKey="Score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                <Radar name="NPS×10" dataKey="NPS" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} />
                <Radar name="SLA" dataKey="SLA" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-300">{v}</span>} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <Card>
        <CardHeader title="AI Insights — Correlação com Churn" subtitle="Padrões detectados ao correlacionar NPS, sentimento, SLA e tickets com risco de cancelamento" icon={<Brain size={14} />} />
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.insights.map((ins, i) => (
            <InsightCard key={i} insight={ins} />
          ))}
        </div>
      </Card>

      {/* Customer table */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <CardHeader title="Ranking de Clientes" subtitle="Ordenado por menor score — inclui 2ª via, redução de plano e colaborador que atendeu" />
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Buscar cliente…"
              className="text-xs bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-app-borderLight w-40"
            />
            <select
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setPage(0) }}
              className="text-xs bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-app-borderLight"
            >
              <option value="all">Todos</option>
              {['critical', 'high_risk', 'attention', 'healthy', 'excellent'].map((c) => (
                <option key={c} value={c}>{CLASS_LABEL[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-app-border">
                {['#', 'Cliente', 'Score', 'NPS', 'Sentimento', 'Chamados', 'Reincid.', 'Quebra SLA', '2ª Via', 'Red. Plano', 'Ameaças', 'Colaborador'].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map((s: RelationshipEngineScore, i) => (
                <tr key={s.customerId} className="border-b border-app-border hover:bg-white/5 transition-colors">
                  <td className="py-2.5 px-3 text-xs text-gray-600">{page * PAGE_SIZE + i + 1}</td>
                  <td className="py-2.5 px-3">
                    <p className="text-xs font-medium text-gray-200">{s.customerName}</p>
                    <p className="text-[10px] text-gray-500">{s.city} · {s.plan}</p>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs font-mono font-semibold" style={{ color: CLASS_COLOR[s.classification] }}>
                      {s.relationshipScore}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs font-mono ${s.npsScore >= 9 ? 'text-emerald-400' : s.npsScore >= 7 ? 'text-yellow-400' : 'text-rose-400'}`}>
                      {s.npsScore}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    {s.sentimentScore > 0.2 ? '😊' : s.sentimentScore > -0.2 ? '😐' : '😠'}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-300 font-mono">{s.totalTickets}</td>
                  <td className="py-2.5 px-3 text-xs font-mono">
                    <span className={s.recurrentTickets > 1 ? 'text-rose-400' : 'text-gray-400'}>{s.recurrentTickets}</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs font-mono">
                    <span className={s.slaBreaches > 1 ? 'text-rose-400' : 'text-gray-400'}>{s.slaBreaches}</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs font-mono text-gray-400">{s.secondCopyRequests > 0 ? s.secondCopyRequests : '—'}</td>
                  <td className="py-2.5 px-3">
                    {s.planDowngrade
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 flex items-center gap-0.5 w-fit"><ArrowDownCircle size={9} /> Sim</span>
                      : <span className="text-xs text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.cancellationThreats > 0
                      ? <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-mono">{s.cancellationThreats}</span>
                      : <span className="text-xs text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-400">{s.attendant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-600">{filtered.length} clientes</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-app-surface border border-app-border text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-500">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs px-3 py-1.5 rounded-lg bg-app-surface border border-app-border text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
