import { useEffect } from 'react'
import { Wifi } from 'lucide-react'
import { realConnection, realMeta } from '@/data/realClients'
import { useAppStore } from '@/store/appStore'
import type { ConnectionEngineData, ConnectionEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen } from '@/features/engines/EngineScreen'
import { useIndicatorLabelMap, resolveIndicatorLabel } from '@/features/settings/indicatorCatalog'
import { ONU_INDICATOR_KEYS, ONU_STATUS_OF } from './connectionConfig'
import { ConnectionEngineConfigModal } from './ConnectionEngineConfigModal'

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'contract', label: 'Contrato', value: (c) => c.contractNumber || '—' },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'plan', label: 'Plano', value: (c) => c.plan },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'equip', label: 'Equipamentos', value: (c) => c.equipment.join(', ') || '—' },
  { key: 'equipN', label: 'Qtd equip.', align: 'right', value: (c) => c.equipment.length },
  { key: 'onuDrops', label: 'Quedas ONU (período)', align: 'right', value: (c) => c.onuDrops },
]

// Meses cobertos pelo período materializado (corte do ETL) — usado para exibir
// a média mensal de quedas em vez do total cru.
const onuMonths = () => Math.max(1, Math.round((Date.now() - new Date(realMeta.fromDate || '2026-01-01').getTime()) / (30.44 * 24 * 3600 * 1000)))

export default function ConnectionEnginePage() {
  const config = useAppStore((s) => s.connectionConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const sync = useAppStore((s) => s.syncConnectionLists)
  const labelMap = useIndicatorLabelMap()
  const months = onuMonths()
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
        {
          header: 'Quedas', sortKey: 'onuDrops',
          cell: (s) => s.onuDrops > 0
            ? <span className="text-[10px] text-risk-critical font-mono">{(s.onuDrops / months).toFixed(1)}/mês <span className="text-gray-500">· {s.onuDrops}×</span></span>
            : <span className="text-[10px] text-gray-600 font-mono">—</span>,
        },
      ]}
      dataTitle="Dados — Conexão"
      dataColumns={DATA_COLUMNS}
      buildAggregates={(rows) => {
        // Resumo por status de ONU sobre a amostra: total de eventos, clientes
        // afetados e médias — visão agregada em vez de queda a queda.
        const byStatus = new Map<string, { events: number; clients: number }>()
        rows.forEach((s) => {
          for (const [status, n] of Object.entries(s.onuStatusCounts ?? {})) {
            if (!n) continue
            const e = byStatus.get(status) ?? { events: 0, clients: 0 }
            e.events += n
            e.clients++
            byStatus.set(status, e)
          }
        })
        const statusLabel = (status: string) => {
          const key = ONU_INDICATOR_KEYS.find((k) => ONU_STATUS_OF[k] === status)
          return key ? resolveIndicatorLabel(labelMap, 'connection', key) : status
        }
        const onuEntries = Array.from(byStatus.entries())
          .sort((a, b) => b[1].events - a[1].events)
          .map(([status, v]) => ({
            label: statusLabel(status),
            value: `${v.events.toLocaleString('pt-BR')} eventos · ${v.clients.toLocaleString('pt-BR')} clientes · média ${(v.events / v.clients).toFixed(1)}/cliente · ${(v.events / v.clients / months).toFixed(1)}/cliente/mês`,
          }))
        return [
          { title: 'Modelos de equipamento', entries: realConnection.models.map((e) => ({ label: e.value, value: e.count })) },
          ...(onuEntries.length ? [{ title: 'Status de ONU — resumo da amostra', entries: onuEntries }] : []),
        ]
      }}
      renderConfigModal={(open, onClose) => <ConnectionEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}
