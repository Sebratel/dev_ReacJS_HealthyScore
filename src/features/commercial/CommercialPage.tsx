import { useMemo } from 'react'
import { TrendingUp, Users, AlertTriangle, Target, Award, TrendingDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Cell, PieChart, Pie } from 'recharts'
import { mockSellers, mockCustomers } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { formatCurrency, formatPercent } from '@/utils/cn'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  )
}

const ORIGIN_DATA = [
  { origin: 'Porta a porta', count: 142, color: '#4f8ef7' },
  { origin: 'Indicação', count: 98, color: '#10b981' },
  { origin: 'WhatsApp', count: 87, color: '#22d3ee' },
  { origin: 'Campanha digital', count: 73, color: '#7c3aed' },
  { origin: 'Parceiro local', count: 61, color: '#f59e0b' },
  { origin: 'Panfleto', count: 39, color: '#6b7280' },
]

const CAMPAIGNS = [
  { name: 'Fibra+ Verão', leads: 180, converted: 67, churned: 12, cost: 3200 },
  { name: 'Black Friday', leads: 320, converted: 142, churned: 28, cost: 5800 },
  { name: 'Indicação Premiada', leads: 95, converted: 78, churned: 6, cost: 1200 },
  { name: 'Volta às Aulas', leads: 145, converted: 52, churned: 18, cost: 2700 },
  { name: 'Plano Família', leads: 210, converted: 89, churned: 15, cost: 4100 },
]

export default function CommercialPage() {
  const avgEarlyChurn = Math.round(mockSellers.reduce((a, s) => a + s.earlyChurnRate, 0) / mockSellers.length)
  const totalRevenue = mockSellers.reduce((a, s) => a + s.monthlyRevenue, 0)

  const sellerPerf = useMemo(() => mockSellers
    .map((s) => ({
      ...s,
      churnRate: Math.round((s.churnedCustomers / Math.max(s.totalCustomers, 1)) * 100),
      retention: Math.round((s.activeCustomers / Math.max(s.totalCustomers, 1)) * 100),
    }))
    .sort((a, b) => a.earlyChurnRate - b.earlyChurnRate),
    []
  )

  const sellerChurnData = mockSellers.map((s) => ({
    name: s.name.split(' ')[0],
    churnPrecoce: s.earlyChurnRate.toFixed(1),
    scoreMedio: s.avgChurnScore.toFixed(0),
    clientes: s.totalCustomers,
  }))

  const bestSeller = sellerPerf[0]
  const worstSeller = sellerPerf[sellerPerf.length - 1]

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Vendedores" value={mockSellers.length} subtitle="Ativos na plataforma" icon={<Users size={14} />} />
        <KpiCard label="Churn Precoce Médio" value={`${avgEarlyChurn}%`} subtitle="Cancelamento < 3 meses" variant="warning" icon={<AlertTriangle size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Receita Gerada" value={formatCurrency(totalRevenue)} subtitle="MRR total da base" icon={<TrendingUp size={14} />} variant="brand" />
        <KpiCard label="Melhor Vendedor" value={bestSeller.name.split(' ')[0]} subtitle={`Apenas ${bestSeller.earlyChurnRate.toFixed(1)}% churn precoce`} variant="success" icon={<Award size={14} />} iconColor="text-risk-low" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Early churn by seller */}
        <Card>
          <CardHeader title="Churn Precoce por Vendedor" subtitle="% clientes que cancelaram em < 3 meses" icon={<TrendingDown size={14} />} />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sellerChurnData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="churnPrecoce" name="Churn Precoce %" radius={[4, 4, 0, 0]}>
                  {sellerChurnData.map((s: any, i: number) => (
                    <Cell key={i} fill={parseFloat(s.churnPrecoce) > 20 ? '#ef4444' : parseFloat(s.churnPrecoce) > 15 ? '#f97316' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Lead origin */}
        <Card>
          <CardHeader title="Origem dos Leads" subtitle="Canais de aquisição" icon={<Target size={14} />} />
          <div className="p-4 h-52 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={ORIGIN_DATA} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={3} dataKey="count">
                  {ORIGIN_DATA.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
              {ORIGIN_DATA.map((o) => (
                <div key={o.origin} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
                  <span className="text-[10px] text-gray-400 truncate">{o.origin}</span>
                  <span className="text-[10px] font-semibold text-gray-300 ml-auto">{o.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Campaigns */}
      <Card>
        <CardHeader title="Campanhas de Aquisição" subtitle="Performance e qualidade dos leads captados" icon={<Target size={14} />} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-app-border">
                {['Campanha', 'Leads', 'Convertidos', 'Conv. %', 'Churnados', 'Churn %', 'Custo/Conversão'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {CAMPAIGNS.map((c) => {
                const convRate = ((c.converted / c.leads) * 100).toFixed(1)
                const churnRate = ((c.churned / c.converted) * 100).toFixed(1)
                const cac = (c.cost / c.converted).toFixed(2)
                return (
                  <tr key={c.name} className="hover:bg-app-cardHover transition-colors">
                    <td className="px-5 py-3 text-xs font-medium text-gray-200">{c.name}</td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-300">{c.leads}</td>
                    <td className="px-5 py-3 text-xs font-mono text-risk-low">{c.converted}</td>
                    <td className="px-5 py-3 text-xs font-mono text-brand-blue">{convRate}%</td>
                    <td className="px-5 py-3 text-xs font-mono text-risk-medium">{c.churned}</td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-mono', parseFloat(churnRate) > 20 ? 'text-risk-critical' : parseFloat(churnRate) > 12 ? 'text-risk-medium' : 'text-risk-low')}>
                        {churnRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-400">{formatCurrency(parseFloat(cac))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Seller table */}
      <Card>
        <CardHeader title="Ranking de Vendedores" subtitle="Score de qualidade de aquisição" icon={<Award size={14} />} />
        <div className="divide-y divide-app-border">
          {sellerPerf.map((s, i) => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-3">
              <span className={cn('text-sm font-bold w-6 text-center', i === 0 ? 'text-risk-low' : i === sellerPerf.length - 1 ? 'text-risk-critical' : 'text-gray-500')}>
                {i + 1}
              </span>
              <div className="w-8 h-8 rounded-full bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center text-xs font-bold text-brand-blue">
                {s.name[0]}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-200">{s.name}</p>
                <p className="text-[10px] text-gray-500">{s.region}</p>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-0.5">
                <span className="text-[11px] text-gray-400">{s.totalCustomers} clientes</span>
                <span className="text-[10px] text-gray-600">{formatCurrency(s.monthlyRevenue)}/mês</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className={cn('text-sm font-bold font-mono', s.earlyChurnRate > 20 ? 'text-risk-critical' : s.earlyChurnRate > 15 ? 'text-risk-medium' : 'text-risk-low')}>
                  {s.earlyChurnRate.toFixed(1)}%
                </span>
                <span className="text-[10px] text-gray-600">churn precoce</span>
              </div>
              <div className="hidden md:flex flex-col items-end gap-0.5">
                <span className="text-[11px] text-gray-300 font-mono">{s.avgChurnScore.toFixed(0)}/100</span>
                <span className="text-[10px] text-gray-600">score médio</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
