import type {
  RelationshipEngineConfig,
  RelationshipIndicatorConfig,
  RelationshipIndicatorKey,
} from '@/types'

export const REL_INDICATOR_ORDER: RelationshipIndicatorKey[] = [
  'protocolCount', 'recurrence', 'protocolType', 'cancelThreats', 'attendant', 'slaSatisfaction',
]

interface Range { key: string; label: string; max: number; defaultPoints: number }

export function bucketByMax(value: number, ranges: Range[]): { key: string; label: string } {
  const r = ranges.find((x) => value <= x.max) ?? ranges[ranges.length - 1]
  return { key: r.key, label: r.label }
}

// Qtd. de protocolos abertos (mais = pior)
export const PROTOCOL_RANGES: Range[] = [
  { key: '1-5', label: '1 a 5 protocolos', max: 5, defaultPoints: -10 },
  { key: '6-10', label: '6 a 10 protocolos', max: 10, defaultPoints: -22 },
  { key: '11-20', label: '11 a 20 protocolos', max: 20, defaultPoints: -35 },
  { key: '21+', label: '21+ protocolos', max: Infinity, defaultPoints: -50 },
]

// Recorrência venda → abertura (média em dias). Quanto MAIS CEDO abre, pior.
export const RECURRENCE_RANGES: Range[] = [
  { key: '<=1m', label: '≤ 1 mês', max: 30, defaultPoints: -50 },
  { key: '1-3m', label: '1 a 3 meses', max: 90, defaultPoints: -30 },
  { key: '3-6m', label: '3 a 6 meses', max: 180, defaultPoints: -15 },
  { key: '6-12m', label: '6 a 12 meses', max: 365, defaultPoints: -5 },
  { key: '1-2y', label: '1 a 2 anos', max: 730, defaultPoints: 0 },
  { key: '2y+', label: '2+ anos', max: Infinity, defaultPoints: 0 },
]

// Ameaças de cancelamento (intention_to_cancel = 1)
export const CANCEL_RANGES: Range[] = [
  { key: '0', label: 'Nenhuma ameaça', max: 0, defaultPoints: 0 },
  { key: '1', label: '1 ameaça', max: 1, defaultPoints: -30 },
  { key: '2-3', label: '2 a 3 ameaças', max: 3, defaultPoints: -55 },
  { key: '4+', label: '4+ ameaças', max: Infinity, defaultPoints: -80 },
]

// Satisfação via SLA — atraso médio (conclusion − final_deadline) em horas. Mais atraso = pior.
export const SLA_SATISFACTION_RANGES: Range[] = [
  { key: '0h', label: 'No prazo', max: 0, defaultPoints: 5 },
  { key: '<=1h', label: 'Atraso ≤ 1h', max: 1, defaultPoints: 0 },
  { key: '1-2h', label: 'Atraso 1 a 2h', max: 2, defaultPoints: -10 },
  { key: '2-6h', label: 'Atraso 2 a 6h', max: 6, defaultPoints: -20 },
  { key: '6-24h', label: 'Atraso 6 a 24h', max: 24, defaultPoints: -30 },
  { key: '24h+', label: 'Atraso 24h+', max: Infinity, defaultPoints: -45 },
]

const rangeIndices = (rs: Range[]) => rs.map((r) => ({ key: r.key, label: r.label, points: r.defaultPoints }))

export const DEFAULT_RELATIONSHIP_CONFIG: RelationshipEngineConfig = {
  indicators: {
    protocolCount: {
      key: 'protocolCount', label: 'Qtd. de Protocolos', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa de protocolos de relacionamento abertos por contrato.',
      indices: rangeIndices(PROTOCOL_RANGES),
      query: 'SELECT count(distinct a.id) FROM assignments a ... (NOT ATV/MNT);',
    },
    recurrence: {
      key: 'recurrence', label: 'Recorrência (Venda → Abertura)', dynamic: false, mode: 'manual',
      description: 'Pontuação pelo tempo médio entre a venda (contract_created) e a abertura dos protocolos.',
      indices: rangeIndices(RECURRENCE_RANGES),
      query: 'SELECT avg(protocol_created − contract_created) ...;',
    },
    protocolType: {
      key: 'protocolType', label: 'Tipo de Protocolo', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por tipo de protocolo. O cliente soma a nota de cada tipo distinto que abriu.',
      query: 'SELECT it.title FROM incident_types it ...;',
    },
    cancelThreats: {
      key: 'cancelThreats', label: 'Ameaças de Cancelamento', dynamic: false, mode: 'manual',
      description: 'Pontuação por quantidade de protocolos de intenção de cancelamento (intention_to_cancel = 1).',
      indices: rangeIndices(CANCEL_RANGES),
      query: "SELECT count(*) WHERE it.id IN (1142,1131,1021,1143,1154);",
    },
    attendant: {
      key: 'attendant', label: 'Atendente', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por atendente responsável. O cliente soma a nota de cada atendente distinto.',
      query: 'SELECT p2.name FROM people p2 WHERE p2.id = a.responsible_id;',
    },
    slaSatisfaction: {
      key: 'slaSatisfaction', label: 'Satisfação (SLA)', dynamic: false, mode: 'manual',
      description: 'Pontuação pelo atraso médio no atendimento (conclusion_date − final_deadline).',
      indices: rangeIndices(SLA_SATISFACTION_RANGES),
      query: 'SELECT avg(conclusion_date − final_deadline) WHERE conclusion_date > final_deadline;',
    },
  },
}

export function cloneDefaultRelationshipConfig(): RelationshipEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_RELATIONSHIP_CONFIG.indicators).map(([k, v]) => [
        k, { ...v, indices: v.indices.map((i) => ({ ...i })) },
      ]),
    ) as Record<RelationshipIndicatorKey, RelationshipIndicatorConfig>,
  }
}
