import { useEffect } from 'react'
import { Wifi } from 'lucide-react'
import { realConnection } from '@/data/realClients'
import { useAppStore } from '@/store/appStore'
import type { ConnectionEngineData, ConnectionEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen } from '@/features/engines/EngineScreen'
import { ConnectionEngineConfigModal } from './ConnectionEngineConfigModal'

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'plan', label: 'Plano', value: (c) => c.plan },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'equip', label: 'Equipamentos', value: (c) => c.equipment.join(', ') || '—' },
  { key: 'equipN', label: 'Qtd equip.', align: 'right', value: (c) => c.equipment.length },
  { key: 'onuDrops', label: 'Quedas ONU', align: 'right', value: (c) => c.onuDrops },
  { key: 'onuPf', label: 'power_fail', align: 'right', value: (c) => c.onuStatusCounts?.power_fail ?? 0 },
  { key: 'onuLs', label: 'loss_signal', align: 'right', value: (c) => c.onuStatusCounts?.loss_signal ?? 0 },
]

export default function ConnectionEnginePage() {
  const config = useAppStore((s) => s.connectionConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const sync = useAppStore((s) => s.syncConnectionLists)
  useEffect(() => { sync({ equipment: realConnection.models.map((e) => ({ key: e.value, label: e.value })) }) }, [sync])

  return (
    <EngineScreen<ConnectionEngineData, ConnectionEngineScore>
      engineKey="connection"
      icon={<Wifi size={18} className="text-[#fff]" />}
      title="Conexão"
      subtitle="Score de conexão a partir do modelo de equipamento alocado e das quedas de PPPoE (status da ONU) — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="c/ equip."
      rankingTitle="Ranking de Conexão"
      rankingSubtitle="Clientes ordenados por Health Score de conexão (pior primeiro)"
      tableHeaders={['Equip.', 'Quedas']}
      columns={[
        { header: 'Equip.', sortKey: 'equipment', cell: (s) => <span className="text-[10px] text-gray-500 font-mono">{s.equipment.length} equip.</span> },
        { header: 'Quedas', sortKey: 'onuDrops', cell: (s) => <span className={s.onuDrops > 0 ? 'text-[10px] text-risk-critical font-mono' : 'text-[10px] text-gray-500 font-mono'}>{s.onuDrops}× queda{s.onuDrops === 1 ? '' : 's'}</span> },
      ]}
      dataTitle="Dados — Conexão"
      dataColumns={DATA_COLUMNS}
      buildAggregates={() => [
        { title: 'Modelos de equipamento', entries: realConnection.models.map((e) => ({ label: e.value, value: e.count })) },
      ]}
      renderConfigModal={(open, onClose) => <ConnectionEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}
