import { apiFetch, ApiError } from '@/lib/apiClient'
import type { RealWithdrawalPerson } from '@/data/realClients'

// Linha crua compacta por protocolo (materializada no ETL):
//   x = cancelado(1)/ativo(0) · r = retirado(1)/não(0) · v = visitas
//   t = técnico (motoboy) · d = data do desfecho (YYYY-MM-DD | null)
export interface WithdrawalProtocol { x: 0 | 1; r: 0 | 1; v: number; t: string; d: string | null }
export interface WithdrawalDetail { protocols: WithdrawalProtocol[]; people: RealWithdrawalPerson[] }

export { ApiError }

export async function fetchWithdrawalDetail(): Promise<WithdrawalDetail> {
  const res = await apiFetch('/api/withdrawals')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body?.error || 'Não foi possível carregar o detalhe de retiradas.')
  return { protocols: body.protocols || [], people: body.people || [] }
}
