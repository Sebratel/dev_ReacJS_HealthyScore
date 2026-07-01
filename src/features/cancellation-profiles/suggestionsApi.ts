// Cliente do endpoint de pontuação sugerida (/api/cancellation-suggestions).
// Devolve os dois coortes (ativos amostrados × cancelados na janela) já no shape
// RealClient — o cálculo do lift/sugestões roda no front (buildSuggestions).
import type { RealClient } from '@/types'
import { apiFetch, ApiError } from '@/lib/apiClient'

export { ApiError }

export interface SuggestionsMeta {
  from: string
  to: string
  sampleLimit: number
  activeCount: number
  cancelledCount: number
  warnings: string[]
}

export interface SuggestionCohorts {
  active: RealClient[]
  cancelled: RealClient[]
  meta: SuggestionsMeta
}

export async function fetchCancellationSuggestions(from: string, to: string): Promise<SuggestionCohorts> {
  const res = await apiFetch(`/api/cancellation-suggestions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 503) throw new ApiError(503, msg || 'Base ainda não materializada no backend.')
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor de sugestões.`)
  }
  return body as SuggestionCohorts
}
