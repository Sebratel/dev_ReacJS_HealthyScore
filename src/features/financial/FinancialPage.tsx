import { useMemo } from 'react'
import { DollarSign, AlertTriangle, Clock, TrendingDown, CreditCard } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, Cell,
} from 'recharts'
import { mockCustomers, MONTHLY_CHURN } from '@/mocks'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { RiskBadge } from '@/components/ui/RiskBadge'
import { formatCurrency } from '@/utils/cn'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="mt-0.5">
          {p.name}: <strong>{typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export default function FinancialPage() {
  const stats = useMemo(() => {
    const defaulting = mockCustomers.filter((c) => c.financialStatus === 'defaulting')
    const delayed = mockCustomers.filter((c) => c.financialStatus === 'delayed')
    const negotiating = mockCustomers.filter((c) => c.financialStatus === 'negotiating')
    const totalPending = mockCustomers.reduce((a, c) => a + c.pendingAmount, 0)
    const avgDelay = Math.round(mockCustomers.filter((c) => c.paymentDelayDays > 0).reduce((a, c) => a + c.paymentDelayDays, 0) / Math.max(mockCustomers.filter((c) => c.paymentDelayDays > 0).length, 1))
    return { defaulting, delayed, negotiating, totalPending, avgDelay }
  }, [])

  const agingData = [
    { label: '1-15 dias', count: mockCustomers.filter((c) => c.paymentDelayDays >= 1 && c.paymentDelayDays <= 15).length, value: mockCustomers.filter((c) => c.paymentDelayDays >= 1 && c.paymentDelayDays <= 15).reduce((a, c) => a + c.pendingAmount, 0) },
    { label: '16-30 dias', count: mockCustomers.filter((c) => c.paymentDelayDays >= 16 && c.paymentDelayDays <= 30).length, value: mockCustomers.filter((c) => c.paymentDelayDays >= 16 && c.paymentDelayDays <= 30).reduce((a, c) => a + c.pendingAmount, 0) },
    { label: '31-60 dias', count: mockCustomers.filter((c) => c.paymentDelayDays >= 31 && c.paymentDelayDays <= 60).length, value: mockCustomers.filter((c) => c.paymentDelayDays >= 31 && c.paymentDelayDays <= 60).reduce((a, c) => a + c.pendingAmount, 0) },
    { label: '61-90 dias', count: mockCustomers.filter((c) => c.paymentDelayDays >= 61 && c.paymentDelayDays <= 90).length, value: mockCustomers.filter((c) => c.paymentDelayDays >= 61 && c.paymentDelayDays <= 90).reduce((a, c) => a + c.pendingAmount, 0) },
    { label: '+90 dias', count: mockCustomers.filter((c) => c.paymentDelayDays > 90).length, value: mockCustomers.filter((c) => c.paymentDelayDays > 90).reduce((a, c) => a + c.pendingAmount, 0) },
  ]

  const revenueRiskData = MONTHLY_CHURN.map((m) => ({ month: m.month, risco: m.revenueAtRisk, recuperado: m.recovered * 120 }))

  const topDefaulters = useMemo(() =>
    mockCustomers.filter((c) => c.paymentDelayDays > 30).sort((a, b) => b.pendingAmount - a.pendingAmount).slice(0, 8),
    []
  )

  const planRevenue = useMemo(() => {
    const map: Record<string, { plan: string; total: number; at_risk: number }> = {}
    mockCustomers.forEach((c) => {
      if (!map[c.plan]) map[c.plan] = { plan: c.plan, total: 0, at_risk: 0 }
      map[c.plan].total += c.monthlyValue
      if (c.churnRisk === 'critical' || c.churnRisk === 'high') map[c.plan].at_risk += c.monthlyValue
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [])

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Inadimplentes" value={stats.defaulting.length} subtitle="+ 60 dias de atraso" variant="danger" icon={<AlertTriangle size={14} />} iconColor="text-risk-critical" />
        <KpiCard label="Em Atraso" value={stats.delayed.length} subtitle="Até 60 dias" variant="warning" icon={<Clock size={14} />} iconColor="text-risk-medium" />
        <KpiCard label="Total em Aberto" value={formatCurrency(stats.totalPending)} subtitle="Saldo devedor" variant="danger" icon={<DollarSign size={14} />} iconColor="text-risk-critical" />
        <KpiCard label="Atraso Médio" value={`${stats.avgDelay}d`} subtitle={`${stats.negotiating.length} em negociação`} icon={<CreditCard size={14} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aging */}
        <Card>
          <CardHeader title="Aging de Inadimplência" subtitle="Clientes por faixa de atraso" icon={<Clock size={14} />} />
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Clientes" radius={[4, 4, 0, 0]}>
                  {agingData.map((_, i) => (
                    <Cell key={i} fill={['#f59e0b', '#f97316', '#ef4444', '#dc2626', '#b91c1c'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Revenue risk */}
        <Card>
          <CardHeader title="Receita em Risco vs Recuperada" subtitle="Evolução mensal" icon={<TrendingDown size={14} />} />
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueRiskData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRecov" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="risco" name="Receita em Risco" stroke="#ef4444" fill="url(#gradRisk)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="recuperado" name="Recuperado" stroke="#10b981" fill="url(#gradRecov)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Receita por plano */}
        <Card>
          <CardHeader title="Receita por Plano" subtitle="Total vs. em risco" />
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planRevenue} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="plan" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Receita Total" fill="#4f8ef7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="at_risk" name="Em Risco" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top devedores */}
        <Card className="lg:col-span-2">
          <CardHeader title="Maiores Devedores" subtitle="Clientes com maior saldo em aberto" icon={<AlertTriangle size={14} />} />
          <div className="divide-y divide-app-border">
            {topDefaulters.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-2.5">
                <div className="w-7 h-7 rounded-full bg-risk-critical/10 border border-risk-critical/20 flex items-center justify-center text-[10px] font-bold text-risk-critical shrink-0">
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-500">{c.city} · {c.paymentDelayDays}d atraso</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-risk-critical font-mono">{formatCurrency(c.pendingAmount)}</p>
                  <p className="text-[10px] text-gray-500">{c.plan}</p>
                </div>
                <RiskBadge level={c.churnRisk} size="sm" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
