import { useEffect } from 'react'
import { PackageOpen } from 'lucide-react'
import { realInstallation } from '@/data/realClients'
import { useAppStore } from '@/store/appStore'
import type { InstallationEngineData, InstallationEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen } from '@/features/engines/EngineScreen'
import { InstallationEngineConfigModal } from './InstallationEngineConfigModal'

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'protocols', label: 'Protocolos', align: 'right', value: (c) => c.protocolCount },
  { key: 'schedules', label: 'Agendamentos', align: 'right', value: (c) => c.scheduleCount },
  { key: 'slaLate', label: 'SLA atrasado', align: 'right', value: (c) => c.slaLateCount },
  { key: 'avgSla', label: 'Média SLA (dias)', align: 'right', value: (c) => c.avgSlaDays },
  { key: 's2a', label: 'Venda→agend. (dias)', align: 'right', value: (c) => c.saleToScheduleDays },
  { key: 'techs', label: 'Técnicos', value: (c) => c.technicians.join(', ') || '—' },
]

export default function InstallationEnginePage() {
  const config = useAppStore((s) => s.installationConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const sync = useAppStore((s) => s.syncInstallationLists)
  useEffect(() => { sync({ technician: realInstallation.technicians.map((e) => ({ key: e.value, label: e.value })) }) }, [sync])

  return (
    <EngineScreen<InstallationEngineData, InstallationEngineScore>
      engineKey="installation"
      icon={<PackageOpen size={18} className="text-[#fff]" />}
      title="Instalação"
      subtitle="Score de instalação a partir de agendamentos, SLA e tempo de venda → agenda — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="c/ instalação"
      rankingTitle="Ranking de Instalação"
      rankingSubtitle="Clientes ordenados por Health Score de instalação (pior primeiro)"
      tableHeaders={['Venda→Agenda', 'SLA']}
      columns={[
        { header: 'Venda→Agenda', cell: (s) => <span className="text-[10px] text-gray-500 font-mono">{s.saleToScheduleDays.toFixed(1)}d</span> },
        { header: 'SLA', cell: (s) => <span className="text-[10px] text-gray-500 font-mono">{s.avgSlaDays.toFixed(1)}d · <span className="text-risk-critical">{s.slaLateCount} atr.</span></span> },
      ]}
      dataTitle="Dados — Instalação"
      dataColumns={DATA_COLUMNS}
      buildAggregates={() => [
        { title: 'Técnicos', entries: realInstallation.technicians.map((e) => ({ label: e.value, value: e.count })) },
      ]}
      renderConfigModal={(open, onClose) => <InstallationEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}
