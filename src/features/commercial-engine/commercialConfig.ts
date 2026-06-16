import type {
  CommercialEngineConfig,
  CommercialIndicatorConfig,
  CommercialIndicatorKey,
} from '@/types'

export const COMMERCIAL_INDICATOR_ORDER: CommercialIndicatorKey[] = [
  'seller', 'plan', 'planValue', 'contractAge', 'city', 'neighborhood',
  'clientAge', 'sellerAge', 'clientGender', 'sellerGender', 'sellerTenure',
]

// Mapeia o código de gênero do banco para rótulo (1 = Masculino, 2 = Feminino — ajustável)
export const GENDER_LABELS: Record<string, string> = { '1': 'Masculino', '2': 'Feminino' }
export function genderLabel(code: string): string {
  return GENDER_LABELS[code] ?? (code === '(sem gênero)' ? 'Não informado' : code)
}

// Faixas de idade de pessoas (cliente e vendedor)
export const PERSON_AGE_RANGES: { key: string; label: string; maxAge: number }[] = [
  { key: '<=25', label: 'Até 25 anos', maxAge: 26 },
  { key: '26-35', label: '26 a 35 anos', maxAge: 36 },
  { key: '36-45', label: '36 a 45 anos', maxAge: 46 },
  { key: '46-60', label: '46 a 60 anos', maxAge: 61 },
  { key: '60+', label: '60+ anos', maxAge: Infinity },
]
export function personAgeBucket(age: number): { key: string; label: string } {
  const r = PERSON_AGE_RANGES.find((x) => age < x.maxAge) ?? PERSON_AGE_RANGES[PERSON_AGE_RANGES.length - 1]
  return { key: r.key, label: r.label }
}

// Faixas de tempo de casa do vendedor (em meses desde a criação do usuário)
export const SELLER_TENURE_RANGES: { key: string; label: string; maxMonths: number }[] = [
  { key: '0-6m', label: '0 a 6 meses', maxMonths: 6 },
  { key: '6-12m', label: '6 a 12 meses', maxMonths: 12 },
  { key: '1-2y', label: '1 a 2 anos', maxMonths: 24 },
  { key: '2-5y', label: '2 a 5 anos', maxMonths: 60 },
  { key: '5y+', label: '5+ anos', maxMonths: Infinity },
]
export function sellerTenureBucket(months: number): { key: string; label: string } {
  const r = SELLER_TENURE_RANGES.find((x) => months < x.maxMonths) ?? SELLER_TENURE_RANGES[SELLER_TENURE_RANGES.length - 1]
  return { key: r.key, label: r.label }
}

// Faixas fixas de tempo de contrato (em meses). defaultPoints: gradiente de risco
// inicial (contrato novo = mais churn) — apenas ponto de partida, ajustável no modal.
export const CONTRACT_AGE_RANGES: { key: string; label: string; maxMonths: number; defaultPoints: number }[] = [
  { key: '0-3m',  label: '0 a 3 meses',   maxMonths: 3,        defaultPoints: -45 },
  { key: '3-6m',  label: '3 a 6 meses',   maxMonths: 6,        defaultPoints: -32 },
  { key: '6-9m',  label: '6 a 9 meses',   maxMonths: 9,        defaultPoints: -22 },
  { key: '9-12m', label: '9 a 12 meses',  maxMonths: 12,       defaultPoints: -14 },
  { key: '1-2y',  label: '1 a 2 anos',    maxMonths: 24,       defaultPoints: -6 },
  { key: '2-3y',  label: '2 a 3 anos',    maxMonths: 36,       defaultPoints: 0 },
  { key: '3-5y',  label: '3 a 5 anos',    maxMonths: 60,       defaultPoints: 4 },
  { key: '5y+',   label: '5+ anos',       maxMonths: Infinity, defaultPoints: 6 },
]

// Retorna a faixa de tempo de contrato para uma quantidade de meses
export function contractAgeBucket(months: number): { key: string; label: string } {
  const r = CONTRACT_AGE_RANGES.find((x) => months < x.maxMonths) ?? CONTRACT_AGE_RANGES[CONTRACT_AGE_RANGES.length - 1]
  return { key: r.key, label: r.label }
}

// Configuração padrão. Índices dinâmicos (vendedor/plano/valor/cidade/bairro)
// começam vazios e são sincronizados do banco em runtime (store.syncCommercialLists).
// "Tempo de contrato" tem faixas fixas. Pontuação padrão 0 — você define no modal.
export const DEFAULT_COMMERCIAL_CONFIG: CommercialEngineConfig = {
  indicators: {
    seller: {
      key: 'seller', label: 'Vendedor', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por vendedor responsável pelo contrato.',
      query: 'SELECT p2.name, count(*) FROM contracts c JOIN people p2 ON p2.id = c.seller_1_id GROUP BY p2.name;',
    },
    plan: {
      key: 'plan', label: 'Plano', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por plano contratado.',
      query: 'SELECT sp.title, count(*) FROM service_products sp ... GROUP BY sp.title;',
    },
    planValue: {
      key: 'planValue', label: 'Valor do Plano', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por valor mensal do plano.',
      query: 'SELECT sp.selling_price, count(*) FROM service_products sp ... GROUP BY sp.selling_price;',
    },
    contractAge: {
      key: 'contractAge', label: 'Tempo de Contrato', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa de tempo desde a criação do contrato.',
      indices: CONTRACT_AGE_RANGES.map((r) => ({ key: r.key, label: r.label, points: r.defaultPoints })),
      query: "SELECT c.created FROM contracts c WHERE c.id = :contractId;",
    },
    city: {
      key: 'city', label: 'Cidade', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por cidade do cliente.',
      query: 'SELECT ac.city, count(*) FROM authentication_contracts ac GROUP BY ac.city;',
    },
    neighborhood: {
      key: 'neighborhood', label: 'Bairro', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por bairro do cliente.',
      query: 'SELECT ac.neighborhood, count(*) FROM authentication_contracts ac GROUP BY ac.neighborhood;',
    },
    clientAge: {
      key: 'clientAge', label: 'Idade do Cliente', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa etária do cliente.',
      indices: PERSON_AGE_RANGES.map((r) => ({ key: r.key, label: r.label, points: 0 })),
      query: 'SELECT p.birth_date FROM people p WHERE p.id = :clientId;',
    },
    sellerAge: {
      key: 'sellerAge', label: 'Idade do Vendedor', dynamic: false, mode: 'manual',
      description: 'Pontuação por faixa etária do vendedor.',
      indices: PERSON_AGE_RANGES.map((r) => ({ key: r.key, label: r.label, points: 0 })),
      query: 'SELECT p2.birth_date FROM people p2 WHERE p2.id = :sellerId;',
    },
    clientGender: {
      key: 'clientGender', label: 'Gênero do Cliente', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por gênero do cliente.',
      query: 'SELECT p.gender FROM people p WHERE p.id = :clientId;',
    },
    sellerGender: {
      key: 'sellerGender', label: 'Gênero do Vendedor', dynamic: true, mode: 'manual', indices: [],
      description: 'Pontuação por gênero do vendedor.',
      query: 'SELECT p2.gender FROM people p2 WHERE p2.id = :sellerId;',
    },
    sellerTenure: {
      key: 'sellerTenure', label: 'Tempo de Casa do Vendedor', dynamic: false, mode: 'manual',
      description: 'Pontuação por tempo de casa do vendedor (desde a criação do usuário).',
      indices: SELLER_TENURE_RANGES.map((r) => ({ key: r.key, label: r.label, points: 0 })),
      query: 'SELECT p2.created FROM people p2 WHERE p2.id = :sellerId;',
    },
  },
}

export function cloneDefaultCommercialConfig(): CommercialEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_COMMERCIAL_CONFIG.indicators).map(([k, v]) => [
        k, { ...v, indices: v.indices.map((i) => ({ ...i })) },
      ]),
    ) as Record<CommercialIndicatorKey, CommercialIndicatorConfig>,
  }
}
