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
