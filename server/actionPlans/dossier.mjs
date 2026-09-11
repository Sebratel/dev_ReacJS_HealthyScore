// ─────────────────────────────────────────────────────────────────────────
// Dossiê do cliente — a entrada da IA.
//
// Regras que valem a pena registrar:
//
// • Não inventamos indicador. Os pontos e valores vêm da MESMA engine que a
//   tela /financeiro mostra, então o gestor confere o que a IA viu.
// • Não mandamos "churn_risk". O único número desse tipo no sistema é
//   100 − healthScore, que não é probabilidade calibrada de nada; mandá-lo
//   como se fosse ensinaria o modelo a raciocinar sobre um número que ninguém
//   validou. health_score_atual + classificacao dizem o mesmo, honestamente.
// • `planos_anteriores` existe para o modelo não repetir ação que já falhou —
//   é o que separa a segunda rodada de um cliente da primeira.
// ─────────────────────────────────────────────────────────────────────────
import { query } from '../db.mjs'
import { getClientHistory } from '../scoreHistory.mjs'

// Nomes dos indicadores no dossiê: em português, como no contrato do prompt.
// A engine usa chaves em inglês; a tradução mora aqui, num lugar só.
const INDICATOR_NAMES = {
  overdueBills: 'faturas_atrasadas',
  trustReleases: 'liberacoes_por_confianca',
  renegotiations: 'renegociacoes',
  onTimePayments: 'faturas_pagas_no_prazo',
  paymentMethod: 'forma_pagamento',
}

// Valor NUMÉRICO do indicador, quando existe. A engine devolve `value` já
// formatado para a tela ("7 fatura(s) em atraso"); o modelo raciocina melhor
// sobre o número cru, então preferimos os sinais.
function indicatorValue(key, signals, fallback) {
  if (!signals) return fallback
  switch (key) {
    case 'overdueBills': return (Number(signals.lateInvoices) || 0) + (Number(signals.overdueInvoices) || 0)
    case 'trustReleases': return Number(signals.trustReleases) || 0
    case 'renegotiations': return Number(signals.renegotiations) || 0
    case 'onTimePayments': return Number(signals.onTimeInvoices) || 0
    case 'paymentMethod': return signals.paymentForm || 'Não informado'
    default: return fallback
  }
}

// Ações já tentadas com este cliente, e o que aconteceu depois. Limitado às
// 10 mais recentes: o histórico completo cresce sem limite e a cauda antiga
// não muda a decisão de hoje.
export async function fetchPreviousPlans(clienteId) {
  const rows = await query(
    `select t.titulo, t.descricao, t.status, t.prazo, t.concluido_em, t.criado_em,
            t.responsavel_area, o.health_score_antes, o.health_score_depois, o.dias_decorridos
       from action_plan_tasks t
       left join action_plan_outcomes o on o.task_id = t.id
      where t.cliente_id = ?
      order by t.criado_em desc
      limit 10`,
    [String(clienteId)],
  )
  return rows.map((r) => ({
    titulo: r.titulo,
    descricao: r.descricao,
    status: r.status,
    responsavel: r.responsavel_area,
    criado_em: r.criado_em,
    concluido_em: r.concluido_em,
    resultado: r.health_score_depois == null ? null : {
      health_score_antes: Number(r.health_score_antes),
      health_score_depois: Number(r.health_score_depois),
      variacao: Number(r.health_score_depois) - Number(r.health_score_antes),
      dias_decorridos: r.dias_decorridos,
    },
  }))
}

// Série congelada do cliente (scripts/score-history.mjs). Vem vazia enquanto
// não houver pontos acumulados — o dossiê diz isso com uma lista vazia, e não
// com um número inventado a partir do estado de hoje.
function scoreTimeline(clienteId) {
  try {
    return (getClientHistory(String(clienteId)) || []).map((p) => ({ data: p.date, score: p.overall }))
  } catch {
    return []
  }
}

// Monta o dossiê a partir de uma linha de score da engine financeira.
//   score  item de runEngine('financial').scores
//   setor  'financeiro' (o módulo é genérico; a Fase 1 só liga este)
export async function buildDossier(score, { setor = 'financeiro', versaoPrompt } = {}) {
  const indicadores = (score.indicators || []).map((i) => ({
    nome: INDICATOR_NAMES[i.key] || i.key,
    valor: indicatorValue(i.key, score.signals, i.value),
    pontos: i.points,
  }))

  return {
    cliente_id: String(score.customerId),
    nome: score.customerName || null,
    contrato: score.contractNumber ? `#${score.contractNumber}` : null,
    cidade: score.city || null,
    setor,
    versao_prompt: versaoPrompt || null,
    health_score_atual: score.healthScore,
    classificacao: score.classification,
    receita_mensal: score.monthlyValue ?? null,
    plano: score.plan || null,
    indicadores,
    historico_health_score: scoreTimeline(score.customerId),
    forma_pagamento: score.signals?.paymentForm || null,
    planos_anteriores: await fetchPreviousPlans(score.customerId),
  }
}

// Interpola o template. Só `{{dossie_json}}` por enquanto — deliberadamente
// mínimo: um motor de template completo num campo editável pela tela é
// superfície de ataque sem necessidade.
export function renderPrompt(template, dossie) {
  return String(template).replace(/\{\{\s*dossie_json\s*\}\}/g, JSON.stringify(dossie, null, 2))
}
