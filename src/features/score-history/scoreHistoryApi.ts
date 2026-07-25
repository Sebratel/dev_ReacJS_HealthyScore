import { apiFetch, ApiError } from '@/lib/apiClient'

export interface ScorePoint {
  date: string
  overall: number
  classification: string
  cancelled: boolean
  byEngine: Record<string, number>
}
export interface ScoreHistoryStatus {
  loaded: boolean
  points: number
  from: string | null
  to: string | null
  clients: number
}
export interface ScoreHistoryResult {
  clientId: string
  points: ScorePoint[]
  status: ScoreHistoryStatus
}

export { ApiError }

export async function fetchScoreHistory(clientId: string): Promise<ScoreHistoryResult> {
  const res = await apiFetch(`/api/clients/${encodeURIComponent(clientId)}/score-history`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body?.error || 'Não foi possível carregar o histórico de score.')
  return body as ScoreHistoryResult
}
