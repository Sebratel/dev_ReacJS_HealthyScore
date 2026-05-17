import { useMemo } from 'react'
import { Wrench, Clock, AlertTriangle, CheckCircle, RefreshCw, User } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { mockProtocols, mockCustomers } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/utils/cn'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  )
}

export default function MaintenancePage() {
  const stats = useMemo(() => {
    const open = mockProtocols.filter((p) => p.status === 'open' || p.status === 'in_progress')
    const resolved = mockProtocols.filter((p) => p.status === 'resolved')
    const recurrent = mockProtocols.filter((p) => p.isRecurrent)
    const technical = mockProtocols.filter((p) => p.type === 'technical')
    const overSla = resolved.filter((p) => p.resolvedInHours && p.resolvedInHours > p.slaHours)
    const avgResolution = Math.round(resolved.filter((p) => p.resolvedInHours).reduce((a, p) => a + (p.resolvedInHours ?? 0), 0) / Math.max(resolved.filter((p) => p.resolvedInHours).length, 1))
    const slaCompliance = resolved.length > 0 ? Math.round(((resolved.length - overSla.length) / resolved.length) * 100) : 100
    return { open, resolved, recurrent, technical, overSla, avgResolution, slaCompliance, total: mockProtocols.length }
  }, [])

  const typeStats = [
    { name: 'Técnico', value: mockProtocols.filter((p) => p.type === 'technical').length, color: '#4f8ef7' },
    { name: 'Financeiro', value: mockProtocols.filter((p) => p.type === 'financial').length, color: '#f59e0b' },
    { name: 'Comercial', value: mockProtocols.filter((p) => p.type === 'commercial').length, color: '#10b981' },
    { name: 'Reclamação', value: mockProtocols.filter((p) => p.type === 'complaint').length, color: '#ef4444' },
  ]

  const subtypeStats = useMemo(() => {
    const map: Record<string, number> = {}
    mockProtocols.filter((p) => p.type === 'technical').forEach((p) => { map[p.subtype] = (map[p.subtype] ?? 0) + 1 })
    return Object.entries(map).map(([subtype, count]) => ({ subtype, count })).sort((a, b) => b.count - a.count).slice(0, 6)
  }, [])

  const technicianStats = useMemo(() => {
    const map: Record<string, { name: string; total: number; recurrent: number; overSla: number }> = {}
    mockProtocols.filter((p) => p.technicianId).forEach((p) => {
      const id = p.technicianId!
      if (!map[id]) map[id] = { name: p.technicianName!, total: 0, recurrent: 0, overSla: 0 }
      map[id].total++
      if (p.isRecurrent) map[id].recurrent++
      if (p.resolvedInHours && p.resolvedInHours > p.slaHours) map[id].overSla++
    })
    return Object.values(map).sort((a, b) => b.recurrent - a.recurrent)
  }, [])

  const slaData = [
    { label: '< 4h', count: mockProtocols.filter((p) => p.type === 'technical' && p.resolvedInHours && p.resolvedInHours <= 4).length },
    { label: '4-8h', count: mockProtocols.filter((p) => p.type === 'technical' && p.resolvedInHours && p.resolvedInHours > 4 && p.resolvedInHours <= 8).length },
    { label: '8-24h', count: mockProtocols.filter((p) => p.type === 'technical' && p.resolvedInHours && p.resolvedInHours > 8 && p.resolvedInHours <= 24).length },
    { label: '+24h', count: mockProtocols.filter((p) => p.type === 'technical' && p.resolvedInHours && p.resolvedInHours > 24).length },
  ]

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Protocolos Abertos" value={stats.open.length} subtitle="Aguardando resolução" variant={stats.open.length > 50 ? 'danger' : 'warning'} icon={<Wrench size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="SLA Cumprido" value={`${stats.slaCompliance}%`} subtitle={`${stats.overSla.length} fora do prazo`} variant={stats.slaCompliance >= 80 ? 'success' : 'danger'} icon={<CheckCircle size={14} />} iconColor="text-risk-low" />
        <KpiCard label="Tempo Médio" value={`${stats.avgResolution}h`} subtitle="Resolução técnica" icon={<Clock size={14} />} />
        <KpiCard label="Reincidentes" value={stats.recurrent.length} subtitle="Mesmo problema" variant="warning" icon={<RefreshCw size={14} />} iconColor="text-risk-medium" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Type distribution */}
        <Card>
          <CardHeader title="Por Tipo" subtitle="Distribuição de protocolos" />
          <div className="p-4 h-52 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={typeStats} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={3} dataKey="value">
                  {typeStats.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {typeStats.map((t) => (
                <div key={t.name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-[10px] text-gray-400">{t.name}</span>
                  <span className="text-[10px] font-semibold text-gray-200 ml-auto">{t.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* SLA resolution time */}
        <Card>
          <CardHeader title="Tempo de Resolução" subtitle="Protocolos técnicos" icon={<Clock size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Protocolos" radius={[4, 4, 0, 0]}>
                  {slaData.map((_, i) => <Cell key={i} fill={['#10b981', '#4f8ef7', '#f59e0b', '#ef4444'][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Subtype frequency */}
        <Card>
          <CardHeader title="Tipos de Falha Técnica" subtitle="Mais frequentes" />
          <div className="p-4 space-y-2.5">
            {subtypeStats.map((s, i) => (
              <div key={s.subtype} className="flex items-center gap-2.5">
                <span className="text-[10px] text-gray-600 w-3">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-300">{s.subtype}</p>
                  <div className="mt-1 h-1 bg-app-surface rounded-full overflow-hidden">
                    <div className="h-full bg-brand-blue rounded-full" style={{ width: `${(s.count / subtypeStats[0].count) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs font-mono text-gray-400">{s.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Technician performance */}
      <Card>
        <CardHeader title="Performance por Técnico" subtitle="Reincidência e SLA" icon={<User size={14} />} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-app-border">
                {['Técnico', 'Total', 'Reincidentes', 'Taxa Reinc.', 'Fora do SLA', 'SLA %'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {technicianStats.map((t) => {
                const reincRate = Math.round((t.recurrent / Math.max(t.total, 1)) * 100)
                const sla = Math.round(((t.total - t.overSla) / Math.max(t.total, 1)) * 100)
                return (
                  <tr key={t.name} className="hover:bg-app-cardHover transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center text-[10px] font-bold text-brand-blue">{t.name[0]}</div>
                        <span className="text-xs font-medium text-gray-200">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-300">{t.total}</td>
                    <td className="px-5 py-3 text-xs font-mono text-risk-medium">{t.recurrent}</td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-mono', reincRate > 30 ? 'text-risk-critical' : reincRate > 15 ? 'text-risk-medium' : 'text-risk-low')}>
                        {reincRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-300">{t.overSla}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-app-surface rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', sla >= 80 ? 'bg-risk-low' : sla >= 60 ? 'bg-risk-medium' : 'bg-risk-critical')} style={{ width: `${sla}%` }} />
                        </div>
                        <span className={cn('text-xs font-mono', sla >= 80 ? 'text-risk-low' : sla >= 60 ? 'text-risk-medium' : 'text-risk-critical')}>{sla}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
