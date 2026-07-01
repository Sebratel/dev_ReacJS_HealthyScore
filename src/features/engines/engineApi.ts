// Cliente dos endpoints paginados por engine (POST /api/engine/:key).
// O backend pontua a base COMPLETA materializada usando a config + limiares que
// mandamos (ficam no navegador, por-usuário) e devolve só a página + agregados.
import type { HealthClassification } from '@/types'
import { apiFetch, ApiError } from '@/lib/apiClient'

export { ApiError }

export interface EngineFetchParams {
  config: unknown
  thresholds: unknown
  page?: number
  pageSize?: number
  name?: string
  contract?: string
  city?: string
  classification?: string
}

export interface EngineMeta {
  totals?: { clients: number; contracts: number; mrr: number } | null
  generatedAt?: string | null
  coverage?: 'full' | 'sample' | null
  clients?: number
}

// Agg/Score são tipados por cada tela (ex.: FinancialEngineData / FinancialEngineScore).
export interface EngineResponse<Agg, Score> {
  aggregates: Agg
  distribution: Record<HealthClassification, number>
  cities: string[]
  scores: Score[]
  total: number
  analyzed: number
  populationTotal: number
  page: number
  pageSize: number
  meta: EngineMeta
}

export async function fetchEngine<Agg = unknown, Score = unknown>(
  key: string,
  params: EngineFetchParams,
): Promise<EngineResponse<Agg, Score>> {
  const res = await apiFetch(`/api/engine/${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
  })
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 503) throw new ApiError(503, msg || 'Base ainda não materializada no backend.')
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor.`)
  }
  return body as EngineResponse<Agg, Score>
}

// Rótulo de cobertura a partir do meta do backend (equivalente ao coverageLabel
// do snapshot, mas com os dados que vêm da resposta).
export function coverageLabelFromMeta(meta: EngineMeta): string {
  if (meta.coverage === 'full') return `base completa · ${(meta.totals?.clients ?? 0).toLocaleString('pt-BR')} clientes`
  return `amostra de ${(meta.clients ?? 0).toLocaleString('pt-BR')} clientes`
}
