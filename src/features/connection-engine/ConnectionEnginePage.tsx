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

// Rótulo curto para caber na coluna da tabela — o nome completo fica no detalhe.
const WIFI_SHORT: Record<string, string> = { ax: 'Wi-Fi 6', ac: 'Wi-Fi 5', n: 'Wi-Fi 4', bridge: 'bridge', desconhecido: '—' }

const fmtRx = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)} dBm`)
const fmtLan = (v: number | null) => (v == null ? '—' : v > 0 ? `${v} Mbps` : 'sem link')
const fmtKm = (v: number | null) => (v == null ? '—' : `${(v / 1000).toFixed(2)} km`)

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'contract', label: 'Contrato', value: (c) => c.contractNumber || '—' },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'plan', label: 'Plano', value: (c) => c.plan },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'rx', label: 'Sinal óptico', align: 'right', value: (c) => fmtRx(c.rxPower) },
  { key: 'lan', label: 'Porta LAN', align: 'right', value: (c) => fmtLan(c.lanMbps) },
  { key: 'wifi', label: 'Wi-Fi', value: (c) => WIFI_SHORT[c.wifiGen] ?? '—' },
  { key: 'cpe', label: 'Equipamento (CPE)', value: (c) => c.cpeModel || '—' },
  { key: 'onuStatus', label: 'Status da ONU', value: (c) => c.onuStatus || '—' },
  { key: 'dist', label: 'Distância da fibra', align: 'right', value: (c) => fmtKm(c.fiberDistanceM) },
  { key: 'temp', label: 'Temp. ONU', align: 'right', value: (c) => (c.onuTempC == null ? '—' : `${c.onuTempC.toFixed(1)} °C`) },
  { key: 'rssi', label: 'Wi-Fi na casa (RSSI)', align: 'right', value: (c) => (c.wifiRssi == null ? '—' : `${c.wifiRssi.toFixed(0)} dBm`) },
  { key: 'rssiDev', label: 'Aparelhos no Wi-Fi', align: 'right', value: (c) => c.wifiDevices ?? '—' },
  { key: 'cpeMem', label: 'Memória do CPE', align: 'right', value: (c) => (c.cpeMemPct == null ? '—' : `${c.cpeMemPct.toFixed(0)}%`) },
  { key: 'cpeTemp', label: 'Temp. CPE', align: 'right', value: (c) => (c.cpeTempC == null ? '—' : `${c.cpeTempC.toFixed(1)} °C`) },
  { key: 'equip', label: 'Equipamentos', value: (c) => c.equipment.join(', ') || '—' },
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
      subtitle="Score de conexão a partir da qualidade do enlace (sinal óptico, porta LAN, geração do Wi-Fi), do equipamento alocado e das quedas de PPPoE — pontuado no servidor."
      config={config}
      thresholds={thresholds}
      analyzedLabel="c/ dado de conexão"
      rankingTitle="Ranking de Conexão"
      rankingSubtitle="Clientes ordenados por Health Score de conexão (pior primeiro)"
      tableHeaders={['Sinal', 'Porta LAN', 'Wi-Fi', 'Wi-Fi na casa', 'Quedas']}
      columns={[
        {
          header: 'Sinal', sortKey: 'rxPower',
          cell: (s) => s.rxPower == null
            ? <span className="text-[10px] text-on-surface-variant/90 font-mono">—</span>
            : <span className={`text-[10px] font-mono ${s.rxPower < -28 ? 'text-risk-critical' : s.rxPower < -26 ? 'text-risk-high' : 'text-on-surface-variant'}`}>{s.rxPower.toFixed(1)} dBm</span>,
        },
        {
          header: 'Porta LAN', sortKey: 'lanMbps',
          cell: (s) => s.lanMbps == null
            ? <span className="text-[10px] text-on-surface-variant/90 font-mono">—</span>
            : s.lanMbps === 0
              ? <span className="text-[10px] text-on-surface-variant/90 font-mono">sem link</span>
              : <span className={`text-[10px] font-mono ${s.lanMbps < 100 ? 'text-risk-critical' : s.lanMbps < 1000 ? 'text-risk-high' : 'text-on-surface-variant'}`}>{s.lanMbps} Mbps</span>,
        },
        {
          header: 'Wi-Fi', sortKey: 'wifiGen',
          cell: (s) => <span className={`text-[10px] font-mono ${s.wifiGen === 'n' ? 'text-risk-high' : 'text-on-surface-variant'}`}>{WIFI_SHORT[s.wifiGen] ?? '—'}</span>,
        },
        {
          // Mediana dos aparelhos do cliente (ver WIFI_RSSI_RANGES). O traço
          // aqui é "CPE não reporta", que é a maioria — não "Wi-Fi bom".
          header: 'Wi-Fi na casa', sortKey: 'wifiRssi',
          cell: (s) => s.wifiRssi == null
            ? <span className="text-[10px] text-on-surface-variant/90 font-mono">—</span>
            : <span className={`text-[10px] font-mono ${s.wifiRssi < -72 ? 'text-risk-critical' : s.wifiRssi < -67 ? 'text-risk-high' : 'text-on-surface-variant'}`}>
                {s.wifiRssi.toFixed(0)} dBm{s.wifiDevices ? <span className="text-on-surface-variant"> · {s.wifiDevices}ap</span> : null}
              </span>,
        },
        {
          header: 'Quedas', sortKey: 'onuDrops',
          cell: (s) => s.onuDrops > 0
            ? <span className="text-[10px] text-risk-critical font-mono">{(s.onuDrops / months).toFixed(1)}/mês <span className="text-on-surface-variant">· {s.onuDrops}×</span></span>
            : <span className="text-[10px] text-on-surface-variant/90 font-mono">—</span>,
        },
      ]}
      dataTitle="Dados — Conexão"
      dataColumns={DATA_COLUMNS}
      buildAggregates={(rows, agg) => {
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
            value: `${v.events.toLocaleString('pt-BR')} eventos · ${v.clients.toLocaleString('pt-BR')} contratos · média ${(v.events / v.clients).toFixed(1)}/cliente · ${(v.events / v.clients / months).toFixed(1)}/cliente/mês`,
          }))

        // Distribuições do enlace — vêm agregadas do servidor (base inteira da
        // engine), não da página, por isso saem de `agg` e não de `rows`.
        const pct = (n: number, total: number) => (total ? ` · ${((n / total) * 100).toFixed(1)}%` : '')
        const dist = (list: { label: string; count: number; avgScore: number }[], total: number) =>
          list.map((d) => ({ label: d.label, value: `${d.count.toLocaleString('pt-BR')} contratos${pct(d.count, total)} · score médio ${d.avgScore}` }))

        const linkGroups = []
        if (agg?.withLink) {
          linkGroups.push({
            title: 'Enlace óptico — visão geral',
            entries: [
              { label: 'Contratos com leitura óptica', value: agg.withLink.toLocaleString('pt-BR') },
              { label: 'Atenuação média', value: agg.avgRxPower != null ? `${agg.avgRxPower.toFixed(2)} dBm` : '—' },
              { label: 'Sinal pior que −26 dBm', value: `${agg.poorSignalCount.toLocaleString('pt-BR')}${pct(agg.poorSignalCount, agg.withLink)}` },
              { label: 'Porta LAN abaixo de 1 Gbps', value: agg.cappedLanCount.toLocaleString('pt-BR') },
              { label: 'Equipamento Wi-Fi 4 (n)', value: agg.legacyWifiCount.toLocaleString('pt-BR') },
            ],
          })
        }
        if (agg?.rxPowerBreakdown?.length) {
          linkGroups.push({ title: 'Potência óptica — distribuição', entries: dist(agg.rxPowerBreakdown, agg.withLink) })
        }
        if (agg?.lanSpeedBreakdown?.length) {
          const total = agg.lanSpeedBreakdown.reduce((a, d) => a + d.count, 0)
          linkGroups.push({ title: 'Velocidade da porta LAN', entries: dist(agg.lanSpeedBreakdown, total) })
        }
        if (agg?.wifiGenBreakdown?.length) {
          const total = agg.wifiGenBreakdown.reduce((a, d) => a + d.count, 0)
          linkGroups.push({ title: 'Geração do Wi-Fi (ac/ax)', entries: dist(agg.wifiGenBreakdown, total) })
        }
        // Wi-Fi da casa: o denominador é `withWifiRssi`, não o total da aba —
        // só ~20% dos CPEs reportam RSSI, e usar o total diria que o Wi-Fi da
        // base inteira é ótimo.
        if (agg?.withWifiRssi) {
          linkGroups.push({
            title: 'Wi-Fi na casa do cliente — visão geral',
            entries: [
              { label: 'Clientes com leitura de RSSI', value: agg.withWifiRssi.toLocaleString('pt-BR') },
              { label: 'RSSI mediano da base', value: agg.avgWifiRssi != null ? `${agg.avgWifiRssi.toFixed(1)} dBm` : '—' },
              { label: 'Wi-Fi pior que −72 dBm', value: `${agg.poorWifiCount.toLocaleString('pt-BR')}${pct(agg.poorWifiCount, agg.withWifiRssi)}` },
            ],
          })
        }
        if (agg?.wifiRssiBreakdown?.length) {
          linkGroups.push({ title: 'Sinal do Wi-Fi na casa — distribuição', entries: dist(agg.wifiRssiBreakdown, agg.withWifiRssi) })
        }

        return [
          ...linkGroups,
          { title: 'Modelos de equipamento', entries: realConnection.models.map((e) => ({ label: e.value, value: e.count })) },
          ...(onuEntries.length ? [{ title: 'Status de ONU — resumo da amostra', entries: onuEntries }] : []),
        ]
      }}
      renderConfigModal={(open, onClose) => <ConnectionEngineConfigModal open={open} onClose={onClose} />}
      footerNote="Sinal óptico, porta LAN e equipamento vêm do AutoISP na carga do ETL (foto do momento). A geração do Wi-Fi é derivada do modelo do CPE reportado por TR-069. O sinal do Wi-Fi na casa é a mediana dos aparelhos conectados (não o pior, que só mediria quantos aparelhos a casa tem) e existe para ~20% dos clientes — depende do firmware do CPE, e '—' quer dizer sem leitura, não Wi-Fi bom."
    />
  )
}
