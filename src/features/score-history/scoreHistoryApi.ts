import { apiFetch, ApiError } from '@/lib/apiClient'

// Valores de foto congelados junto com o score — não dá para reconstruí-los
// depois: o AutoISP guarda só a leitura mais recente.
export interface ScorePointValues {
  rx?: number    // potência óptica (dBm)
  lan?: number   // porta LAN (Mbps)
  rssi?: number  // Wi-Fi na casa, mediana dos aparelhos (dBm)
  nap?: number   // aparelhos no Wi-Fi
  mem?: number   // memória do CPE (%)
  tmp?: number   // temperatura do CPE (°C)
  onu?: string   // status da ONU na carga
}

export interface ScorePoint {
  date: string
  overall: number
  classification: string
  cancelled: boolean
  byEngine: Record<string, number>
  // Havia leitura de enlace nessa data? `null` = ponto gravado antes de o campo
  // existir (desconhecido, não "não tinha").
  hasLink: boolean | null
  values: ScorePointValues | null
  // Para COMPARAR populações (quem saiu × quem ficou), use este e não
  // `byEngine`: o score de Conexão é omitido de quem não tinha leitura de
  // enlace. Os sinais de enlace só são aplicados aos ativos, e como "sem dado
  // não pontua", quem não tem sai com o score inflado por ausência.
  comparableByEngine: Record<string, number>
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
