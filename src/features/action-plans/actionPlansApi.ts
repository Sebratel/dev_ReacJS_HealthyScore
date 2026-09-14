// Cliente do módulo de Planos de Ação. Tudo passa pelo apiFetch central —
// um fetch cru esquecido num botão manda requisição sem Bearer, toma 401 em
// silêncio, e a ação simplesmente não acontece parecendo que aconteceu.
import { apiFetch, ApiError } from '@/lib/apiClient'

export { ApiError }

export type Prioridade = 'alta' | 'media' | 'baixa'
export type ResponsavelArea = 'cobranca' | 'atendimento' | 'comercial' | 'juridico'
export type RecStatus = 'valida' | 'falha_schema' | 'falha_provedor'
export type RunStatus = 'pendente' | 'gerando' | 'concluida' | 'concluida_com_falhas' | 'falha'
export type TaskStatus = 'em_execucao' | 'concluido' | 'cancelado'

export interface Acao {
  titulo: string
  descricao: string
  prioridade: Prioridade
  prazo_sugerido_dias: number
  responsavel_sugerido: ResponsavelArea
  impacto_esperado: string
}

export interface DossieIndicador { nome: string; valor: number | string; pontos: number }
export interface Dossie {
  cliente_id: string
  nome: string | null
  contrato: string | null
  cidade: string | null
  setor: string
  health_score_atual: number
  classificacao: string
  receita_mensal: number | null
  plano: string | null
  indicadores: DossieIndicador[]
  historico_health_score: { data: string; score: number }[]
  forma_pagamento: string | null
  planos_anteriores: {
    titulo: string; status: string; criado_em: string
    resultado: { variacao: number; dias_decorridos: number } | null
  }[]
}

export interface Recommendation {
  id: number
  dossierId: number
  runId: number
  clienteId: string
  contratoId: string | null
  setor: string
  healthScoreNoMomento: number | null
  classificacao: string | null
  dossie: Dossie
  versaoPrompt: string
  modelo: string
  status: RecStatus
  resposta: {
    diagnostico: string
    causas_provaveis: string[]
    acoes_recomendadas: Acao[]
    indicadores_considerados: string[]
    confianca_modelo: number
  } | null
  erroValidacao: string | null
  tokens: { entrada: number | null; saida: number | null; total: number | null }
  duracaoMs: number | null
  tentativa: number
  criadoEm: string
  aprovacao: {
    id: number; status: 'em_revisao' | 'aprovado' | 'rejeitado'
    gestorId: string; acoesEditadas: Acao[] | null; comentario: string | null; decididoEm: string | null
  } | null
}

export interface Run {
  id: number
  setor: string
  criterio: Record<string, unknown>
  qtdClientes: number
  iniciadoPor: string
  status: RunStatus
  erro: string | null
  criadoEm: string
  concluidoEm: string | null
  totais: { dossies: number; validas: number; falhas: number; decididas: number }
}

export interface Task {
  id: number
  clienteId: string
  clienteNome: string | null
  contratoId: string | null
  setor: string
  titulo: string
  descricao: string | null
  prioridade: Prioridade | null
  responsavelArea: ResponsavelArea | null
  responsavelId: string | null
  prazo: string | null
  status: TaskStatus
  concluidoEm: string | null
  criadoEm: string
  resultado: {
    antes: number; depois: number; variacao: number
    classificacaoAntes: string; classificacaoDepois: string
    diasDecorridos: number; avaliadoEm: string
  } | null
}

export interface ModuleStatus {
  banco: { ok: boolean; error?: string }
  promptAtivo: { id: number; versao: string; setor: string } | null
  provedor: { tipo: string; modelo: string; origem: 'env' | 'tela' | null; dica: string | null } | null
  simulado: boolean
  criterioPadrao: Criterio
  concorrenciaMaxima: number
  prazoReavaliacaoDias: number
}

export interface Criterio {
  quantidade: number
  classificacaoMinima: string
  cidade: string | null
  mrrMin: number | null
  mrrMax: number | null
}

export interface Preview {
  criterio: Criterio
  disponiveis: number
  selecionados: number
  amostra: { clienteId: string; nome: string; cidade: string; healthScore: number; classificacao: string; mrr: number }[]
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor.`)
  }
  return body as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export const getModuleStatus = () => call<ModuleStatus>('/api/action-plans/status')

export const previewRun = (criterio: Partial<Criterio>) =>
  call<Preview>('/api/action-plans/runs/preview', json({ criterio }))

export const startRun = (criterio: Partial<Criterio>) =>
  call<{ runId: number; selecionados: number; disponiveis: number }>('/api/action-plans/runs', json({ criterio }))

export const listRuns = () => call<{ runs: Run[] }>('/api/action-plans/runs')
export const getRun = (id: number) => call<{ run: Run }>(`/api/action-plans/runs/${id}`)
export const listRecommendations = (runId: number) =>
  call<{ recommendations: Recommendation[] }>(`/api/action-plans/runs/${runId}/recommendations`)

export const approveRecommendation = (id: number, acoes: Acao[], comentario?: string, responsavelId?: string) =>
  call<{ ok: true; tarefasCriadas: number }>(`/api/action-plans/recommendations/${id}/approve`, json({ acoes, comentario, responsavelId }))

export const rejectRecommendation = (id: number, comentario?: string) =>
  call<{ ok: true }>(`/api/action-plans/recommendations/${id}/reject`, json({ comentario }))

export const retryRecommendation = (id: number) =>
  call<{ id: number; status: RecStatus; erro?: string }>(`/api/action-plans/recommendations/${id}/retry`, json({}))

export const listTasks = (params: { responsavel?: string; status?: TaskStatus } = {}) => {
  const q = new URLSearchParams()
  if (params.responsavel) q.set('responsavel', params.responsavel)
  if (params.status) q.set('status', params.status)
  return call<{ tasks: Task[] }>(`/api/action-plans/tasks${q.toString() ? `?${q}` : ''}`)
}

export const updateTask = (id: number, patch: { status?: TaskStatus; responsavelId?: string }) =>
  call<{ ok: true }>(`/api/action-plans/tasks/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  })

export const runOutcomeEvaluation = () =>
  call<{ avaliadas: number; semDados: number; total: number }>('/api/action-plans/outcomes/run', json({}))
