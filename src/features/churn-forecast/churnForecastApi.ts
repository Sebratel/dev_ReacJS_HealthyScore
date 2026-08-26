import { apiFetch, ApiError } from '@/lib/apiClient'
import { pruneEngineConfigs } from '@/lib/pruneConfig'

export interface ForecastRow {
  customerId: string
  customerName: string
  contractNumber: string
  city: string
  plan: string
  monthlyValue: number
  overallHealth: number
  classification: string
  tenureDays: number
  windowMedianDays: number
  windowP25Days: number
  windowP75Days: number
  sampleN: number
  revenueRisk: number
}
export interface BandStat { count: number; p25: number; p50: number; p75: number }
export interface ForecastResult {
  rows: ForecastRow[]
  total: number
  bands: Record<string, BandStat>
  generatedAt: string
}
export interface ForecastParams {
  configs: Record<string, unknown>
  thresholds: unknown
  topN?: number
  city?: string
  classification?: string
}

export { ApiError }

export async function fetchChurnForecast(params: ForecastParams): Promise<ForecastResult> {
  const payload = { ...params, configs: pruneEngineConfigs(params.configs) }
  const res = await apiFetch('/api/churn-forecast', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 503) throw new ApiError(503, msg || 'Base ainda não materializada.')
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor.`)
  }
  return body as ForecastResult
}
