import { useMemo, useState } from 'react'
import {
  Network, ShieldAlert, Zap, SlidersHorizontal, ChevronDown, ChevronUp, Table2,
} from 'lucide-react'
import { realClients, realNetwork, realMeta } from '@/data/realClients'
import { Card, CardHeader } from '@/components/ui/Card'
import { EngineDataModal, type DataColumn } from '@/components/ui/EngineDataModal'
import { ContractFilters, useContractFilters } from '@/components/ui/ContractFilters'
import { buildNetworkEngineData } from './networkEngine'
import { NetworkEngineConfigModal } from './NetworkEngineConfigModal'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/utils/cn'
import type { NetworkEngineScore } from '@/types'

const CLASS_COLOR: Record<string, string> = { excellent: '#22d3ee', healthy: '#10b981', attention: '#f59e0b', high_risk: '#f97316', critical: '#ef4444' }
const CLASS_LABEL: Record<string, string> = { excellent: 'Excelente', healthy: 'Saudável', attention: 'Atenção', high_risk: 'Alto Risco', critical: 'Crítico' }
const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}min`)

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-app-border rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(value / max) * 100}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
    </div>
  )
}

function CustomerRow({ score, rank }: { score: NetworkEngineScore; rank: number }) {
  const [open, setOpen] = useState(false)
  const color = CLASS_COLOR[score.classification]
  return (
    <>
      <tr className="border-b border-app-border hover:bg-app-surface/70 cursor-pointer transition-colors" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-2.5 text-[10px] font-mono text-gray-500">{rank}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: `${color}20`, color }}>{score.customerName[0]}</div>
            <div><p className="text-xs font-medium text-gray-200 truncate max-w-[150px]">{score.customerName}</p><p className="text-[10px] text-gray-500">{score.city}</p></div>
          </div>
        </td>
        <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="text-sm font-bold font-mono" style={{ color }}>{score.healthScore}</span><div className="w-16"><ScoreBar value={score.healthScore} color={color} /></div></div></td>
        <td className="px-4 py-2.5"><span className="text-xs font-mono" style={{ color: score.churnRisk >= 60 ? '#ef4444' : score.churnRisk >= 40 ? '#f97316' : '#f59e0b' }}>{score.churnRisk.toFixed(0)}%</span></td>
        <td className="px-4 py-2.5 text-[10px] text-gray-500 font-mono">{score.massiveCount}× · {fmtMin(score.avgOfflineMin)}</td>
        <td className="px-4 py-2.5 text-[10px] text-gray-500 font-mono truncate max-w-[90px]">{score.site || '—'}</td>
        <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, background: `${color}15` }}>{CLASS_LABEL[score.classification]}</span></td>
        <td className="px-4 py-2.5 text-gray-500">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</td>
      </tr>
      {open && (
        <tr className="border-b border-app-border bg-app-surface/50">
          <td colSpan={8} className="px-6 py-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Indicadores — atributo × pontuação</p>
                <div className="space-y-1">
                  {score.indicators.map((ind) => (
                    <div key={ind.key} className="flex items-center justify-between gap-3 text-[11px] py-0.5 border-b border-app-border/40">
                      <span className="text-gray-400 w-28 shrink-0">{ind.label}</span>
                      <span className="font-mono text-gray-300 flex-1 text-right">{ind.value}</span>
                      <span className={cn('font-mono w-14 text-right shrink-0', ind.points > 0 ? 'text-risk-low' : ind.points < 0 ? 'text-risk-critical' : 'text-gray-600')}>
                        {ind.points > 0 ? '+' : ''}{ind.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Infraestrutura (real)</p>
                <div className="space-y-1 text-[11px] text-gray-400">
                  <div className="flex justify-between gap-2"><span>Site</span><span className="font-mono text-gray-300 truncate">{score.site || '—'}</span></div>
                  <div className="flex justify-between gap-2"><span>Concentrador</span><span className="font-mono text-gray-300 truncate">{score.concentrator || '—'}</span></div>
                  <div className="flex justify-between gap-2"><span>Access Point</span><span className="font-mono text-gray-300 truncate">{score.accessPoint || '—'}</span></div>
                  <div className="flex justify-between"><span>Splitter</span><span className="font-mono text-gray-300">{score.splitter || '—'} ({score.splitterCode})</span></div>
                  <div className="flex justify-between"><span>Slot / PON</span><span className="font-mono text-gray-300">{score.slot || '—'} / {score.pon || '—'}</span></div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Colunas do popup "Ver dados" (retorno da query) ───────────
const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.name },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'site', label: 'Site', value: (c) => c.netSite || '—' },
  { key: 'conc', label: 'Concentrador', value: (c) => c.netConcentrator || '—' },
  { key: 'splitter', label: 'Splitter', value: (c) => c.netSplitter || '—' },
  { key: 'massive', label: 'Massivas', align: 'right', value: (c) => c.netMassiveCount },
  { key: 'offline', label: 'Offline médio (min)', align: 'right', value: (c) => c.netAvgOfflineMin },
  { key: 'overage', label: 'Atraso SLA médio (min)', align: 'right', value: (c) => c.netAvgOverageMin },
]

export default function NetworkEnginePage() {
  const networkConfig = useAppStore((s) => s.networkConfig)

  // Analisa apenas clientes afetados por massiva (em splitters com massiva)
  const clientsAffected = useMemo(() => realClients.filter((c) => c.netMassiveCount > 0), [])
  // Filtros de contrato / nome / cidade (aplicados antes da pontuação)
  const { filters, setFilters, filtered, cities } = useContractFilters(clientsAffected)
  const data = useMemo(() => buildNetworkEngineData(filtered, networkConfig), [filtered, networkConfig])

  const [configOpen, setConfigOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [tableFilter, setTableFilter] = useState<'all' | 'critical' | 'high_risk' | 'attention'>('all')
  const [tablePage, setTablePage] = useState(0)
  const PAGE_SIZE = 10

  const filteredScores = useMemo(() => {
    const sorted = [...data.scores].sort((a, b) => a.healthScore - b.healthScore)
    return tableFilter === 'all' ? sorted : sorted.filter((s) => s.classification === tableFilter)
  }, [data.scores, tableFilter])
  const pageSlice = filteredScores.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filteredScores.length / PAGE_SIZE)

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-card-md">
        <div className="absolute -top-24 -right-12 w-80 h-80 rounded-full bg-gradient-brand opacity-[0.07] blur-3xl pointer-events-none animate-float" />
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/40 to-transparent" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0"><Network size={18} className="text-[#fff]" /></div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold gradient-text tracking-tight">Rede</h1>
              </div>
            </div>
            <p className="text-xs text-gray-500 max-w-xl leading-relaxed">Score de infraestrutura a partir das massivas e da infraestrutura do cliente, por splitter — pontuado pela configuração.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] bg-app-surface border border-app-border px-3 py-2 rounded-xl" title="Clientes afetados · massivas na base">
              <Zap size={11} className="text-brand-cyan" />
              <span className="font-mono text-gray-600"><span className="text-gray-900 font-semibold">{data.scores.length.toLocaleString('pt-BR')}</span> afetados<span className="text-gray-400"> · {realNetwork.totalMassives.toLocaleString('pt-BR')} massivas</span></span>
            </div>
            <button onClick={() => setDataOpen(true)} className="flex items-center gap-2 text-xs font-medium text-gray-300 bg-app-surface border border-app-border px-3.5 py-2 rounded-xl hover:border-app-borderLight hover:text-white transition-all duration-200"><Table2 size={13} />Ver dados</button>
            <button onClick={() => setConfigOpen(true)} className="group flex items-center gap-2 text-xs font-medium text-[#fff] bg-gradient-brand px-3.5 py-2 rounded-xl shadow-glow hover:shadow-glow-violet hover:-translate-y-0.5 transition-all duration-200">
              <SlidersHorizontal size={13} className="group-hover:rotate-90 transition-transform duration-300" />Configurar
            </button>
          </div>
        </div>
      </div>

      {/* Filtros de contrato / nome / cidade */}
      <ContractFilters filters={filters} onChange={setFilters} cities={cities} resultCount={filtered.length} totalCount={clientsAffected.length} />

      {/* Ranking */}
      <Card className="shadow-card-md hover:shadow-card-lg hover-lift">
        <CardHeader title="Ranking de Rede" subtitle="Clientes ordenados por Health Score de rede" icon={<ShieldAlert size={14} />} />
        <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
          {([
            { key: 'all', label: 'Todos', count: data.scores.length },
            { key: 'critical', label: 'Críticos', count: data.scores.filter(s => s.classification === 'critical').length },
            { key: 'high_risk', label: 'Alto Risco', count: data.scores.filter(s => s.classification === 'high_risk').length },
            { key: 'attention', label: 'Atenção', count: data.scores.filter(s => s.classification === 'attention').length },
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => { setTableFilter(key); setTablePage(0) }}
              className={cn('text-[10px] px-3 py-1.5 rounded-lg border font-medium transition-all',
                tableFilter === key ? 'bg-gradient-brand text-[#fff] border-transparent shadow-glow' : 'text-gray-500 border-app-border hover:text-gray-700 hover:border-app-borderLight hover:bg-app-surface')}>
              {label} <span className="font-mono ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-app-border bg-app-surface/50">{['#', 'Cliente', 'Health Score', 'Churn Risk', 'Massivas', 'Site', 'Classificação', ''].map((h) => <th key={h} className="px-4 py-2.5 text-left text-[10px] text-gray-500 uppercase tracking-wider font-medium">{h}</th>)}</tr></thead>
            <tbody>{pageSlice.map((score, i) => <CustomerRow key={score.customerId} score={score} rank={tablePage * PAGE_SIZE + i + 1} />)}</tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
          <span className="text-[10px] text-gray-500">{tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, filteredScores.length)} de {filteredScores.length} clientes</span>
          <div className="flex gap-1.5">
            <button disabled={tablePage === 0} onClick={() => setTablePage((p) => p - 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Anterior</button>
            <button disabled={tablePage >= totalPages - 1} onClick={() => setTablePage((p) => p + 1)} className="text-[10px] px-2.5 py-1 rounded border border-app-border text-gray-400 disabled:opacity-30 hover:border-app-borderLight transition-all">Próxima</button>
          </div>
        </div>
      </Card>

      <p className="text-[10px] text-gray-500 text-center">{realNetwork.splittersAffected.toLocaleString('pt-BR')} splitters com massiva · amostra de {realMeta.sampleSize.toLocaleString('pt-BR')} clientes · atualizado em {new Date(realMeta.generatedAt).toLocaleString('pt-BR')}</p>

      <NetworkEngineConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
      <EngineDataModal
        open={dataOpen}
        onClose={() => setDataOpen(false)}
        title="Dados — Rede"
        subtitle={`${clientsAffected.length.toLocaleString('pt-BR')} clientes afetados por massivas`}
        columns={DATA_COLUMNS}
        rows={clientsAffected}
        aggregates={[
          { title: 'Massivas (base)', entries: [
            { label: 'Total de massivas', value: realNetwork.totalMassives },
            { label: 'Splitters afetados', value: realNetwork.splittersAffected },
          ] },
        ]}
      />
    </div>
  )
}
