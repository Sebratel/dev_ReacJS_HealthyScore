// ─────────────────────────────────────────────────────────────────────────
// MOTOR DE PONTUAÇÃO SUGERIDA (lift) — agrega TODOS os indicadores das 7
// engines e, para cada índice/faixa, compara a prevalência entre a base ATIVA
// e a coorte de CANCELADOS:
//
//     lift = prevalência(cancelados) / prevalência(ativos)
//
//   lift > 1 → atributo mais comum em quem cancelou → sinal de RISCO (pontos −)
//   lift < 1 → atributo mais comum em quem ficou    → PROTETOR   (pontos +)
//
// A pontuação sugerida é uma função do lift, limitada a uma faixa sensata.
// Cada sugestão carrega os números crus (contagens e %) para a tela explicar
// "como cheguei nisso".
// ─────────────────────────────────────────────────────────────────────────
import { differenceInMonths, differenceInYears } from 'date-fns'
import type { RealClient } from '@/types'
import {
  CONTRACT_AGE_RANGES, PERSON_AGE_RANGES, SELLER_TENURE_RANGES,
  contractAgeBucket, personAgeBucket, sellerTenureBucket,
} from '@/features/commercial-engine/commercialConfig'
import {
  bucketByMax, MASSIVE_RANGES, OFFLINE_RANGES, OVERAGE_RANGES,
} from '@/features/network-engine/networkConfig'
import {
  PROTOCOL_RANGES as FIELD_PROTOCOL_RANGES, SCHEDULE_RANGES as FIELD_SCHEDULE_RANGES,
  SLA_OVERDUE_RANGES as FIELD_SLA_OVERDUE_RANGES, AVG_SLA_RANGES as FIELD_AVG_SLA_RANGES,
} from '@/features/field-engine/fieldConfig'
import {
  SCHEDULE_RANGES as INSTALL_SCHEDULE_RANGES, AVG_SLA_RANGES as INSTALL_AVG_SLA_RANGES,
  SLA_OVERDUE_RANGES as INSTALL_SLA_OVERDUE_RANGES, SALE_TO_SCHEDULE_RANGES,
} from '@/features/installation-engine/installationConfig'
import {
  PROTOCOL_RANGES as REL_PROTOCOL_RANGES, RECURRENCE_RANGES, CANCEL_RANGES,
  SLA_SATISFACTION_RANGES,
} from '@/features/relationship-engine/relationshipConfig'

// ─── Tipos ─────────────────────────────────────────────────────
export type SuggestionEngineKey =
  | 'financial' | 'commercial' | 'connection' | 'network'
  | 'field' | 'installation' | 'relationship'

// Listas dinâmicas (categorias reais vindas do snapshot do ETL).
export interface DynamicLists {
  paymentForms: { key: string; label: string }[]
  sellers: { key: string; label: string }[]
  plans: { key: string; label: string }[]
  planValues: { key: string; label: string }[]
  cities: { key: string; label: string }[]
  neighborhoods: { key: string; label: string }[]
  clientGenders: { key: string; label: string }[]
  sellerGenders: { key: string; label: string }[]
  models: { key: string; label: string }[]
  reasons: { key: string; label: string }[]
  fieldTechnicians: { key: string; label: string }[]
  installTechnicians: { key: string; label: string }[]
  relTypes: { key: string; label: string }[]
  attendants: { key: string; label: string }[]
}

export interface IndexSuggestion {
  indexKey: string
  label: string
  activeCount: number
  activeRate: number      // 0..1 (sobre a população relevante ativa)
  cancelledCount: number
  cancelledRate: number   // 0..1
  lift: number | null     // null = amostra insuficiente
  suggestedPoints: number | null
  enough: boolean
}

export interface IndicatorSuggestion {
  engineKey: SuggestionEngineKey
  engineLabel: string
  indicatorKey: string
  indicatorLabel: string
  description: string
  presence: boolean       // true → pontua o indicador inteiro (sem índices)
  multi: boolean          // cliente pode bater em vários índices
  activeRelevant: number  // tamanho da população relevante (ativos)
  cancelledRelevant: number
  indices: IndexSuggestion[]
}

export interface EngineGroup {
  engineKey: SuggestionEngineKey
  engineLabel: string
  indicators: IndicatorSuggestion[]
}

// ─── Helpers de data ───────────────────────────────────────────
function monthsSince(dateStr: string | null): number {
  if (!dateStr) return -1
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return -1
  return Math.max(0, differenceInMonths(new Date(), d))
}
function ageYears(dateStr: string | null): number {
  if (!dateStr) return -1
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return -1
  return Math.max(0, differenceInYears(new Date(), d))
}

const rangeIndices = (rs: { key: string; label: string }[]) => rs.map((r) => ({ key: r.key, label: r.label }))
const PRESENCE_INDEX = [{ key: 'present', label: 'Quando presente no contrato' }]

// ─── Descritor de indicador ────────────────────────────────────
interface Descriptor {
  engineKey: SuggestionEngineKey
  engineLabel: string
  indicatorKey: string
  indicatorLabel: string
  description: string
  presence: boolean
  multi: boolean
  relevant: (c: RealClient) => boolean
  classify: (c: RealClient) => string[]
  indicesOf: (lists: DynamicLists) => { key: string; label: string }[]
}

const ALL = () => true
const bk = (v: number, rs: any[]) => bucketByMax(v, rs).key

// ─── Registro completo dos indicadores (espelha as 7 engines) ──
const DESCRIPTORS: Descriptor[] = [
  // ── Financeiro ──
  {
    engineKey: 'financial', engineLabel: 'Financeiro', indicatorKey: 'overdueBills',
    indicatorLabel: 'Faturas Atrasadas',
    description: 'Faturas pagas em atraso ou em aberto vencidas.',
    presence: true, multi: false, relevant: ALL,
    classify: (c) => (c.lateInvoices + c.overdueInvoices > 0 ? ['present'] : []),
    indicesOf: () => PRESENCE_INDEX,
  },
  {
    engineKey: 'financial', engineLabel: 'Financeiro', indicatorKey: 'trustReleases',
    indicatorLabel: 'Liberações por Confiança',
    description: 'Desbloqueio financeiro por confiança no contrato.',
    presence: true, multi: false, relevant: ALL,
    classify: (c) => (c.trustReleases > 0 ? ['present'] : []),
    indicesOf: () => PRESENCE_INDEX,
  },
  {
    engineKey: 'financial', engineLabel: 'Financeiro', indicatorKey: 'renegotiations',
    indicatorLabel: 'Renegociações',
    description: 'Contrato possui títulos renegociados.',
    presence: true, multi: false, relevant: ALL,
    classify: (c) => (c.renegotiations > 0 ? ['present'] : []),
    indicesOf: () => PRESENCE_INDEX,
  },
  {
    engineKey: 'financial', engineLabel: 'Financeiro', indicatorKey: 'onTimePayments',
    indicatorLabel: 'Faturas pagas no prazo',
    description: 'Contrato possui faturas pagas até o vencimento.',
    presence: true, multi: false, relevant: ALL,
    classify: (c) => (c.onTimeInvoices > 0 ? ['present'] : []),
    indicesOf: () => PRESENCE_INDEX,
  },
  {
    engineKey: 'financial', engineLabel: 'Financeiro', indicatorKey: 'paymentMethod',
    indicatorLabel: 'Forma de Pagamento',
    description: 'Forma de pagamento do contrato.',
    presence: false, multi: false,
    relevant: (c) => !!c.paymentForm && c.paymentForm !== 'Não informado',
    classify: (c) => (c.paymentForm ? [c.paymentForm] : []),
    indicesOf: (l) => l.paymentForms,
  },

  // ── Comercial ──
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'seller',
    indicatorLabel: 'Vendedor', description: 'Vendedor responsável pelo contrato.',
    presence: false, multi: false, relevant: (c) => !!c.seller,
    classify: (c) => (c.seller ? [c.seller] : []), indicesOf: (l) => l.sellers,
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'plan',
    indicatorLabel: 'Plano', description: 'Plano contratado.',
    presence: false, multi: false, relevant: (c) => !!c.plan,
    classify: (c) => (c.plan ? [c.plan] : []), indicesOf: (l) => l.plans,
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'planValue',
    indicatorLabel: 'Valor do Plano', description: 'Valor mensal do plano.',
    presence: false, multi: false, relevant: (c) => c.monthlyValue > 0,
    classify: (c) => [String(c.monthlyValue)], indicesOf: (l) => l.planValues,
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'contractAge',
    indicatorLabel: 'Tempo de Contrato', description: 'Faixa de tempo desde a criação do contrato.',
    presence: false, multi: false, relevant: (c) => monthsSince(c.contractDate) >= 0,
    classify: (c) => [contractAgeBucket(monthsSince(c.contractDate)).key],
    indicesOf: () => rangeIndices(CONTRACT_AGE_RANGES),
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'city',
    indicatorLabel: 'Cidade', description: 'Cidade do cliente.',
    presence: false, multi: false, relevant: (c) => !!c.city,
    classify: (c) => (c.city ? [c.city] : []), indicesOf: (l) => l.cities,
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'neighborhood',
    indicatorLabel: 'Bairro', description: 'Bairro do cliente.',
    presence: false, multi: false, relevant: (c) => !!c.neighborhood,
    classify: (c) => (c.neighborhood ? [c.neighborhood] : []), indicesOf: (l) => l.neighborhoods,
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'clientAge',
    indicatorLabel: 'Idade do Cliente', description: 'Faixa etária do cliente.',
    presence: false, multi: false, relevant: (c) => ageYears(c.clientBirth) >= 0,
    classify: (c) => [personAgeBucket(ageYears(c.clientBirth)).key],
    indicesOf: () => rangeIndices(PERSON_AGE_RANGES),
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'sellerAge',
    indicatorLabel: 'Idade do Vendedor', description: 'Faixa etária do vendedor.',
    presence: false, multi: false, relevant: (c) => ageYears(c.sellerBirth) >= 0,
    classify: (c) => [personAgeBucket(ageYears(c.sellerBirth)).key],
    indicesOf: () => rangeIndices(PERSON_AGE_RANGES),
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'clientGender',
    indicatorLabel: 'Gênero do Cliente', description: 'Gênero do cliente.',
    presence: false, multi: false, relevant: (c) => !!c.clientGender,
    classify: (c) => (c.clientGender ? [c.clientGender] : []), indicesOf: (l) => l.clientGenders,
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'sellerGender',
    indicatorLabel: 'Gênero do Vendedor', description: 'Gênero do vendedor.',
    presence: false, multi: false, relevant: (c) => !!c.sellerGender,
    classify: (c) => (c.sellerGender ? [c.sellerGender] : []), indicesOf: (l) => l.sellerGenders,
  },
  {
    engineKey: 'commercial', engineLabel: 'Comercial', indicatorKey: 'sellerTenure',
    indicatorLabel: 'Tempo de Casa do Vendedor', description: 'Tempo de casa do vendedor.',
    presence: false, multi: false, relevant: (c) => monthsSince(c.sellerAdmitted) >= 0,
    classify: (c) => [sellerTenureBucket(monthsSince(c.sellerAdmitted)).key],
    indicesOf: () => rangeIndices(SELLER_TENURE_RANGES),
  },

  // ── Conexão ──
  {
    engineKey: 'connection', engineLabel: 'Conexão', indicatorKey: 'equipment',
    indicatorLabel: 'Equipamento (modelo)', description: 'Modelo de equipamento alocado no contrato.',
    presence: false, multi: true, relevant: (c) => c.equipment.length > 0,
    classify: (c) => c.equipment, indicesOf: (l) => l.models,
  },

  // ── Rede ──
  {
    engineKey: 'network', engineLabel: 'Rede', indicatorKey: 'massiveCount',
    indicatorLabel: 'Qtd. de Massivas', description: 'Quantidade de massivas no splitter do contrato.',
    presence: false, multi: false, relevant: (c) => c.netMassiveCount > 0,
    classify: (c) => [bk(c.netMassiveCount, MASSIVE_RANGES)], indicesOf: () => rangeIndices(MASSIVE_RANGES),
  },
  {
    engineKey: 'network', engineLabel: 'Rede', indicatorKey: 'avgOffline',
    indicatorLabel: 'SLA Médio (offline)', description: 'Tempo médio fora do ar das massivas.',
    presence: false, multi: false, relevant: (c) => c.netMassiveCount > 0,
    classify: (c) => [bk(c.netAvgOfflineMin, OFFLINE_RANGES)], indicesOf: () => rangeIndices(OFFLINE_RANGES),
  },
  {
    engineKey: 'network', engineLabel: 'Rede', indicatorKey: 'slaOverage',
    indicatorLabel: 'Atraso de SLA', description: 'Atraso médio da massiva além do previsto.',
    presence: false, multi: false, relevant: (c) => c.netMassiveCount > 0,
    classify: (c) => [bk(c.netAvgOverageMin, OVERAGE_RANGES)], indicesOf: () => rangeIndices(OVERAGE_RANGES),
  },

  // ── Campo (manutenção) ──
  {
    engineKey: 'field', engineLabel: 'Campo', indicatorKey: 'protocolCount',
    indicatorLabel: 'Quantidade de Protocolos', description: 'Faixa de protocolos de manutenção.',
    presence: false, multi: false, relevant: (c) => c.protocolCount > 0,
    classify: (c) => [bk(c.protocolCount, FIELD_PROTOCOL_RANGES)], indicesOf: () => rangeIndices(FIELD_PROTOCOL_RANGES),
  },
  {
    engineKey: 'field', engineLabel: 'Campo', indicatorKey: 'reasons',
    indicatorLabel: 'Motivos', description: 'Motivo de abertura do protocolo (cliente soma cada motivo distinto).',
    presence: false, multi: true, relevant: (c) => c.protocolCount > 0,
    classify: (c) => c.reasons, indicesOf: (l) => l.reasons,
  },
  {
    engineKey: 'field', engineLabel: 'Campo', indicatorKey: 'scheduleCount',
    indicatorLabel: 'Agendamentos', description: 'Tentativas de agendamento.',
    presence: false, multi: false, relevant: (c) => c.protocolCount > 0,
    classify: (c) => [bk(c.scheduleCount, FIELD_SCHEDULE_RANGES)], indicesOf: () => rangeIndices(FIELD_SCHEDULE_RANGES),
  },
  {
    engineKey: 'field', engineLabel: 'Campo', indicatorKey: 'slaOverdue',
    indicatorLabel: 'SLAs Atrasados', description: 'Protocolos fora do prazo.',
    presence: false, multi: false, relevant: (c) => c.protocolCount > 0,
    classify: (c) => [bk(c.slaLateCount, FIELD_SLA_OVERDUE_RANGES)], indicesOf: () => rangeIndices(FIELD_SLA_OVERDUE_RANGES),
  },
  {
    engineKey: 'field', engineLabel: 'Campo', indicatorKey: 'avgSla',
    indicatorLabel: 'Média de SLA', description: 'Tempo médio de conclusão (dias).',
    presence: false, multi: false, relevant: (c) => c.protocolCount > 0,
    classify: (c) => [bk(c.avgSlaDays, FIELD_AVG_SLA_RANGES)], indicesOf: () => rangeIndices(FIELD_AVG_SLA_RANGES),
  },
  {
    engineKey: 'field', engineLabel: 'Campo', indicatorKey: 'technician',
    indicatorLabel: 'Técnicos', description: 'Técnico envolvido nos agendamentos (cliente soma cada técnico distinto).',
    presence: false, multi: true, relevant: (c) => c.protocolCount > 0,
    classify: (c) => c.technicians, indicesOf: (l) => l.fieldTechnicians,
  },

  // ── Instalação ──
  {
    engineKey: 'installation', engineLabel: 'Instalação', indicatorKey: 'scheduleCount',
    indicatorLabel: 'Alterações de Agendamento', description: 'Tentativas de agendamento da instalação.',
    presence: false, multi: false, relevant: (c) => c.installProtocols > 0,
    classify: (c) => [bk(c.installScheduleCount, INSTALL_SCHEDULE_RANGES)], indicesOf: () => rangeIndices(INSTALL_SCHEDULE_RANGES),
  },
  {
    engineKey: 'installation', engineLabel: 'Instalação', indicatorKey: 'avgSla',
    indicatorLabel: 'Média de SLA', description: 'Tempo médio de conclusão do protocolo de instalação.',
    presence: false, multi: false, relevant: (c) => c.installProtocols > 0,
    classify: (c) => [bk(c.installAvgSlaDays, INSTALL_AVG_SLA_RANGES)], indicesOf: () => rangeIndices(INSTALL_AVG_SLA_RANGES),
  },
  {
    engineKey: 'installation', engineLabel: 'Instalação', indicatorKey: 'slaOverdue',
    indicatorLabel: 'SLAs Atrasados', description: 'Protocolos de instalação fora do prazo.',
    presence: false, multi: false, relevant: (c) => c.installProtocols > 0,
    classify: (c) => [bk(c.installSlaLateCount, INSTALL_SLA_OVERDUE_RANGES)], indicesOf: () => rangeIndices(INSTALL_SLA_OVERDUE_RANGES),
  },
  {
    engineKey: 'installation', engineLabel: 'Instalação', indicatorKey: 'saleToSchedule',
    indicatorLabel: 'Venda → Agenda', description: 'Tempo médio entre a venda e o agendamento da instalação.',
    presence: false, multi: false, relevant: (c) => c.installProtocols > 0,
    classify: (c) => [bk(c.installSaleToScheduleDays, SALE_TO_SCHEDULE_RANGES)], indicesOf: () => rangeIndices(SALE_TO_SCHEDULE_RANGES),
  },
  {
    engineKey: 'installation', engineLabel: 'Instalação', indicatorKey: 'technician',
    indicatorLabel: 'Técnicos', description: 'Técnico que realizou a instalação (cliente soma cada técnico distinto).',
    presence: false, multi: true, relevant: (c) => c.installProtocols > 0,
    classify: (c) => c.installTechnicians, indicesOf: (l) => l.installTechnicians,
  },

  // ── Relacionamento ──
  {
    engineKey: 'relationship', engineLabel: 'Relacionamento', indicatorKey: 'protocolCount',
    indicatorLabel: 'Qtd. de Protocolos', description: 'Faixa de protocolos de relacionamento abertos.',
    presence: false, multi: false, relevant: (c) => c.relProtocolCount > 0,
    classify: (c) => [bk(c.relProtocolCount, REL_PROTOCOL_RANGES)], indicesOf: () => rangeIndices(REL_PROTOCOL_RANGES),
  },
  {
    engineKey: 'relationship', engineLabel: 'Relacionamento', indicatorKey: 'recurrence',
    indicatorLabel: 'Recorrência (Venda → Abertura)', description: 'Tempo médio entre a venda e a abertura dos protocolos.',
    presence: false, multi: false, relevant: (c) => c.relProtocolCount > 0,
    classify: (c) => [bk(c.relRecurrenceDays, RECURRENCE_RANGES)], indicesOf: () => rangeIndices(RECURRENCE_RANGES),
  },
  {
    engineKey: 'relationship', engineLabel: 'Relacionamento', indicatorKey: 'protocolType',
    indicatorLabel: 'Tipo de Protocolo', description: 'Tipo de protocolo aberto (cliente soma cada tipo distinto).',
    presence: false, multi: true, relevant: (c) => c.relProtocolCount > 0,
    classify: (c) => c.relTypes, indicesOf: (l) => l.relTypes,
  },
  {
    engineKey: 'relationship', engineLabel: 'Relacionamento', indicatorKey: 'cancelThreats',
    indicatorLabel: 'Ameaças de Cancelamento', description: 'Protocolos de intenção de cancelamento.',
    presence: false, multi: false, relevant: (c) => c.relProtocolCount > 0,
    classify: (c) => [bk(c.relCancelThreats, CANCEL_RANGES)], indicesOf: () => rangeIndices(CANCEL_RANGES),
  },
  {
    engineKey: 'relationship', engineLabel: 'Relacionamento', indicatorKey: 'attendant',
    indicatorLabel: 'Atendente', description: 'Atendente responsável (cliente soma cada atendente distinto).',
    presence: false, multi: true, relevant: (c) => c.relProtocolCount > 0,
    classify: (c) => c.relAttendants, indicesOf: (l) => l.attendants,
  },
  {
    engineKey: 'relationship', engineLabel: 'Relacionamento', indicatorKey: 'slaSatisfaction',
    indicatorLabel: 'Satisfação (SLA)', description: 'Atraso médio no atendimento (horas além do prazo).',
    presence: false, multi: false, relevant: (c) => c.relProtocolCount > 0,
    classify: (c) => [bk(c.relAvgOverageHours, SLA_SATISFACTION_RANGES)], indicesOf: () => rangeIndices(SLA_SATISFACTION_RANGES),
  },
]

// ─── Lift → pontuação sugerida ─────────────────────────────────
// lift 1 → 0 pts; lift 2 → −22; lift 3+ → −44; lift 0.5 → +11; lift 0 → +22.
// Risco (lift>1) pesa mais que proteção (limites assimétricos).
const SCALE = 22
function liftToPoints(lift: number): number {
  const capped = Math.min(lift, 3)
  const raw = -(capped - 1) * SCALE
  return Math.round(Math.max(-50, Math.min(25, raw)))
}

// Mínimo de clientes ativos no índice para arriscar uma sugestão.
const MIN_ACTIVE = 5

// Conta, por chave de índice, quantos clientes relevantes batem (dedup p/ multi),
// e o tamanho da população relevante (denominador).
//
// PRESENÇA (ex.: "tem fatura em atraso"): o denominador é TODA a população
//   relevante — quem NÃO tem o atributo continua no denominador, senão a taxa
//   daria sempre 100%. matches = clientes com o atributo.
// CATEGÓRICO / MULTI (ex.: vendedor, modelo): o denominador é quem tem o
//   atributo definido (classify não-vazio) — trata dado ausente (idade/gênero)
//   naturalmente. Cada cliente conta uma vez por chave distinta.
function tally(clients: RealClient[], d: Descriptor) {
  const byKey = new Map<string, number>()
  let denom = 0
  for (const c of clients) {
    if (!d.relevant(c)) continue
    const keys = d.classify(c)
    if (d.presence) {
      denom++
      if (keys.length > 0) byKey.set('present', (byKey.get('present') ?? 0) + 1)
      continue
    }
    if (keys.length === 0) continue
    denom++
    const seen = new Set<string>()
    for (const k of keys) {
      if (!k || seen.has(k)) continue
      seen.add(k)
      byKey.set(k, (byKey.get(k) ?? 0) + 1)
    }
  }
  return { byKey, denom }
}

export interface BuildResult {
  groups: EngineGroup[]
  flat: IndicatorSuggestion[]
  indicatorCount: number
  indexCount: number          // índices com sugestão válida
  riskCount: number           // índices sugeridos como risco (pontos < 0)
}

// Constrói as sugestões para todos os indicadores.
// opts.skipEngines: engines a ignorar (ex.: 'network' enquanto não há dado de
// cancelados de rede) — não entram nos grupos nem nas contagens.
export function buildSuggestions(
  active: RealClient[],
  cancelled: RealClient[],
  lists: DynamicLists,
  opts: { skipEngines?: SuggestionEngineKey[] } = {},
): BuildResult {
  const skip = new Set(opts.skipEngines ?? [])
  const flat: IndicatorSuggestion[] = []
  let indexCount = 0
  let riskCount = 0

  for (const d of DESCRIPTORS) {
    if (skip.has(d.engineKey)) continue
    const A = tally(active, d)
    const C = tally(cancelled, d)
    const canonical = d.indicesOf(lists)

    const indices: IndexSuggestion[] = canonical.map((idx) => {
      const aCount = A.byKey.get(idx.key) ?? 0
      const cCount = C.byKey.get(idx.key) ?? 0
      const aRate = A.denom ? aCount / A.denom : 0
      const cRate = C.denom ? cCount / C.denom : 0
      const enough = aCount >= MIN_ACTIVE && aRate > 0
      const lift = enough ? cRate / aRate : null
      const suggestedPoints = lift === null ? null : liftToPoints(lift)
      if (lift !== null) {
        indexCount++
        if ((suggestedPoints ?? 0) < 0) riskCount++
      }
      return {
        indexKey: idx.key, label: idx.label,
        activeCount: aCount, activeRate: aRate,
        cancelledCount: cCount, cancelledRate: cRate,
        lift, suggestedPoints, enough,
      }
    })

    // Ordena por impacto (|sugestão| desc); índices sem amostra vão para o fim.
    indices.sort((a, b) => {
      const ai = a.suggestedPoints === null ? -1 : Math.abs(a.suggestedPoints)
      const bi = b.suggestedPoints === null ? -1 : Math.abs(b.suggestedPoints)
      return bi - ai
    })

    flat.push({
      engineKey: d.engineKey, engineLabel: d.engineLabel,
      indicatorKey: d.indicatorKey, indicatorLabel: d.indicatorLabel,
      description: d.description, presence: d.presence, multi: d.multi,
      activeRelevant: A.denom, cancelledRelevant: C.denom,
      indices,
    })
  }

  // Agrupa por engine preservando a ordem do registro.
  const order: SuggestionEngineKey[] = (['financial', 'commercial', 'connection', 'network', 'field', 'installation', 'relationship'] as SuggestionEngineKey[]).filter((k) => !skip.has(k))
  const groups: EngineGroup[] = order.map((key) => {
    const items = flat.filter((f) => f.engineKey === key)
    return { engineKey: key, engineLabel: items[0]?.engineLabel ?? key, indicators: items }
  }).filter((g) => g.indicators.length > 0)

  return { groups, flat, indicatorCount: flat.length, indexCount, riskCount }
}
