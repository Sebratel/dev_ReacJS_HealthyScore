import { useEffect } from 'react'
import { Network } from 'lucide-react'
import { realNetwork } from '@/data/realClients'
import { useAppStore } from '@/store/appStore'
import type { NetworkEngineData, NetworkEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen, IndicatorBreakdown } from '@/features/engines/EngineScreen'
import { NetworkEngineConfigModal } from './NetworkEngineConfigModal'

const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}min`)

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'site', label: 'Site', value: (c) => c.site || '—' },
  { key: 'conc', label: 'Concentrador', value: (c) => c.concentrator || '—' },
  { key: 'splitter', label: 'Splitter', value: (c) => c.splitter || '—' },
  { key: 'massive', label: 'Massivas', align: 'right', value: (c) => c.massiveCount },
  { key: 'offline', label: 'Offline médio (min)', align: 'right', value: (c) => c.avgOfflineMin },
  { key: 'overage', label: 'Atraso SLA médio (min)', align: 'right', value: (c) => c.avgOverageMin },
]

export default function NetworkEnginePage() {
  const config = useAppStore((s) => s.networkConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const sync = useAppStore((s) => s.syncNetworkLists)
  useEffect(() => {
    const toIdx = (arr: { value: string }[]) => arr.map((e) => ({ key: e.value, label: e.value }))
    sync({
      site: toIdx(realNetwork.sites),
      concentrator: toIdx(realNetwork.concentrators),
      accessPoint: toIdx(realNetwork.accessPoints),
      splitter: toIdx(realNetwork.splitters),
      slot: toIdx(realNetwork.slots),
      pon: toIdx(realNetwork.pons),
    })
  }, [sync])

  return (
    <EngineScreen<NetworkEngineData, NetworkEngineScore>
      engineKey="network"
      icon={<Network size={18} className="text-[#fff]" />}
      title="Rede"
      subtitle="Score de infraestrutura a partir das massivas e da infra do cliente (site, concentrador, AP, splitter, slot, PON) — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="com infra"
      rightStat={() => <> · {realNetwork.totalMassives.toLocaleString('pt-BR')} massivas</>}
      footerNote={`${realNetwork.splittersAffected.toLocaleString('pt-BR')} splitters com massiva`}
      rankingTitle="Ranking de Rede"
      rankingSubtitle="Clientes ordenados por Health Score de rede (pior primeiro)"
      tableHeaders={['Massivas', 'Site']}
      columns={[
        { header: 'Massivas', sortKey: 'massiveCount', cell: (s) => <span className="text-[10px] text-gray-500 font-mono">{s.massiveCount}× · {fmtMin(s.avgOfflineMin)}</span> },
        { header: 'Site', sortKey: 'site', cell: (s) => <span className="text-[10px] text-gray-500 font-mono truncate block max-w-[90px]">{s.site || '—'}</span> },
      ]}
      renderExpanded={(s) => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Indicadores — atributo × pontuação</p>
            <IndicatorBreakdown indicators={s.indicators} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Infraestrutura (real)</p>
            <div className="space-y-1 text-[11px] text-gray-400">
              <div className="flex justify-between gap-2"><span>Site</span><span className="font-mono text-gray-300 truncate">{s.site || '—'}</span></div>
              <div className="flex justify-between gap-2"><span>Concentrador</span><span className="font-mono text-gray-300 truncate">{s.concentrator || '—'}</span></div>
              <div className="flex justify-between gap-2"><span>Access Point</span><span className="font-mono text-gray-300 truncate">{s.accessPoint || '—'}</span></div>
              <div className="flex justify-between"><span>Splitter</span><span className="font-mono text-gray-300">{s.splitter || '—'} ({s.splitterCode})</span></div>
              <div className="flex justify-between"><span>Slot / PON</span><span className="font-mono text-gray-300">{s.slot || '—'} / {s.pon || '—'}</span></div>
            </div>
          </div>
        </div>
      )}
      dataTitle="Dados — Rede"
      dataColumns={DATA_COLUMNS}
      buildAggregates={() => [
        { title: 'Massivas (base)', entries: [
          { label: 'Total de massivas', value: realNetwork.totalMassives },
          { label: 'Splitters afetados', value: realNetwork.splittersAffected },
        ] },
      ]}
      renderConfigModal={(open, onClose) => <NetworkEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}
