import { useEffect } from 'react'
import { Briefcase } from 'lucide-react'
import { realCommercial } from '@/data/realClients'
import { formatCurrency } from '@/utils/cn'
import { useAppStore } from '@/store/appStore'
import { genderLabel } from './commercialConfig'
import type { CommercialEngineData, CommercialEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen } from '@/features/engines/EngineScreen'
import { CommercialEngineConfigModal } from './CommercialEngineConfigModal'

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'contract', label: 'Contrato', value: (c) => c.contractNumber || '—' },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'neighborhood', label: 'Bairro', value: (c) => c.neighborhood },
  { key: 'plan', label: 'Plano', value: (c) => c.plan },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'seller', label: 'Vendedor', value: (c) => c.seller },
  { key: 'age', label: 'Tempo de contrato', value: (c) => c.contractAgeLabel },
]

export default function CommercialEnginePage() {
  const config = useAppStore((s) => s.commercialConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const sync = useAppStore((s) => s.syncCommercialLists)
  useEffect(() => {
    sync({
      seller: realCommercial.sellers.map((e) => ({ key: e.value, label: e.value })),
      plan: realCommercial.plans.map((e) => ({ key: e.value, label: e.value })),
      planValue: realCommercial.values.map((e) => ({ key: String(e.value), label: formatCurrency(e.value) })),
      city: realCommercial.cities.map((e) => ({ key: e.value, label: e.value })),
      neighborhood: realCommercial.neighborhoods.map((e) => ({ key: e.value, label: e.value })),
      clientGender: realCommercial.clientGenders.map((e) => ({ key: e.value, label: genderLabel(e.value) })),
      sellerGender: realCommercial.sellerGenders.map((e) => ({ key: e.value, label: genderLabel(e.value) })),
    })
  }, [sync])

  return (
    <EngineScreen<CommercialEngineData, CommercialEngineScore>
      engineKey="commercial"
      icon={<Briefcase size={18} className="text-[#fff]" />}
      title="Comercial"
      subtitle="Score comercial a partir de vendedor, plano, valor, tempo de contrato e endereço — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="analisados"
      rankingTitle="Ranking Comercial"
      rankingSubtitle="Clientes ordenados por Health Score comercial (pior primeiro)"
      tableHeaders={['Vendedor', 'Tempo']}
      columns={[
        { header: 'Vendedor', sortKey: 'seller', cell: (s) => <span className="text-xs text-gray-300 truncate block max-w-[130px]">{s.seller}</span> },
        { header: 'Tempo', sortKey: 'contractAgeMonths', cell: (s) => <span className="text-[10px] text-gray-500">{s.contractAgeLabel}</span> },
      ]}
      dataTitle="Dados — Comercial"
      dataColumns={DATA_COLUMNS}
      buildAggregates={() => [
        { title: 'Vendedores', entries: realCommercial.sellers.map((e) => ({ label: e.value, value: e.count })) },
        { title: 'Planos', entries: realCommercial.plans.map((e) => ({ label: e.value, value: e.count })) },
        { title: 'Cidades', entries: realCommercial.cities.map((e) => ({ label: e.value, value: e.count })) },
        { title: 'Bairros', entries: realCommercial.neighborhoods.map((e) => ({ label: e.value, value: e.count })) },
        { title: 'Gênero do cliente', entries: realCommercial.clientGenders.map((e) => ({ label: e.value, value: e.count })) },
      ]}
      renderConfigModal={(open, onClose) => <CommercialEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}
