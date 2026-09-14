import { useEffect } from 'react'
import { Wrench } from 'lucide-react'
import { realField, realMeta } from '@/data/realClients'
import { useAppStore } from '@/store/appStore'
import type { FieldEngineData, FieldEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen } from '@/features/engines/EngineScreen'
import { FieldEngineConfigModal } from './FieldEngineConfigModal'

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'contract', label: 'Contrato', value: (c) => c.contractNumber || '—' },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'protocols', label: 'Protocolos', align: 'right', value: (c) => c.protocolCount },
  { key: 'schedules', label: 'Agendamentos', align: 'right', value: (c) => c.scheduleCount },
  { key: 'slaLate', label: 'SLA atrasado', align: 'right', value: (c) => c.slaLateCount },
  { key: 'avgSla', label: 'Média SLA (dias)', align: 'right', value: (c) => c.avgSlaDays },
  { key: 'reasons', label: 'Motivos', value: (c) => c.reasons.join(', ') || '—' },
  { key: 'techs', label: 'Técnicos', value: (c) => c.technicians.join(', ') || '—' },
]

export default function FieldEnginePage() {
  const config = useAppStore((s) => s.fieldConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const sync = useAppStore((s) => s.syncFieldLists)
  useEffect(() => {
    sync({
      reasons: realField.reasons.map((e) => ({ key: e.value, label: e.value })),
      technician: realField.technicians.map((e) => ({ key: e.value, label: e.value })),
    })
  }, [sync])

  return (
    <EngineScreen<FieldEngineData, FieldEngineScore>
      engineKey="field"
      icon={<Wrench size={18} className="text-[#fff]" />}
      title="Manutenção"
      subtitle="Score de manutenção a partir de protocolos, motivos, agendamentos, SLA e técnicos — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="c/ protocolo"
      footerNote={`protocolos desde ${realMeta.fromDate}`}
      rankingTitle="Ranking de Manutenção"
      rankingSubtitle="Clientes ordenados por Health Score de manutenção (pior primeiro)"
      tableHeaders={['Protocolos', 'Média SLA']}
      columns={[
        { header: 'Protocolos', sortKey: 'protocolCount', cell: (s) => <span className="text-[10px] text-on-surface-variant font-mono">{s.protocolCount}p · <span className="text-risk-critical">{s.slaLateCount} atr.</span></span> },
        { header: 'Média SLA', sortKey: 'avgSlaDays', cell: (s) => <span className="text-[10px] text-on-surface-variant font-mono">{s.avgSlaDays.toFixed(1)}d</span> },
      ]}
      dataTitle="Dados — Manutenção"
      dataColumns={DATA_COLUMNS}
      buildAggregates={() => [
        { title: 'Motivos de visita', entries: realField.reasons.map((e) => ({ label: e.value, value: e.count })) },
        { title: 'Técnicos', entries: realField.technicians.map((e) => ({ label: e.value, value: e.count })) },
      ]}
      renderConfigModal={(open, onClose) => <FieldEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}
