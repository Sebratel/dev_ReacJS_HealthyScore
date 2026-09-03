// Cliente do endpoint /api/accuracy — assertividade do Health Score medida
// contra o histórico congelado (ver server/accuracy.mjs).
import { apiFetch } from '@/lib/apiClient'
import { ApiError } from '@/features/engines/engineApi'
import type { HealthClassification } from '@/types'

export interface AccuracyGroup {
  grupo: string
  label: string
  cancelados: number
  sinalizados: number
  recall: number | null
  lift: number | null
  ic95: { low: number; high: number } | null
  mrr: number | null
}

export interface AccuracyByClass {
  classificacao: HealthClassification
  naBase: number
  cancelaram: number
  taxa: number | null
}

export interface AccuracyPoint {
  asOf: string
  diasAcompanhados?: number
  coorte: number
  sinalizadosNaBase: number
  taxaSinalizada: number | null
  taxaCancelamento: number | null
  cancelados: number
  sinalizados: number
  recall: number | null
  lift: number | null
  ic95: { low: number; high: number } | null
  mrr: number | null
  precisao: number | null
  porGrupo: AccuracyGroup[]
  porClassificacao: AccuracyByClass[]
}

export interface AccuracyResponse {
  available: boolean
  reason?: string
  principal?: AccuracyPoint
  points: AccuracyPoint[]
  snapshotCoverage?: string | null
}

export async function fetchAccuracy(): Promise<AccuracyResponse> {
  const res = await apiFetch('/api/accuracy')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error || `Falha ao carregar a assertividade (HTTP ${res.status}).`)
  }
  return res.json()
}
