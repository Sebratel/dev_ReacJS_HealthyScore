// Cliente do endpoint de pontuação sugerida (/api/cancellation-suggestions).
// Devolve os dois coortes (ativos amostrados × cancelados na janela) já no shape
// RealClient — o cálculo do lift/sugestões roda no front (buildSuggestions).
import { useAuthStore } from '@/store/authStore'
import type { RealClient } from '@/types'

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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchCancellationSuggestions(from: string, to: string): Promise<SuggestionCohorts> {
  const token = useAuthStore.getState().accessToken
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  let res: Response
  try {
    res = await fetch(`/api/cancellation-suggestions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers })
  } catch {
    throw new ApiError(0, 'Não foi possível falar com o servidor (backend offline?).')
  }
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 401) throw new ApiError(401, msg || 'Sessão expirada. Entre novamente.')
    if (res.status === 403) throw new ApiError(403, msg || 'Sem permissão.')
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor de sugestões.`)
  }
  return body as SuggestionCohorts
}
