import type {
  NetworkEngineConfig,
  NetworkIndicatorConfig,
  NetworkIndicatorKey,
} from '@/types'

export const NET_INDICATOR_ORDER: NetworkIndicatorKey[] = ['massiveCount', 'avgOffline', 'slaOverage']

interface Range { key: string; label: string; max: number; defaultPoints: number }

export function bucketByMax(value: number, ranges: Range[]): { key: string; label: string } {
  const r = ranges.find((x) => value <= x.max) ?? ranges[ranges.length - 1]
  return { key: r.key, label: r.label }
}

// Qtd. de massivas no splitter do contrato (mais = pior)
export const MASSIVE_RANGES: Range[] = [
  { key: '0', label: 'Nenhuma', max: 0, defaultPoints: 0 },
  { key: '1-2', label: '1 a 2 massivas', max: 2, defaultPoints: -2 },
  { key: '3-5', label: '3 a 5 massivas', max: 5, defaultPoints: -8 },
  { key: '6-10', label: '6 a 10 massivas', max: 10, defaultPoints: -18 },
  { key: '11+', label: '11+ massivas', max: Infinity, defaultPoints: -30 },
]

// SLA médio offline (minutos) — event_identified_at → closed_at
export const OFFLINE_RANGES: Range[] = [
  { key: '<=30m', label: '≤ 30 min', max: 30, defaultPoints: 0 },
  { key: '30-60m', label: '30 a 60 min', max: 60, defaultPoints: -15 },
  { key: '1-2h', label: '1 a 2 horas', max: 120, defaultPoints: -30 },
  { key: '2-4h', label: '2 a 4 horas', max: 240, defaultPoints: -45 },
  { key: '4h+', label: '4+ horas', max: Infinity, defaultPoints: -60 },
]

// Atraso de SLA (minutos) — closed_at − expected_close_at
export const OVERAGE_RANGES: Range[] = [
  { key: '0', label: 'No prazo', max: 0, defaultPoints: 5 },
  { key: '<=30m', label: 'Atraso ≤ 30 min', max: 30, defaultPoints: -5 },
  { key: '30-60m', label: 'Atraso 30 a 60 min', max: 60, defaultPoints: -15 },
  { key: '1-2h', label: 'Atraso 1 a 2 h', max: 120, defaultPoints: -30 },
  { key: '2h+', label: 'Atraso 2+ h', max: Infinity, defaultPoints: -50 },
]

const rangeIndices = (rs: Range[]) => rs.map((r) => ({ key: r.key, label: r.label, points: r.defaultPoints }))

export const DEFAULT_NETWORK_CONFIG: NetworkEngineConfig = {
  indicators: {
    massiveCount: {
      key: 'massiveCount', label: 'Qtd. de Massivas', dynamic: false, mode: 'manual',
      description: 'Pontuação por quantidade de massivas no splitter do contrato.',
      indices: rangeIndices(MASSIVE_RANGES),
      query: 'SELECT count(*) FROM massiva_history_splitters WHERE splitter_code = :splitter;',
    },
    avgOffline: {
      key: 'avgOffline', label: 'SLA Médio (offline)', dynamic: false, mode: 'manual',
      description: 'Pontuação pelo tempo médio fora do ar (event_identified_at → closed_at).',
      indices: rangeIndices(OFFLINE_RANGES),
      query: 'SELECT avg(closed_at − event_identified_at) FROM massiva_history;',
    },
    slaOverage: {
      key: 'slaOverage', label: 'Atraso de SLA', dynamic: false, mode: 'manual',
      description: 'Pontuação pelo atraso médio da massiva (closed_at − expected_close_at).',
      indices: rangeIndices(OVERAGE_RANGES),
      query: 'SELECT avg(closed_at − expected_close_at) WHERE closed_at > expected_close_at;',
    },
  },
}

export function cloneDefaultNetworkConfig(): NetworkEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_NETWORK_CONFIG.indicators).map(([k, v]) => [
        k, { ...v, indices: v.indices.map((i) => ({ ...i })) },
      ]),
    ) as Record<NetworkIndicatorKey, NetworkIndicatorConfig>,
  }
}
