import type {
  FieldEngineConfig,
  FieldIndicatorConfig,
  FieldIndicatorKey,
} from '@/types'

export const FIELD_INDICATOR_ORDER: FieldIndicatorKey[] = [
  'protocolCount', 'reasons', 'scheduleCount', 'slaOverdue', 'avgSla', 'technician',
]

interface Range { key: string; label: string; max: number; defaultPoints: number }

// Encontra a faixa de um valor (primeiro range cujo max >= valor)
export function bucketByMax(value: number, ranges: Range[]): { key: string; label: string } {
  const r = ranges.find((x) => value <= x.max) ?? ranges[ranges.length - 1]
  return { key: r.key, label: r.label }
}

// Quantidade de protocolos (mais = pior)
export const PROTOCOL_RANGES: Range[] = [
  { key: '1', label: '1 protocolo', max: 1, defaultPoints: 0 },
  { key: '2-3', label: '2 a 3 protocolos', max: 3, defaultPoints: -5 },
  { key: '4-6', label: '4 a 6 protocolos', max: 6, defaultPoints: -12 },
  { key: '7-10', label: '7 a 10 protocolos', max: 10, defaultPoints: -20 },
  { key: '11+', label: '11+ protocolos', max: Infinity, defaultPoints: -30 },
]

// Agendamentos (tentativas) — mais remarcações = pior
export const SCHEDULE_RANGES: Range[] = [
  { key: '0', label: 'Sem agendamento', max: 0, defaultPoints: 0 },
  { key: '1-2', label: '1 a 2 agendamentos', max: 2, defaultPoints: -3 },
  { key: '3-5', label: '3 a 5 agendamentos', max: 5, defaultPoints: -10 },
  { key: '6+', label: '6+ agendamentos', max: Infinity, defaultPoints: -18 },
]

// SLAs atrasados (qtd. de protocolos fora do prazo)
export const SLA_OVERDUE_RANGES: Range[] = [
  { key: '0', label: 'Nenhum atraso', max: 0, defaultPoints: 5 },
  { key: '1', label: '1 atraso', max: 1, defaultPoints: -10 },
  { key: '2-3', label: '2 a 3 atrasos', max: 3, defaultPoints: -20 },
  { key: '4+', label: '4+ atrasos', max: Infinity, defaultPoints: -32 },
]

// Média de SLA (dias para conclusão) — mais demorado = pior
export const AVG_SLA_RANGES: Range[] = [
  { key: '<=1d', label: '≤ 1 dia', max: 1, defaultPoints: 5 },
  { key: '1-3d', label: '1 a 3 dias', max: 3, defaultPoints: 0 },
  { key: '3-7d', label: '3 a 7 dias', max: 7, defaultPoints: -8 },
  { key: '7-15d', label: '7 a 15 dias', max: 15, defaultPoints: -18 },
  { key: '15+d', label: '15+ dias', max: Infinity, defaultPoints: -30 },
]

const rangeIndices = (rs: Range[]) => rs.map((r) => ({ key: r.key, label: r.label, points: r.defaultPoints }))

// Configuração padrão. Faixas têm gradiente inicial; motivos/técnicos começam em 0
// e são sincronizados do banco (store.syncFieldLists).
export const DEFAULT_FIELD_CONFIG: FieldEngineConfig = {
  indicators: {
    protocolCount: {
      key: 'protocolCount', label: 'Quantidade de Protocolos', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa de quantidade de protocolos de manutenção.',
      indices: rangeIndices(PROTOCOL_RANGES),
      query: 'SELECT count(distinct a.id) FROM assignments a ... WHERE contract = :contractId;',
    },
    reasons: {
      key: 'reasons', label: 'Motivos', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por motivo de abertura (categorias 1-4). O cliente soma a nota de cada motivo distinto.',
      query: 'SELECT unnest(categorias 1-4) FROM solicitation_service_categories ...;',
    },
    scheduleCount: {
      key: 'scheduleCount', label: 'Agendamentos', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa de tentativas de agendamento (service_desk_slots).',
      indices: rangeIndices(SCHEDULE_RANGES),
      query: 'SELECT count(distinct sds.id) FROM service_desk_slots sds ...;',
    },
    slaOverdue: {
      key: 'slaOverdue', label: 'SLAs Atrasados', dynamic: false, mode: 'manual',
      description: 'Pontuação por quantidade de protocolos concluídos/abertos fora do prazo (final_deadline).',
      indices: rangeIndices(SLA_OVERDUE_RANGES),
      query: 'SELECT count(*) WHERE conclusion_date > final_deadline OR (em aberto e vencido);',
    },
    avgSla: {
      key: 'avgSla', label: 'Média de SLA', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa de tempo médio de conclusão (created → conclusion_date).',
      indices: rangeIndices(AVG_SLA_RANGES),
      query: 'SELECT avg(conclusion_date - created) FROM assignments a ...;',
    },
    technician: {
      key: 'technician', label: 'Técnicos', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por técnico envolvido nos agendamentos. O cliente soma a nota de cada técnico distinto.',
      query: 'SELECT p2.name FROM service_desk_slots sds JOIN people p2 ON p2.id = sds.resource_id ...;',
    },
  },
}

export function cloneDefaultFieldConfig(): FieldEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_FIELD_CONFIG.indicators).map(([k, v]) => [
        k, { ...v, indices: v.indices.map((i) => ({ ...i })) },
      ]),
    ) as Record<FieldIndicatorKey, FieldIndicatorConfig>,
  }
}
