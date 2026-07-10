import type {
  ConnectionEngineConfig,
  ConnectionIndicatorConfig,
  ConnectionIndicatorKey,
} from '@/types'

// Indicadores de quedas de PPPoE (status da ONU, banco AutoISP) — presença:
// pontua quando o contrato registrou o status no período.
export type OnuIndicatorKey = Exclude<ConnectionIndicatorKey, 'equipment'>
export const ONU_INDICATOR_KEYS: OnuIndicatorKey[] = [
  'onuPowerFail', 'onuLossSignal', 'onuCritical', 'onuWarning', 'onuOk', 'onuUp',
]
// Chave do indicador → valor cru de new_status no AutoISP.
export const ONU_STATUS_OF: Record<OnuIndicatorKey, string> = {
  onuPowerFail: 'power_fail',
  onuLossSignal: 'loss_signal',
  onuCritical: 'critical',
  onuWarning: 'warning',
  onuOk: 'OK',
  onuUp: 'up',
}

export const CONNECTION_INDICATOR_ORDER: ConnectionIndicatorKey[] = ['equipment', ...ONU_INDICATOR_KEYS]

const ONU_QUERY = (status: string) =>
  `SELECT c.contract_id, osc.new_status, count(*)\nFROM contracts c\nJOIN contracted_services cs ON cs.contract_id = c.contract_id\nJOIN gpon_clients gc ON gc.contracted_service_id = cs.id\nJOIN onu_status_changes osc ON osc.gpon_client_id = gc.id\nWHERE osc.new_status = '${status}'\nGROUP BY c.contract_id, osc.new_status; -- banco AutoISP`

const onuIndicator = (key: OnuIndicatorKey, label: string, description: string, points: number): ConnectionIndicatorConfig => ({
  key, label, description, mode: 'manual', points, dynamic: false, indices: [], query: ONU_QUERY(ONU_STATUS_OF[key]),
})

// Configuração padrão. Os índices de "Equipamento" são preenchidos dinamicamente
// em runtime a partir dos modelos reais alocados (store.syncConnectionLists).
// Pontuação padrão 0 — você define a nota de cada modelo no modal.
export const DEFAULT_CONNECTION_CONFIG: ConnectionEngineConfig = {
  indicators: {
    equipment: {
      key: 'equipment',
      label: 'Equipamento (modelo)',
      description: 'Pontuação por modelo de equipamento alocado no contrato. O cliente soma a nota de cada modelo distinto que possui.',
      mode: 'manual',
      dynamic: true,
      indices: [],
      query: 'SELECT p.title, count(*) FROM patrimony_packing_list_items plis\n  JOIN patrimonies p ON p.id = plis.patrimony_id\n  ... GROUP BY p.title;',
    },
    onuPowerFail: onuIndicator('onuPowerFail', 'ONU — Queda de Energia (power_fail)',
      'Pontuação quando a ONU do contrato registrou queda por falta de energia no período (quedas de PPPoE — AutoISP).', -10),
    onuLossSignal: onuIndicator('onuLossSignal', 'ONU — Perda de Sinal (loss_signal)',
      'Pontuação quando a ONU do contrato registrou perda de sinal óptico no período (quedas de PPPoE — AutoISP).', -15),
    onuCritical: onuIndicator('onuCritical', 'ONU — Sinal Crítico (critical)',
      'Pontuação quando a ONU do contrato registrou status crítico no período (AutoISP).', -12),
    onuWarning: onuIndicator('onuWarning', 'ONU — Alerta de Sinal (warning)',
      'Pontuação quando a ONU do contrato registrou alerta de sinal no período (AutoISP).', -5),
    onuOk: onuIndicator('onuOk', 'ONU — Sinal OK (OK)',
      'Pontuação quando a ONU do contrato registrou status OK no período (AutoISP).', 0),
    onuUp: onuIndicator('onuUp', 'ONU — Retorno de Conexão (up)',
      'Pontuação quando a ONU do contrato registrou retorno de conexão no período (AutoISP).', 0),
  },
}

export function cloneDefaultConnectionConfig(): ConnectionEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_CONNECTION_CONFIG.indicators).map(([k, v]) => [
        k, { ...v, indices: v.indices.map((i) => ({ ...i })) },
      ]),
    ) as Record<ConnectionIndicatorKey, ConnectionIndicatorConfig>,
  }
}
