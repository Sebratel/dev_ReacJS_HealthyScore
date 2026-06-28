import type { RealClient } from '@/types'

export interface RealClientsMeta {
  generatedAt: string
  source: string
  fromDate: string
  sampleSize: number
  coverage?: 'full' | 'sample'
}
export interface RealTotals { clients: number; contracts: number; mrr: number }
export interface RealCityAgg { city: string; contracts: number; mrr: number }
export interface RealMonthly { month: string; onTime: number; late: number; overdue: number }
export interface RealDistinctEntry { value: string; count: number }
export interface RealValueEntry { value: number; count: number }
export interface RealCommercial {
  sellers: RealDistinctEntry[]
  plans: RealDistinctEntry[]
  values: RealValueEntry[]
  cities: RealDistinctEntry[]
  neighborhoods: RealDistinctEntry[]
  clientGenders: RealDistinctEntry[]
  sellerGenders: RealDistinctEntry[]
}
export interface RealConnection {
  models: RealDistinctEntry[]
}
export interface RealField {
  reasons: RealDistinctEntry[]
  technicians: RealDistinctEntry[]
}
export interface RealInstallation {
  technicians: RealDistinctEntry[]
}
export interface RealRelationship {
  types: RealDistinctEntry[]
  attendants: RealDistinctEntry[]
}
export interface RealNetwork {
  totalMassives: number
  splittersAffected: number
}

interface RealClientsFile {
  meta: RealClientsMeta
  totals: RealTotals
  paymentForms: string[]
  byCity: RealCityAgg[]
  monthly: RealMonthly[]
  commercial: RealCommercial
  connection: RealConnection
  field: RealField
  installation: RealInstallation
  relationship: RealRelationship
  network: RealNetwork
  clients: RealClient[]
}

// Caminho do snapshot gerado pelo job diário (scripts/fetch-clients.mjs).
// Extensão neutra (.data) para nenhum host aplicar Content-Encoding automático —
// o conteúdo é gzip e descomprimimos manualmente aqui. (~9 MB transferidos.)
const DATA_URL = '/realClients.data'

// ─── Bindings preenchidos por loadRealData() no boot (antes de renderizar o app) ───
// São live bindings ESM: os consumidores leem o valor atual em tempo de execução
// (dentro de render/useMemo/useEffect), nunca no escopo de módulo.
export let realMeta: RealClientsMeta = { generatedAt: '', source: '', fromDate: '', sampleSize: 0 }
export let realTotals: RealTotals = { clients: 0, contracts: 0, mrr: 0 }
export let realPaymentForms: string[] = []
export let realByCity: RealCityAgg[] = []
export let realMonthly: RealMonthly[] = []
export let realCommercial: RealCommercial = { sellers: [], plans: [], values: [], cities: [], neighborhoods: [], clientGenders: [], sellerGenders: [] }
export let realConnection: RealConnection = { models: [] }
export let realField: RealField = { reasons: [], technicians: [] }
export let realInstallation: RealInstallation = { technicians: [] }
export let realRelationship: RealRelationship = { types: [], attendants: [] }
export let realNetwork: RealNetwork = { totalMassives: 0, splittersAffected: 0 }
export let realClients: RealClient[] = []

let loaded = false
let loadingPromise: Promise<void> | null = null

export function isRealDataLoaded() {
  return loaded
}

// Rótulo de cobertura para os rodapés das telas:
//   base completa → "base completa · 81.335 clientes"
//   amostra       → "amostra de 2.000 clientes"
export function coverageLabel(): string {
  if (realMeta.coverage === 'full') return `base completa · ${realTotals.clients.toLocaleString('pt-BR')} clientes`
  return `amostra de ${realMeta.sampleSize.toLocaleString('pt-BR')} clientes`
}

async function decompressGzip(res: Response): Promise<string> {
  if (typeof DecompressionStream === 'undefined' || !res.body) {
    // Navegador sem DecompressionStream — tenta interpretar como texto puro
    // (caso o snapshot tenha sido servido já descomprimido).
    return res.text()
  }
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

// Baixa e descomprime o snapshot completo uma única vez. Idempotente e seguro
// contra chamadas concorrentes (compartilha a mesma Promise).
export function loadRealData(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const res = await fetch(DATA_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`Não foi possível carregar a base de clientes (HTTP ${res.status})`)
    const text = await decompressGzip(res)
    const data = JSON.parse(text) as RealClientsFile

    realMeta = data.meta
    realTotals = data.totals
    realPaymentForms = data.paymentForms
    realByCity = data.byCity
    realMonthly = data.monthly
    realCommercial = data.commercial
    realConnection = data.connection
    realField = data.field
    realInstallation = data.installation
    realRelationship = data.relationship
    realNetwork = data.network
    realClients = data.clients
    loaded = true
  })()

  // Em caso de erro, libera a Promise para permitir retry.
  loadingPromise.catch(() => { loadingPromise = null })
  return loadingPromise
}
