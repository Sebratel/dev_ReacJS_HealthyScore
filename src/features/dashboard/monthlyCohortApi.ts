// Cliente do endpoint /api/monthly-cohort — coorte mensal por contrato.
// O servidor só serve o artefato que o job do dia 1º gravou (ver
// server/monthlyCohortStore.mjs); nada é calculado por requisição.
import { apiFetch } from '@/lib/apiClient'
import { ApiError } from '@/features/engines/engineApi'
import type { HealthClassification } from '@/types'

export interface CohortByClass {
  classificacao: HealthClassification
  naBase: number
  cancelaram: number
  /** Dos que estavam NESTA faixa, quantos saíram. Denominador = a faixa. */
  taxa: number | null
  /** Dos que SAÍRAM, quantos estavam nesta faixa. Denominador = cancelamentos. */
  pctDasSaidas: number | null
  mrrPerdido: number | null
}

export interface CohortDecile {
  decil: number
  n: number
  cancelaram: number
  taxa: number | null
}

export interface CohortPoint {
  /** Mês a que o indicador se refere: quando os cancelamentos aconteceram. */
  mesIndicador: string
  /** Mês em que a nota congelou (o anterior). */
  mes: string
  notaCongeladaEm: string
  /** Mês aberto: só parte dele teve chance de gerar saída. */
  parcial?: boolean
  observadoAte?: string
  conexoesInicio: number | null
  conexoesFim: number | null
  conexoesFimEm?: string
  contratosAtivos: number
  semSinalSuficiente: number
  cancelamentosSemSinal: number
  cancelamentosEmLote: number
  cancelamentos: number
  taxaCancelamento: number | null
  mrrPerdido: number | null
  sinalizadosNaBase: number
  taxaSinalizada: number | null
  recall: number | null
  lift: number | null
  liftDecil1: number | null
  ic95: { low: number; high: number } | null
  enginesMedia?: number | null
  porClassificacao: CohortByClass[]
  porDecil: CohortDecile[]
}

export interface MonthlyCohortResponse {
  disponivel: boolean
  motivo?: string
  caminho?: string
  geradoEm?: string | null
  enginesIndisponiveisNoPassado?: string[]
  atual?: CohortPoint | null
  fechados?: CohortPoint[]
  resumo?: {
    meses: number
    primeiroMes: string
    ultimoMes: string
    taxaMedia: number | null
    recallMedio: number | null
    separacao: number | null
  } | null
  avisos?: string[]
}

export async function fetchMonthlyCohort(): Promise<MonthlyCohortResponse> {
  const res = await apiFetch('/api/monthly-cohort')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error || `Falha ao carregar a coorte mensal (HTTP ${res.status}).`)
  }
  return res.json()
}
