// ─────────────────────────────────────────────────────────────────────────
// MOCKUP — dados ILUSTRATIVOS de clientes cancelados para a tela "Perfis de
// Cancelamento". NÃO vêm do banco. Quando as queries reais de cancelados
// estiverem prontas, este arquivo é substituído pela camada de dados real
// (mesmos campos → a tela não muda).
// ─────────────────────────────────────────────────────────────────────────

export interface CancelledClient {
  id: string
  name: string
  city: string
  neighborhood: string
  plan: string
  monthlyValue: number
  paymentForm: string
  tenureMonths: number        // tempo de contrato até o cancelamento
  cancelDate: string
  reason: string              // motivo do cancelamento
  competitor: string | null
  lateInvoices: number        // faturas pagas em atraso
  overdueInvoices: number     // faturas vencidas em aberto
  protocols: number           // protocolos de suporte/manutenção
  cancelThreats: number       // ameaças de cancelamento registradas
  massives: number            // massivas que afetaram o cliente
  equipmentReturned: boolean
}

// Filtros do construtor de perfil. '' / 0 / false = "qualquer".
export interface ProfileFilters {
  plan: string
  city: string
  paymentForm: string
  reason: string
  competitor: string
  valueBucket: string         // '' | '<90' | '90-130' | '130-180' | '>180'
  tenureBucket: string        // '' | '<6' | '6-12' | '12-24' | '>24'
  minLate: number
  minProtocols: number
  threatsOnly: boolean
}

export const EMPTY_FILTERS: ProfileFilters = {
  plan: '', city: '', paymentForm: '', reason: '', competitor: '',
  valueBucket: '', tenureBucket: '', minLate: 0, minProtocols: 0, threatsOnly: false,
}

// Perfil de cancelamento salvo: um conjunto de filtros + o peso de pontuação
// que será aplicado às engines para clientes ATIVOS que batem com o perfil.
export interface CancellationProfile {
  id: string
  name: string
  filters: ProfileFilters
  scorePoints: number         // pontos de churn risk somados quando o cliente bate
  color: string
}

// ─── Catálogos (opções dos filtros) ────────────────────────────
export const CITIES = ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Santa Maria', 'Passo Fundo', 'Gravataí']
export const NEIGHBORHOODS = ['Centro', 'São José', 'Cidade Nova', 'Jardim América', 'Rio Branco', 'Bela Vista']
export const PLANS = [
  { name: 'Fibra 100MB', value: 89.9 },
  { name: 'Fibra 200MB', value: 109.9 },
  { name: 'Fibra 300MB', value: 129.9 },
  { name: 'Fibra 500MB', value: 159.9 },
  { name: 'Fibra 1GB', value: 199.9 },
]
export const PAYMENT_FORMS = ['Boleto', 'PIX', 'Débito automático', 'Cartão de crédito']
export const REASONS = [
  'Preço / Concorrência',
  'Financeiro / Inadimplência',
  'Insatisfação técnica',
  'Atendimento ruim',
  'Mudança de endereço',
  'Sem uso / não precisa',
  'Outros',
]
export const COMPETITORS = ['Vivo Fibra', 'Claro', 'Brisanet', 'RedeVip']

export const VALUE_BUCKETS = [
  { key: '<90', label: 'Até R$ 90', test: (v: number) => v < 90 },
  { key: '90-130', label: 'R$ 90–130', test: (v: number) => v >= 90 && v < 130 },
  { key: '130-180', label: 'R$ 130–180', test: (v: number) => v >= 130 && v < 180 },
  { key: '>180', label: 'Acima de R$ 180', test: (v: number) => v >= 180 },
]
export const TENURE_BUCKETS = [
  { key: '<6', label: '< 6 meses', test: (m: number) => m < 6 },
  { key: '6-12', label: '6–12 meses', test: (m: number) => m >= 6 && m < 12 },
  { key: '12-24', label: '12–24 meses', test: (m: number) => m >= 12 && m < 24 },
  { key: '>24', label: '+ de 24 meses', test: (m: number) => m >= 24 },
]

// ─── Gerador determinístico (seeded) — mockup reprodutível ──────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sabrina', 'Tiago', 'Vanessa', 'William']
const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Ferreira', 'Rodrigues', 'Gomes', 'Martins']

const rnd = mulberry32(20260629)
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]
const pickWeighted = <T,>(arr: T[], weights: number[]) => {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rnd() * total
  for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i] }
  return arr[arr.length - 1]
}
const intBetween = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))

function makeCancelled(i: number): CancelledClient {
  const reason = pickWeighted(REASONS, [26, 22, 16, 12, 10, 8, 6])
  // Plano enviesado para os mais baratos (quem cancela tende a ter plano menor).
  const plan = pickWeighted(PLANS, [34, 26, 18, 14, 8])
  const paymentForm = pickWeighted(PAYMENT_FORMS, [46, 28, 16, 10])
  const city = pick(CITIES)

  // Sinais correlacionados ao motivo (deixa os perfis "fazerem sentido").
  let lateInvoices = intBetween(0, 2)
  let overdueInvoices = 0
  let protocols = intBetween(0, 2)
  let cancelThreats = 0
  let massives = intBetween(0, 1)
  let competitor: string | null = null
  let tenureMonths = intBetween(8, 40)

  if (reason === 'Financeiro / Inadimplência') {
    lateInvoices = intBetween(3, 7); overdueInvoices = intBetween(1, 4); cancelThreats = intBetween(0, 2)
  } else if (reason === 'Insatisfação técnica') {
    protocols = intBetween(4, 10); massives = intBetween(2, 6); cancelThreats = intBetween(1, 3)
  } else if (reason === 'Atendimento ruim') {
    protocols = intBetween(3, 8); cancelThreats = intBetween(1, 3)
  } else if (reason === 'Preço / Concorrência') {
    competitor = pickWeighted(COMPETITORS, [20, 18, 40, 22]); tenureMonths = intBetween(2, 14); cancelThreats = intBetween(0, 2)
  } else if (reason === 'Mudança de endereço') {
    tenureMonths = intBetween(10, 44)
  } else if (reason === 'Sem uso / não precisa') {
    tenureMonths = intBetween(3, 18)
  }

  return {
    id: `CX${String(1000 + i)}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    city,
    neighborhood: pick(NEIGHBORHOODS),
    plan: plan.name,
    monthlyValue: plan.value,
    paymentForm,
    tenureMonths,
    cancelDate: `2026-${String(intBetween(1, 6)).padStart(2, '0')}-${String(intBetween(1, 28)).padStart(2, '0')}`,
    reason,
    competitor,
    lateInvoices,
    overdueInvoices,
    protocols,
    cancelThreats,
    massives,
    equipmentReturned: rnd() > 0.32,
  }
}

export const CANCELLED: CancelledClient[] = Array.from({ length: 120 }, (_, i) => makeCancelled(i))

// ─── Aplicação dos filtros ──────────────────────────────────────
export function applyFilters(list: CancelledClient[], f: ProfileFilters): CancelledClient[] {
  const vb = VALUE_BUCKETS.find((b) => b.key === f.valueBucket)
  const tb = TENURE_BUCKETS.find((b) => b.key === f.tenureBucket)
  return list.filter((c) =>
    (!f.plan || c.plan === f.plan) &&
    (!f.city || c.city === f.city) &&
    (!f.paymentForm || c.paymentForm === f.paymentForm) &&
    (!f.reason || c.reason === f.reason) &&
    (!f.competitor || c.competitor === f.competitor) &&
    (!vb || vb.test(c.monthlyValue)) &&
    (!tb || tb.test(c.tenureMonths)) &&
    (c.lateInvoices >= f.minLate) &&
    (c.protocols >= f.minProtocols) &&
    (!f.threatsOnly || c.cancelThreats > 0),
  )
}

export function hasAnyFilter(f: ProfileFilters): boolean {
  return !!(f.plan || f.city || f.paymentForm || f.reason || f.competitor ||
    f.valueBucket || f.tenureBucket || f.minLate || f.minProtocols || f.threatsOnly)
}

// Descreve os filtros como "chips" legíveis (para o cabeçalho e os cards).
export function describeFilters(f: ProfileFilters): string[] {
  const chips: string[] = []
  if (f.plan) chips.push(f.plan)
  if (f.city) chips.push(f.city)
  if (f.paymentForm) chips.push(`Pgto: ${f.paymentForm}`)
  if (f.reason) chips.push(f.reason)
  if (f.competitor) chips.push(`Concorrente: ${f.competitor}`)
  if (f.valueBucket) chips.push(VALUE_BUCKETS.find((b) => b.key === f.valueBucket)?.label || f.valueBucket)
  if (f.tenureBucket) chips.push(`Tempo ${TENURE_BUCKETS.find((b) => b.key === f.tenureBucket)?.label || f.tenureBucket}`)
  if (f.minLate) chips.push(`≥ ${f.minLate} faturas atrasadas`)
  if (f.minProtocols) chips.push(`≥ ${f.minProtocols} protocolos`)
  if (f.threatsOnly) chips.push('Com ameaça de cancelamento')
  return chips
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export interface SegmentStats {
  count: number
  pctOfTotal: number          // % do total de cancelados
  avgTicket: number
  avgTenure: number
  revenueLost: number         // MRR perdido/mês do segmento
  lift: number                // quão mais "arriscado" que a média dos cancelados
  suggestedPoints: number     // pontos de churn risk sugeridos p/ o perfil
}

// Métricas do segmento. O "lift" e os "pontos sugeridos" são ESTIMATIVAS de
// mockup: comparam os sinais médios do segmento com a média geral dos cancelados.
export function segmentStats(segment: CancelledClient[], universe: CancelledClient[]): SegmentStats {
  const count = segment.length
  const baseLate = avg(universe.map((c) => c.lateInvoices)) || 1
  const baseProt = avg(universe.map((c) => c.protocols)) || 1
  const baseThreat = avg(universe.map((c) => c.cancelThreats)) || 0.5
  const baseTenure = avg(universe.map((c) => c.tenureMonths)) || 1

  const segLate = avg(segment.map((c) => c.lateInvoices))
  const segProt = avg(segment.map((c) => c.protocols))
  const segThreat = avg(segment.map((c) => c.cancelThreats))
  const segTenure = avg(segment.map((c) => c.tenureMonths)) || 1

  // Lift composto: atrasos + protocolos + ameaças acima da média e tempo de
  // contrato abaixo da média puxam o índice para cima.
  const lift = count === 0 ? 0 : (
    0.35 * (segLate / baseLate) +
    0.25 * (segProt / baseProt) +
    0.20 * (segThreat / (baseThreat || 1)) +
    0.20 * (baseTenure / segTenure)
  )

  return {
    count,
    pctOfTotal: universe.length ? (count / universe.length) * 100 : 0,
    avgTicket: avg(segment.map((c) => c.monthlyValue)),
    avgTenure: segTenure,
    revenueLost: segment.reduce((a, c) => a + c.monthlyValue, 0),
    lift,
    suggestedPoints: count === 0 ? 0 : Math.max(3, Math.min(40, Math.round((lift - 1) * 22))),
  }
}

// ─── Perfis de exemplo (pré-criados) ───────────────────────────
export const SAMPLE_PROFILES: CancellationProfile[] = [
  {
    id: 'p1',
    name: 'Inadimplência + Boleto',
    color: '#ef4444',
    scorePoints: 28,
    filters: { ...EMPTY_FILTERS, reason: 'Financeiro / Inadimplência', paymentForm: 'Boleto', minLate: 3 },
  },
  {
    id: 'p2',
    name: 'Churn precoce por preço',
    color: '#f97316',
    scorePoints: 22,
    filters: { ...EMPTY_FILTERS, reason: 'Preço / Concorrência', tenureBucket: '<6' },
  },
  {
    id: 'p3',
    name: 'Insatisfação técnica recorrente',
    color: '#f59e0b',
    scorePoints: 18,
    filters: { ...EMPTY_FILTERS, reason: 'Insatisfação técnica', minProtocols: 4, threatsOnly: true },
  },
]
