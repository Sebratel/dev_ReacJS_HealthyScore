import { useEffect } from 'react'
import { MessageSquare } from 'lucide-react'
import { realRelationship } from '@/data/realClients'
import { useAppStore } from '@/store/appStore'
import type { RelationshipEngineData, RelationshipEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen } from '@/features/engines/EngineScreen'
import { RelationshipEngineConfigModal } from './RelationshipEngineConfigModal'

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'contract', label: 'Contrato', value: (c) => c.contractNumber || '—' },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'protocols', label: 'Protocolos', align: 'right', value: (c) => c.protocolCount },
  { key: 'recurrence', label: 'Recorrência (dias)', align: 'right', value: (c) => c.recurrenceDays },
  { key: 'overage', label: 'Excedente médio (h)', align: 'right', value: (c) => c.avgOverageHours },
  { key: 'threats', label: 'Ameaças cancel.', align: 'right', value: (c) => c.cancelThreats },
  { key: 'types', label: 'Tipos', value: (c) => c.protocolTypes.join(', ') || '—' },
  { key: 'attendants', label: 'Atendentes', value: (c) => c.attendants.join(', ') || '—' },
]

export default function RelationshipEnginePage() {
  const config = useAppStore((s) => s.relationshipConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const sync = useAppStore((s) => s.syncRelationshipLists)
  useEffect(() => {
    sync({
      protocolType: realRelationship.types.map((e) => ({ key: e.value, label: e.value })),
      attendant: realRelationship.attendants.map((e) => ({ key: e.value, label: e.value })),
    })
  }, [sync])

  return (
    <EngineScreen<RelationshipEngineData, RelationshipEngineScore>
      engineKey="relationship"
      icon={<MessageSquare size={18} className="text-[#fff]" />}
      title="Relacionamento"
      subtitle="Score de relacionamento a partir de protocolos, recorrência, ameaças de cancelamento, atendente e SLA — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="c/ protocolo"
      rankingTitle="Ranking de Relacionamento"
      rankingSubtitle="Clientes ordenados por Health Score de relacionamento (pior primeiro)"
      tableHeaders={['Protocolos', 'Excedente']}
      columns={[
        { header: 'Protocolos', sortKey: 'protocolCount', cell: (s) => <span className="text-[10px] text-gray-500 font-mono">{s.protocolCount}p{s.cancelThreats > 0 && <span className="text-risk-critical"> · {s.cancelThreats}⚠</span>}</span> },
        { header: 'Excedente', sortKey: 'avgOverageHours', cell: (s) => <span className="text-[10px] text-gray-500 font-mono">{s.avgOverageHours.toFixed(1)}h</span> },
      ]}
      dataTitle="Dados — Relacionamento"
      dataColumns={DATA_COLUMNS}
      buildAggregates={() => [
        { title: 'Tipos de protocolo', entries: realRelationship.types.map((e) => ({ label: e.value, value: e.count })) },
        { title: 'Atendentes', entries: realRelationship.attendants.map((e) => ({ label: e.value, value: e.count })) },
      ]}
      renderConfigModal={(open, onClose) => <RelationshipEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}
