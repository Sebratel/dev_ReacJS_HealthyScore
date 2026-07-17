// Cliente do endpoint de pontuação sugerida (/api/cancellation-suggestions).
// O lift/sugestões agora são calculados NO SERVIDOR sobre a base ativa completa
// (materializada) × cancelados materializados na janela — o front só consome o
// resultado pronto (grupos + listas dinâmicas para o "Aplicar").
import type { EngineGroup, DynamicLists } from './suggestionEngine'
import { apiFetch, ApiError } from '@/lib/apiClient'

export { ApiError }

// Janela materializada pelo ETL noturno (limite do filtro de data disponível).
export interface MaterializedWindow {
  from: string
  to: string
  months: number
  count: number
}

// Status da base materializada devolvido pelo backend (datasetStatus()).
export interface SuggestionsMeta {
  loaded: boolean
  generatedAt: string | null
  coverage: string | null
  clients: number
  [k: string]: unknown
}

export interface SuggestionResult {
  groups: EngineGroup[]
  indicatorCount: number
  indexCount: number
  riskCount: number
  lists: DynamicLists
  activeCount: number
  cancelledCount: number
  window: { from: string; to: string }
  materializedWindow: MaterializedWindow | null
  meta: SuggestionsMeta
}

export async function fetchCancellationSuggestions(from: string, to: string): Promise<SuggestionResult> {
  const res = await apiFetch(`/api/cancellation-suggestions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 503) throw new ApiError(503, msg || 'Base ainda não materializada no backend.')
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor de sugestões.`)
  }
  return body as SuggestionResult
}

// ─── Clientes cancelados (perfil) ─────────────────────────────
// Linha da coorte de cancelados materializada — identidade + contrato + todos
// os sinais por cliente (rede vem zerada para cancelados; não exibir).
export interface CancelledClient {
  clientId: string
  name: string
  clientGender: string
  clientBirth: string | null
  seller: string
  contractNumber: string
  contractDate: string | null
  cancellationDate: string | null
  cancellationMotive: string | null
  plan: string
  monthlyValue: number
  paymentForm: string
  city: string
  neighborhood: string
  onTimeInvoices: number
  lateInvoices: number
  overdueInvoices: number
  totalInvoices: number
  renegotiations: number
  trustReleases: number
  equipment: string[]
  protocolCount: number
  scheduleCount: number
  slaLateCount: number
  avgSlaDays: number
  reasons: string[]
  technicians: string[]
  installProtocols: number
  installScheduleCount: number
  installSlaLateCount: number
  installAvgSlaDays: number
  installSaleToScheduleDays: number
  installTechnicians: string[]
  relProtocolCount: number
  relRecurrenceDays: number
  relAvgOverageHours: number
  relCancelThreats: number
  relTypes: string[]
  relAttendants: string[]
}

export interface MotiveAgg { value: string; count: number; mrr: number }

export interface CancelledClientsResult {
  rows: CancelledClient[]
  total: number
  page: number
  pageSize: number
  cities: string[]
  motives: MotiveAgg[]
  window: { from: string; to: string }
  materializedWindow: MaterializedWindow | null
  meta: SuggestionsMeta
}

export interface CancelledClientsQuery {
  from?: string
  to?: string
  name?: string
  contract?: string
  city?: string
  motive?: string
  page?: number
  pageSize?: number
}

export async function fetchCancelledClients(q: CancelledClientsQuery): Promise<CancelledClientsResult> {
  const params = new URLSearchParams()
  if (q.from) params.set('from', q.from)
  if (q.to) params.set('to', q.to)
  if (q.name) params.set('name', q.name)
  if (q.contract) params.set('contract', q.contract)
  if (q.city) params.set('city', q.city)
  if (q.motive) params.set('motive', q.motive)
  if (q.page !== undefined) params.set('page', String(q.page))
  if (q.pageSize !== undefined) params.set('pageSize', String(q.pageSize))
  const res = await apiFetch(`/api/cancelled-clients?${params.toString()}`)
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 503) throw new ApiError(503, msg || 'Base ainda não materializada no backend.')
    throw new ApiError(res.status, msg || `Erro ${res.status} ao listar cancelados.`)
  }
  return body as CancelledClientsResult
}
