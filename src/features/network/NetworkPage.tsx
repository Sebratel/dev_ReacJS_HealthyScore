import { useMemo } from 'react'
import { Wifi, AlertTriangle, Activity, Clock, MapPin, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from 'recharts'
import { mockNetworkEvents, mockCustomers } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

const STATUS_CONFIG = {
  active: { label: 'Ativa', className: 'bg-risk-critical/10 text-risk-critical border-risk-critical/20' },
  resolved: { label: 'Resolvida', className: 'bg-risk-low/10 text-risk-low border-risk-low/20' },
  monitoring: { label: 'Monitorando', className: 'bg-risk-medium/10 text-risk-medium border-risk-medium/20' },
}

const TYPE_LABEL: Record<string, string> = {
  massiva: 'Massiva',
  instability: 'Instabilidade',
  outage: 'Interrupção',
  maintenance: 'Manutenção',
}

export default function NetworkPage() {
  const activeEvents = mockNetworkEvents.filter((e) => e.status === 'active')
  const resolved = mockNetworkEvents.filter((e) => e.status === 'resolved')
  const totalAffected = mockNetworkEvents.reduce((a, e) => a + e.affectedCustomers, 0)
  const avgDuration = Math.round(
    mockNetworkEvents.filter((e) => e.durationMinutes).reduce((a, e) => a + (e.durationMinutes ?? 0), 0) /
    Math.max(mockNetworkEvents.filter((e) => e.durationMinutes).length, 1)
  )

  const byCity = useMemo(() => {
    const map: Record<string, { city: string; events: number; affected: number }> = {}
    mockNetworkEvents.forEach((e) => {
      if (!map[e.city]) map[e.city] = { city: e.city, events: 0, affected: 0 }
      map[e.city].events++
      map[e.city].affected += e.affectedCustomers
    })
    return Object.values(map).sort((a, b) => b.events - a.events)
  }, [])

  const byCause = useMemo(() => {
    const map: Record<string, number> = {}
    mockNetworkEvents.forEach((e) => { map[e.cause] = (map[e.cause] ?? 0) + 1 })
    return Object.entries(map).map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count).slice(0, 6)
  }, [])

  const uptimeData = [
    { month: 'Jan', uptime: 97.8 }, { month: 'Fev', uptime: 98.2 }, { month: 'Mar', uptime: 96.5 },
    { month: 'Abr', uptime: 97.1 }, { month: 'Mai', uptime: 98.6 }, { month: 'Jun', uptime: 95.8 },
    { month: 'Jul', uptime: 97.3 }, { month: 'Ago', uptime: 96.9 }, { month: 'Set', uptime: 98.1 },
    { month: 'Out', uptime: 94.7 }, { month: 'Nov', uptime: 97.5 }, { month: 'Dez', uptime: 96.2 },
  ]

  const highFailureCustomers = useMemo(() =>
    mockCustomers.filter((c) => c.networkFailures >= 8).sort((a, b) => b.networkFailures - a.networkFailures).slice(0, 6),
    []
  )

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Eventos Ativos" value={activeEvents.length} subtitle="Necessitam ação" variant={activeEvents.length > 0 ? 'danger' : 'success'} icon={<AlertTriangle size={14} />} iconColor="text-risk-critical" />
        <KpiCard label="Total de Eventos" value={mockNetworkEvents.length} subtitle="Últimos 90 dias" icon={<Activity size={14} />} />
        <KpiCard label="Clientes Impactados" value={totalAffected.toLocaleString('pt-BR')} subtitle="Total acumulado" variant="warning" icon={<Wifi size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Duração Média" value={`${Math.round(avgDuration / 60)}h ${avgDuration % 60}m`} subtitle="Por evento" icon={<Clock size={14} />} />
      </div>

      {/* Active events banner */}
      {activeEvents.length > 0 && (
        <div className="p-4 rounded-xl bg-risk-critical/10 border border-risk-critical/30 flex items-start gap-3">
          <AlertTriangle size={16} className="text-risk-critical mt-0.5 shrink-0 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-risk-critical">{activeEvents.length} evento(s) ativo(s) agora</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {activeEvents.map((e) => (
                <span key={e.id} className="text-[11px] text-gray-300">
                  {e.city} · {e.neighborhood} ({e.affectedCustomers} clientes) — {e.cause}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Uptime */}
        <Card>
          <CardHeader title="Uptime Mensal" subtitle="% disponibilidade da rede" icon={<Activity size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={uptimeData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[93, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="uptime" name="Uptime %" stroke="#22d3ee" strokeWidth={2} dot={{ fill: '#22d3ee', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Events by city */}
        <Card>
          <CardHeader title="Eventos por Cidade" subtitle="Concentração de falhas" icon={<MapPin size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCity} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="city" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="events" name="Eventos" fill="#4f8ef7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Causes */}
        <Card>
          <CardHeader title="Causas Frequentes" subtitle="Por tipo de falha" icon={<Zap size={14} />} />
          <div className="p-4 space-y-2.5">
            {byCause.map((c, i) => (
              <div key={c.cause} className="flex items-center gap-2.5">
                <span className="text-[10px] text-gray-600 w-3">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-300 truncate">{c.cause}</p>
                  <div className="mt-1 h-1 bg-app-surface rounded-full overflow-hidden">
                    <div className="h-full bg-brand-blue rounded-full" style={{ width: `${(c.count / byCause[0].count) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs font-mono text-gray-400 w-5 text-right">{c.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* All events table */}
        <Card className="lg:col-span-2">
          <CardHeader title="Histórico de Eventos" subtitle="Últimas ocorrências" />
          <div className="overflow-auto max-h-64">
            <table className="w-full">
              <thead className="sticky top-0 bg-app-card">
                <tr className="border-b border-app-border">
                  {['Tipo', 'Cidade', 'Bairro', 'Afetados', 'Duração', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {mockNetworkEvents.slice(0, 15).map((e) => {
                  const sc = STATUS_CONFIG[e.status]
                  return (
                    <tr key={e.id} className="hover:bg-app-cardHover transition-colors">
                      <td className="px-4 py-2.5 text-xs text-gray-300">{TYPE_LABEL[e.type] ?? e.type}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-300">{e.city}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{e.neighborhood}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-300">{e.affectedCustomers}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{e.durationMinutes ? `${Math.round(e.durationMinutes / 60)}h` : '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('text-[10px] border rounded-full px-2 py-0.5 font-medium', sc.className)}>{sc.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* High failure customers */}
      <Card>
        <CardHeader title="Clientes com Mais Falhas de Rede" subtitle="Maior correlação com risco de churn técnico" icon={<Wifi size={14} />} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {highFailureCustomers.map((c) => (
            <div key={c.id} className="p-3 rounded-lg bg-app-surface border border-app-border flex items-center gap-3 hover:border-app-borderLight transition-all">
              <div className="w-8 h-8 rounded-full bg-risk-high/10 border border-risk-high/20 flex items-center justify-center text-xs font-bold text-risk-high">{c.name[0]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{c.name}</p>
                <p className="text-[10px] text-gray-500">{c.city}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-risk-high">{c.networkFailures}</p>
                <p className="text-[10px] text-gray-600">falhas</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
