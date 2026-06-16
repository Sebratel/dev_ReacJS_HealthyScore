import type {
  ConnectionEngineConfig,
  ConnectionIndicatorConfig,
  ConnectionIndicatorKey,
} from '@/types'

export const CONNECTION_INDICATOR_ORDER: ConnectionIndicatorKey[] = ['equipment']

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
