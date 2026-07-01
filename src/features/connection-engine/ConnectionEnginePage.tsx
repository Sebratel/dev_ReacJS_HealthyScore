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
      subtitle="Score de conexão a partir do modelo de equipamento alocado — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="c/ equip."
      rankingTitle="Ranking de Conexão"
      rankingSubtitle="Clientes ordenados por Health Score de conexão (pior primeiro)"
      tableHeaders={['Equip.']}
      columns={[
        { header: 'Equip.', cell: (s) => <span className="text-[10px] text-gray-500 font-mono">{s.equipment.length} equip.</span> },
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
