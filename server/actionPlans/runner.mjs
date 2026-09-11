// ─────────────────────────────────────────────────────────────────────────
// Orquestração de uma rodada: seleciona → monta dossiê → chama a IA →
// valida → grava. Roda em segundo plano; a tela acompanha pelo status.
//
// A seleção NÃO tem lógica de score própria: chama a mesma runEngine que a
// tela /financeiro usa, com a config oficial. Se um dia os pesos mudarem, a
// rodada muda junto — que é o comportamento certo.
// ─────────────────────────────────────────────────────────────────────────
import { runEngine } from '../engines.mjs'
import { getClients, getDataset } from '../dataset.mjs'
import { getOfficialConfig } from '../officialConfig.mjs'
import { buildDossier, renderPrompt } from './dossier.mjs'
import { validateRecommendation } from './schema.mjs'
import { resolveProvider } from './providerStore.mjs'
import {
  getActiveTemplate, createRun, updateRun, insertDossier, insertRecommendation,
} from './store.mjs'

// Severidade: menor = pior. "Classificação mínima" quer dizer "pelo menos tão
// grave quanto", então critical sozinho é o mais restritivo.
const CLASS_RANK = { critical: 0, high_risk: 1, attention: 2, healthy: 3, excellent: 4 }

// Teto de chamadas simultâneas ao provedor, para não estourar rate limit.
export const MAX_CONCURRENCY = 10
// Teto de clientes por rodada — 30 é o padrão; acima de 200 a rodada vira um
// custo que ninguém aprovou de propósito.
const MAX_CLIENTES = 200

export const DEFAULT_CRITERIO = {
  quantidade: 30,
  classificacaoMinima: 'critical',
  cidade: null,
  mrrMin: null,
  mrrMax: null,
}

// Executa `worker` sobre `items` com no máximo `limit` em voo. Sem dependência
// externa: são poucas linhas e o comportamento fica explícito.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try { results[i] = await worker(items[i], i) } catch (e) { results[i] = { erro: e.message } }
    }
  })
  await Promise.all(runners)
  return results
}

// Aplica o critério sobre a engine e devolve os scores escolhidos.
export function selectClients(criterio = {}) {
  const c = { ...DEFAULT_CRITERIO, ...criterio }
  const clients = getClients()
  if (!clients.length) throw new Error('Base ainda não materializada no backend (snapshot ausente).')

  const official = getOfficialConfig()
  const config = official?.configs?.financial
  if (!config) {
    throw new Error(
      'Config oficial do Financeiro não publicada. Um power user precisa publicar os pesos ' +
      'em Configurações antes de gerar planos — senão cada rodada usaria uma régua diferente.',
    )
  }

  const rankLimite = CLASS_RANK[c.classificacaoMinima] ?? 0
  // Página única com os piores; a ordenação padrão de runEngine já é
  // healthScore ascendente (pior primeiro).
  const { scores } = runEngine('financial', {
    clients,
    config,
    thresholds: official?.thresholds,
    monthly: getDataset()?.monthly || [],
    city: c.cidade || undefined,
    page: 0,
    pageSize: 2000,
  })

  const qtd = Math.min(MAX_CLIENTES, Math.max(1, Number(c.quantidade) || DEFAULT_CRITERIO.quantidade))
  const filtrados = scores.filter((s) => {
    if ((CLASS_RANK[s.classification] ?? 9) > rankLimite) return false
    const mrr = Number(s.monthlyValue) || 0
    if (c.mrrMin != null && mrr < Number(c.mrrMin)) return false
    if (c.mrrMax != null && mrr > Number(c.mrrMax)) return false
    return true
  })
  return { selecionados: filtrados.slice(0, qtd), criterio: c, disponiveis: filtrados.length }
}

// Cria a rodada e dispara a geração em segundo plano. Devolve o id na hora —
// gerar 30 planos leva minutos, e segurar a requisição só produziria timeout.
export async function startRun({ setor = 'financeiro', criterio, iniciadoPor, providerId = null }) {
  const template = await getActiveTemplate(setor)
  if (!template) throw new Error(`Nenhum prompt ativo para o setor "${setor}". Cadastre um em Configurações.`)

  const { selecionados, criterio: usado, disponiveis } = selectClients(criterio)
  if (!selecionados.length) {
    throw new Error(`Nenhum cliente atende ao critério (classificação mínima "${usado.classificacaoMinima}").`)
  }

  const runId = await createRun({ setor, criterio: { ...usado, disponiveis } }, iniciadoPor)
  await updateRun(runId, { qtd_clientes: selecionados.length, status: 'gerando' })

  // Não aguardamos: a rodada segue e a tela acompanha por /runs/:id.
  processRun({ runId, setor, template, selecionados, providerId }).catch(async (e) => {
    await updateRun(runId, { status: 'falha', erro: e.message, concluido_em: new Date() })
  })

  return { runId, selecionados: selecionados.length, disponiveis, criterio: usado }
}

async function processRun({ runId, setor, template, selecionados, providerId }) {
  const { provider, row, simulado } = await resolveProvider(providerId)

  const resultados = await mapWithConcurrency(selecionados, MAX_CONCURRENCY, async (score) => {
    const dossie = await buildDossier(score, { setor, versaoPrompt: template.versao })
    const dossierId = await insertDossier({
      runId,
      clienteId: score.customerId,
      contratoId: score.contractNumber,
      dados: dossie,
      healthScore: score.healthScore,
      classificacao: score.classification,
    })

    const system = renderPrompt(template.conteudo, dossie)
    const r = await provider.generatePlan({ system, dossie })

    const base = {
      dossierId,
      promptTemplateId: template.id,
      modelo: r.modelo || 'desconhecido',
      providerId: row?.id ?? null,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      duracaoMs: r.duracaoMs,
    }

    if (!r.ok) {
      await insertRecommendation({ ...base, status: 'falha_provedor', erroValidacao: r.erro })
      return { ok: false }
    }

    // Segunda barreira: o schema já foi forçado na origem, mas revalidamos.
    let parsed = null
    try { parsed = JSON.parse(r.rawText) } catch { parsed = null }
    if (!parsed) {
      await insertRecommendation({
        ...base, status: 'falha_schema', respostaBruta: r.rawText,
        erroValidacao: 'A resposta não é um JSON analisável.',
      })
      return { ok: false }
    }
    const v = validateRecommendation(parsed)
    if (!v.ok) {
      await insertRecommendation({
        ...base, status: 'falha_schema', respostaBruta: r.rawText,
        erroValidacao: v.errors.join(' · '),
      })
      return { ok: false }
    }

    await insertRecommendation({ ...base, status: 'valida', resposta: v.value })
    return { ok: true }
  })

  const falhas = resultados.filter((x) => !x || !x.ok).length
  await updateRun(runId, {
    status: falhas === 0 ? 'concluida' : (falhas === resultados.length ? 'falha' : 'concluida_com_falhas'),
    erro: falhas ? `${falhas} de ${resultados.length} geração(ões) falharam.` : null,
    concluido_em: new Date(),
  })
  return { total: resultados.length, falhas, simulado }
}

// Nova tentativa para UM dossiê que falhou. A geração anterior continua
// gravada (é o registro de que o prompt ou o provedor regrediu); esta entra
// como tentativa seguinte, e a tela passa a mostrar a mais recente.
export async function retryRecommendation({ dossierId, setor, dossie, tentativa, providerId = null }) {
  const template = await getActiveTemplate(setor)
  if (!template) throw new Error(`Nenhum prompt ativo para o setor "${setor}".`)

  const { provider, row } = await resolveProvider(providerId)
  const system = renderPrompt(template.conteudo, dossie)
  const r = await provider.generatePlan({ system, dossie })

  const base = {
    dossierId,
    promptTemplateId: template.id,
    modelo: r.modelo || 'desconhecido',
    providerId: row?.id ?? null,
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    duracaoMs: r.duracaoMs,
    tentativa: (Number(tentativa) || 1) + 1,
  }

  if (!r.ok) {
    const id = await insertRecommendation({ ...base, status: 'falha_provedor', erroValidacao: r.erro })
    return { id, status: 'falha_provedor', erro: r.erro }
  }
  let parsed = null
  try { parsed = JSON.parse(r.rawText) } catch { parsed = null }
  const v = parsed ? validateRecommendation(parsed) : { ok: false, errors: ['A resposta não é um JSON analisável.'] }
  if (!v.ok) {
    const id = await insertRecommendation({
      ...base, status: 'falha_schema', respostaBruta: r.rawText, erroValidacao: v.errors.join(' · '),
    })
    return { id, status: 'falha_schema', erro: v.errors.join(' · ') }
  }
  const id = await insertRecommendation({ ...base, status: 'valida', resposta: v.value })
  return { id, status: 'valida' }
}

export { processRun }
