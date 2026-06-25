import type {
  InstallationEngineConfig,
  InstallationIndicatorConfig,
  InstallationIndicatorKey,
} from '@/types'

export const INSTALL_INDICATOR_ORDER: InstallationIndicatorKey[] = [
  'scheduleCount', 'avgSla', 'slaOverdue', 'saleToSchedule', 'technician',
]

interface Range { key: string; label: string; max: number; defaultPoints: number }

export function bucketByMax(value: number, ranges: Range[]): { key: string; label: string } {
  const r = ranges.find((x) => value <= x.max) ?? ranges[ranges.length - 1]
  return { key: r.key, label: r.label }
}

// Alterações de agendamento (tentativas) — mais remarcações = pior
export const SCHEDULE_RANGES: Range[] = [
  { key: '0', label: 'Sem agendamento', max: 0, defaultPoints: 0 },
  { key: '1-2', label: '1 a 2 agendamentos', max: 2, defaultPoints: -3 },
  { key: '3-5', label: '3 a 5 agendamentos', max: 5, defaultPoints: -12 },
  { key: '6+', label: '6+ agendamentos', max: Infinity, defaultPoints: -22 },
]

// Média de SLA do protocolo (dias até conclusão) — mais demorado = pior
export const AVG_SLA_RANGES: Range[] = [
  { key: '<=1d', label: '≤ 1 dia', max: 1, defaultPoints: 5 },
  { key: '1-3d', label: '1 a 3 dias', max: 3, defaultPoints: 0 },
  { key: '3-7d', label: '3 a 7 dias', max: 7, defaultPoints: -10 },
  { key: '7-15d', label: '7 a 15 dias', max: 15, defaultPoints: -20 },
  { key: '15+d', label: '15+ dias', max: Infinity, defaultPoints: -32 },
]

// SLAs atrasados (qtd. fora do prazo)
export const SLA_OVERDUE_RANGES: Range[] = [
  { key: '0', label: 'Nenhum atraso', max: 0, defaultPoints: 5 },
  { key: '1', label: '1 atraso', max: 1, defaultPoints: -12 },
  { key: '2+', label: '2+ atrasos', max: Infinity, defaultPoints: -25 },
]

// Média venda → agenda (dias entre a venda e o agendamento) — mais demora = pior experiência
export const SALE_TO_SCHEDULE_RANGES: Range[] = [
  { key: '<=2d', label: '≤ 2 dias', max: 2, defaultPoints: 5 },
  { key: '2-5d', label: '2 a 5 dias', max: 5, defaultPoints: 0 },
  { key: '5-10d', label: '5 a 10 dias', max: 10, defaultPoints: -10 },
  { key: '10-20d', label: '10 a 20 dias', max: 20, defaultPoints: -20 },
  { key: '20+d', label: '20+ dias', max: Infinity, defaultPoints: -32 },
]

const rangeIndices = (rs: Range[]) => rs.map((r) => ({ key: r.key, label: r.label, points: r.defaultPoints }))

export const DEFAULT_INSTALLATION_CONFIG: InstallationEngineConfig = {
  indicators: {
    scheduleCount: {
      key: 'scheduleCount', label: 'Alterações de Agendamento', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa de tentativas de agendamento da instalação.',
      indices: rangeIndices(SCHEDULE_RANGES),
      query: 'SELECT count(distinct sds.id) FROM service_desk_slots sds ... (it.code LIKE \'ATV%\');',
    },
    avgSla: {
      key: 'avgSla', label: 'Média de SLA', dynamic: false, mode: 'manual',
      description: 'Pontuação por tempo médio de conclusão do protocolo (created → conclusion_date).',
      indices: rangeIndices(AVG_SLA_RANGES),
      query: 'SELECT avg(conclusion_date - created) FROM assignments a ... (it.code LIKE \'ATV%\');',
    },
    slaOverdue: {
      key: 'slaOverdue', label: 'SLAs Atrasados', dynamic: false, mode: 'manual',
      description: 'Pontuação por protocolos de instalação fora do prazo (final_deadline).',
      indices: rangeIndices(SLA_OVERDUE_RANGES),
      query: 'SELECT count(*) WHERE conclusion_date > final_deadline OR (em aberto vencido);',
    },
    saleToSchedule: {
      key: 'saleToSchedule', label: 'Venda → Agenda', dynamic: false, mode: 'manual',
      description: 'Pontuação por tempo médio entre a venda (contract_created) e o agendamento da instalação.',
      indices: rangeIndices(SALE_TO_SCHEDULE_RANGES),
      query: 'SELECT avg(schedule_begin - contract_created) ...;',
    },
    technician: {
      key: 'technician', label: 'Técnicos', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por técnico que realizou a instalação. O cliente soma a nota de cada técnico distinto.',
      query: 'SELECT p2.name FROM service_desk_slots sds JOIN people p2 ON p2.id = sds.resource_id ...;',
    },
  },
}

export function cloneDefaultInstallationConfig(): InstallationEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_INSTALLATION_CONFIG.indicators).map(([k, v]) => [
        k, { ...v, indices: v.indices.map((i) => ({ ...i })) },
      ]),
    ) as Record<InstallationIndicatorKey, InstallationIndicatorConfig>,
  }
}
