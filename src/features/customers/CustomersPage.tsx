import { useMemo, useState } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender, SortingState, ColumnDef,
} from '@tanstack/react-table'
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Download, ChevronLeft, ChevronRight, Activity } from 'lucide-react'
import { mockCustomers } from '@/mocks'
import { Customer, HealthClassification } from '@/types'
import { Card } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { HealthGauge, MiniGauge, HEALTH_COLORS, HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { formatCurrency } from '@/utils/cn'
import { cn } from '@/utils/cn'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'

const HEALTH_FILTERS: { label: string; value: HealthClassification | 'all' }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Crítico', value: 'critical' },
  { label: 'Alto Risco', value: 'high_risk' },
  { label: 'Atenção', value: 'attention' },
  { label: 'Saudável', value: 'healthy' },
  { label: 'Excelente', value: 'excellent' },
]

const FILTER_PILL_STYLES: Record<string, string> = {
  critical: 'bg-risk-critical text-white border-risk-critical',
  high_risk: 'bg-risk-high text-white border-risk-high',
  attention: 'bg-risk-medium text-white border-risk-medium',
  healthy: 'bg-risk-low text-white border-risk-low',
  excellent: 'bg-brand-cyan text-app-bg border-brand-cyan',
  all: 'bg-brand-blue text-white border-brand-blue',
}

const FIN_LABEL: Record<string, string> = { ok: 'Regular', delayed: 'Atrasado', defaulting: 'Inadimplente', negotiating: 'Negociando' }
const FIN_COLOR: Record<string, string> = { ok: 'text-risk-low', delayed: 'text-risk-medium', defaulting: 'text-risk-critical', negotiating: 'text-brand-blue' }

export default function CustomersPage() {
  const navigate = useNavigate()
  const { setSelectedCustomer } = useAppStore()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'healthScore', desc: false }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [healthFilter, setHealthFilter] = useState<HealthClassification | 'all'>('all')

  const filtered = useMemo(() => {
    if (healthFilter === 'all') return mockCustomers
    return mockCustomers.filter((c) => c.healthScores.classification === healthFilter)
  }, [healthFilter])

  const columns = useMemo<ColumnDef<Customer>[]>(() => [
    {
      id: 'healthScore',
      accessorFn: (row) => row.healthScores.overall,
      header: 'Health Score',
      cell: ({ row }) => {
        const score = row.original.healthScores.overall
        return (
          <div className="flex items-center gap-2">
            <MiniGauge score={score} size={40} />
            <div>
              <p className="text-xs font-bold" style={{ color: HEALTH_COLORS[row.original.healthScores.classification] }}>{score}</p>
              <p className="text-[9px] text-gray-600">{HEALTH_LABELS[row.original.healthScores.classification]}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'name',
      header: 'Cliente',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: HEALTH_COLORS[row.original.healthScores.classification] + '20', color: HEALTH_COLORS[row.original.healthScores.classification] }}>
            {row.original.name[0]}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-100 max-w-[130px] truncate">{row.original.name}</p>
            <p className="text-[10px] text-gray-500">{row.original.id}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'city',
      header: 'Cidade',
      cell: ({ row }) => (
        <div>
          <p className="text-xs text-gray-300">{row.original.city}</p>
          <p className="text-[10px] text-gray-500">{row.original.neighborhood}</p>
        </div>
      ),
    },
    {
      id: 'churnRisk',
      accessorFn: (row) => row.derivedRisks.churn.probability,
      header: 'Churn %',
      cell: ({ row }) => {
        const p = row.original.derivedRisks.churn.probability
        return (
          <div className="flex items-center gap-2 w-24">
            <div className="flex-1 h-1.5 bg-app-surface rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: p > 75 ? '#ef4444' : p > 55 ? '#f97316' : p > 35 ? '#f59e0b' : '#10b981' }} />
            </div>
            <span className="text-xs font-mono tabular-nums" style={{ color: p > 75 ? '#ef4444' : p > 55 ? '#f97316' : p > 35 ? '#f59e0b' : '#10b981' }}>{p}%</span>
          </div>
        )
      },
    },
    {
      id: 'equipRisk',
      accessorFn: (row) => row.derivedRisks.equipmentReturn.probability,
      header: 'Equip.',
      cell: ({ row }) => {
        const p = row.original.derivedRisks.equipmentReturn.probability
        return <span className={cn('text-xs font-mono', p > 50 ? 'text-risk-critical' : p > 30 ? 'text-risk-medium' : 'text-gray-500')}>{p}%</span>
      },
    },
    {
      id: 'financialScore',
      accessorFn: (row) => row.healthScores.financial.value,
      header: 'Fin.',
      cell: ({ row }) => {
        const v = row.original.healthScores.financial.value
        return <span className="text-xs font-mono" style={{ color: HEALTH_COLORS[row.original.healthScores.financial.classification] }}>{v}</span>
      },
    },
    {
      id: 'networkScore',
      accessorFn: (row) => row.healthScores.network.value,
      header: 'Rede',
      cell: ({ row }) => {
        const v = row.original.healthScores.network.value
        return <span className="text-xs font-mono" style={{ color: HEALTH_COLORS[row.original.healthScores.network.classification] }}>{v}</span>
      },
    },
    {
      id: 'relScore',
      accessorFn: (row) => row.healthScores.relationship.value,
      header: 'Rel.',
      cell: ({ row }) => {
        const v = row.original.healthScores.relationship.value
        return <span className="text-xs font-mono" style={{ color: HEALTH_COLORS[row.original.healthScores.relationship.classification] }}>{v}</span>
      },
    },
    {
      accessorKey: 'paymentDelayDays',
      header: 'Atraso',
      cell: ({ row }) => (
        <span className={cn('text-xs font-mono', row.original.paymentDelayDays > 30 ? 'text-risk-critical' : row.original.paymentDelayDays > 0 ? 'text-risk-medium' : 'text-gray-500')}>
          {row.original.paymentDelayDays > 0 ? `${row.original.paymentDelayDays}d` : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'financialStatus',
      header: 'Financeiro',
      cell: ({ row }) => <span className={cn('text-xs font-medium', FIN_COLOR[row.original.financialStatus])}>{FIN_LABEL[row.original.financialStatus]}</span>,
    },
    {
      accessorKey: 'monthlyValue',
      header: 'MRR',
      cell: ({ row }) => <span className="text-xs text-gray-400 font-mono">{formatCurrency(row.original.monthlyValue)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedCustomer(row.original); navigate(`/cliente360?id=${row.original.id}`) }}
          className="text-[10px] text-brand-blue hover:text-brand-blueLight transition-colors whitespace-nowrap"
        >
          360° →
        </button>
      ),
    },
  ], [navigate, setSelectedCustomer])

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  const avgHealth = Math.round(mockCustomers.reduce((a, c) => a + c.healthScores.overall, 0) / mockCustomers.length)
  const critical = mockCustomers.filter((c) => c.healthScores.classification === 'critical').length
  const highRisk = mockCustomers.filter((c) => c.healthScores.classification === 'high_risk').length
  const degrading = mockCustomers.filter((c) => c.healthScores.trend === 'degrading').length

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total" value={mockCustomers.length} size="sm" icon={<Activity size={13} />} />
        <KpiCard label="Crítico + Alto Risco" value={critical + highRisk} size="sm" variant="danger" />
        <KpiCard label="Health Score Médio" value={`${avgHealth}/100`} size="sm" variant="brand" />
        <KpiCard label="Deteriorando" value={degrading} size="sm" variant="warning" />
      </div>

      <Card>
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center px-5 py-3.5 border-b border-app-border">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Buscar nome, cidade, bairro..."
              className="w-full pl-7 pr-3 h-7 text-xs bg-app-surface border border-app-border rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 transition-all"
            />
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {HEALTH_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setHealthFilter(f.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
                  healthFilter === f.value
                    ? FILTER_PILL_STYLES[f.value]
                    : 'bg-app-surface border-app-border text-gray-400 hover:border-app-borderLight hover:text-gray-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className="text-[11px] text-gray-500">{table.getFilteredRowModel().rows.length} clientes</span>
            <button className="h-7 w-7 flex items-center justify-center rounded-lg bg-app-surface border border-app-border text-gray-400 hover:text-gray-200 transition-all">
              <Download size={12} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-app-border">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-gray-300 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          header.column.getIsSorted() === 'asc' ? <ChevronUp size={10} /> :
                          header.column.getIsSorted() === 'desc' ? <ChevronDown size={10} /> :
                          <ChevronsUpDown size={10} className="opacity-30" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-app-border">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => { setSelectedCustomer(row.original); navigate(`/cliente360?id=${row.original.id}`) }}
                  className="hover:bg-app-cardHover cursor-pointer transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
          <span className="text-[11px] text-gray-500">Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="h-7 w-7 flex items-center justify-center rounded-lg border border-app-border text-gray-400 hover:text-gray-200 hover:border-app-borderLight disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ChevronLeft size={13} />
            </button>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="h-7 w-7 flex items-center justify-center rounded-lg border border-app-border text-gray-400 hover:text-gray-200 hover:border-app-borderLight disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
