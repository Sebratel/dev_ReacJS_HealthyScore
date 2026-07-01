// Cliente do endpoint /api/dashboard — roda as 7 engines + ranking combinado no
// backend (config/limiares do usuário viajam na requisição). Substitui o cálculo
// client-side (useEngineSummaries + buildClientRiskRanking).
import { useAuthStore } from '@/store/authStore'
import type { HealthClassification } from '@/types'
import { ApiError, type EngineMeta } from '@/features/engines/engineApi'

export { ApiError }

export interface DashboardSummary {
  key: string
  label: string
  route: string
  analyzed: number
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  distribution: Record<HealthClassification, number>
}

export interface RankedClient {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  overallHealth: number
  overallChurnRisk: number
  classification: HealthClassification
  revenueRisk: number
  enginesPresent: number
  byEngine: { key: string; label: string; healthScore: number; classification: HealthClassification }[]
  signals: { overdue: number; relCancelThreats: number; renegotiations: number; netMassiveCount: number; slaLateCount: number; trustReleases: number } | null
}

export interface DashboardResponse {
  summaries: DashboardSummary[]
  globalHealth: number
  ranking: {
    total: number
    criticalCount: number
    highRiskCount: number
    atRiskCount: number
    revenueAtRiskMonthly: number
    annualRevenueRisk: number
    visibleTotal: number
    top: RankedClient[]
    radar: { metric: string; value: number }[]
  }
  baseCounts: { cancelThreats: number; overdueClients: number; slaLateClients: number; massiveClients: number }
  cities: string[]
  meta: EngineMeta
  monthly: { month: string; onTime: number; late: number; overdue: number }[]
}

export interface DashboardParams {
  configs: Record<string, unknown>
  thresholds: unknown
  name?: string
  contract?: string
  city?: string
  topN?: number
}

export async function fetchDashboard(params: DashboardParams): Promise<DashboardResponse> {
  const token = useAuthStore.getState().accessToken
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  let res: Response
  try {
    res = await fetch('/api/dashboard', { method: 'POST', headers, body: JSON.stringify(params) })
  } catch {
    throw new ApiError(0, 'Não foi possível falar com o servidor (backend offline?).')
  }
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 401) throw new ApiError(401, msg || 'Sessão expirada. Entre novamente.')
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor.`)
  }
  return body as DashboardResponse
}
