// ─────────────────────────────────────────────────────────────────────────
// Rotas do módulo Planos de Ação + cadastro de provedores de IA.
//
// Papéis (reusa o RBAC do sistema): ver é de qualquer conta do domínio;
// gerar, aprovar e rejeitar é de power_user+; mexer em prompt, provedor e
// disparar a reavaliação é de admin.
//
// Nada aqui aceita config vinda do cliente para pontuar: a régua é sempre a
// config oficial do servidor. Um plano gerado com pesos do navegador de quem
// clicou não seria comparável com nenhum outro.
// ─────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { isReady } from '../db.mjs'
import { validateEditedActions } from './schema.mjs'
import { startRun, selectClients, retryRecommendation, DEFAULT_CRITERIO, MAX_CONCURRENCY } from './runner.mjs'
import { runOutcomeEvaluation, DEFAULT_PRAZO_DIAS } from './outcomes.mjs'
import {
  listRuns, getRun, listRecommendationsByRun, getRecommendation,
  approveRecommendation, rejectRecommendation, listTasks, setTaskStatus, assignTask,
  listTemplates, createTemplateVersion, getActiveTemplate,
} from './store.mjs'
import {
  estado as estadoIA, salvar as salvarIA, remover as removerIA,
  listarModelos, testar as testarIA,
} from '../ia/registro.mjs'

// Erro → resposta. Falha de banco é 503 (o módulo está indisponível, não é
// culpa de quem chamou); o resto é 400 com a mensagem original, que já é
// escrita para ser lida por quem está na tela.
function fail(res, e) {
  const msg = e?.message || 'Erro inesperado.'
  const semBanco = /ECONNREFUSED|ER_BAD_DB_ERROR|ETIMEDOUT|ENOTFOUND|não configurado|doesn't exist/i.test(msg)
  res.status(semBanco ? 503 : 400).json({ error: msg })
}

export function actionPlanRoutes(requireAuth) {
  const r = Router()

  // ─── Situação do módulo ──────────────────────────────────────
  // A tela pergunta isto antes de tudo: sem banco, sem prompt ou sem provedor
  // ela mostra o que falta, em vez de um erro cru no primeiro clique.
  r.get('/action-plans/status', requireAuth(), async (_req, res) => {
    const db = await isReady()
    let prompt = null
    if (db.ok) {
      try { prompt = await getActiveTemplate('financeiro') } catch { /* tabela ainda não migrada */ }
    }
    const ia = estadoIA()
    res.json({
      banco: db,
      promptAtivo: prompt ? { id: prompt.id, versao: prompt.versao, setor: prompt.setor } : null,
      provedor: ia.configurado
        ? { tipo: ia.tipo, modelo: ia.modelo, origem: ia.origem, dica: ia.dica }
        : null,
      // Sem provedor cadastrado o módulo roda simulado: é útil para ver a
      // tela funcionando, e a UI precisa dizer isso em letras claras.
      simulado: !ia.configurado || ia.tipo === 'simulado',
      criterioPadrao: DEFAULT_CRITERIO,
      concorrenciaMaxima: MAX_CONCURRENCY,
      prazoReavaliacaoDias: DEFAULT_PRAZO_DIAS,
    })
  })

  // ─── Rodadas ─────────────────────────────────────────────────
  // Prévia do critério: quantos clientes entram, sem gastar uma chamada de IA.
  r.post('/action-plans/runs/preview', requireAuth({ minRole: 'power_user' }), (req, res) => {
    try {
      const { selecionados, criterio, disponiveis } = selectClients(req.body?.criterio)
      res.json({
        criterio,
        disponiveis,
        selecionados: selecionados.length,
        amostra: selecionados.slice(0, 5).map((s) => ({
          clienteId: s.customerId, nome: s.customerName, cidade: s.city,
          healthScore: s.healthScore, classificacao: s.classification, mrr: s.monthlyValue,
        })),
      })
    } catch (e) { fail(res, e) }
  })

  r.post('/action-plans/runs', requireAuth({ minRole: 'power_user' }), async (req, res) => {
    try {
      const out = await startRun({
        setor: req.body?.setor || 'financeiro',
        criterio: req.body?.criterio,
        iniciadoPor: req.user.email,
      })
      res.status(202).json(out)
    } catch (e) { fail(res, e) }
  })

  r.get('/action-plans/runs', requireAuth(), async (req, res) => {
    try {
      res.json({ runs: await listRuns({ setor: req.query.setor, limit: req.query.limit }) })
    } catch (e) { fail(res, e) }
  })

  r.get('/action-plans/runs/:id', requireAuth(), async (req, res) => {
    try {
      const run = await getRun(req.params.id)
      if (!run) return res.status(404).json({ error: 'Rodada não encontrada.' })
      res.json({ run })
    } catch (e) { fail(res, e) }
  })

  r.get('/action-plans/runs/:id/recommendations', requireAuth(), async (req, res) => {
    try {
      res.json({ recommendations: await listRecommendationsByRun(req.params.id) })
    } catch (e) { fail(res, e) }
  })

  r.get('/action-plans/recommendations/:id', requireAuth(), async (req, res) => {
    try {
      const rec = await getRecommendation(req.params.id)
      if (!rec) return res.status(404).json({ error: 'Recomendação não encontrada.' })
      res.json({ recommendation: rec })
    } catch (e) { fail(res, e) }
  })

  // ─── Decisão do gestor ───────────────────────────────────────
  r.post('/action-plans/recommendations/:id/approve', requireAuth({ minRole: 'power_user' }), async (req, res) => {
    try {
      const rec = await getRecommendation(req.params.id)
      if (!rec) return res.status(404).json({ error: 'Recomendação não encontrada.' })
      if (rec.status !== 'valida') {
        return res.status(400).json({ error: 'Só uma recomendação válida pode ser aprovada. Gere uma nova tentativa.' })
      }
      // O gestor pode ter editado; sem edição, aprova o que a IA propôs.
      const acoes = req.body?.acoes ?? rec.resposta?.acoes_recomendadas
      const v = validateEditedActions(acoes)
      if (!v.ok) return res.status(400).json({ error: v.errors.join(' · ') })

      const out = await approveRecommendation({
        recommendationId: rec.id,
        gestorId: req.user.email,
        acoes: v.value,
        comentario: req.body?.comentario,
        responsavelId: req.body?.responsavelId ?? req.user.email,
      })
      res.json({ ok: true, ...out })
    } catch (e) { fail(res, e) }
  })

  r.post('/action-plans/recommendations/:id/reject', requireAuth({ minRole: 'power_user' }), async (req, res) => {
    try {
      await rejectRecommendation({
        recommendationId: req.params.id,
        gestorId: req.user.email,
        comentario: req.body?.comentario,
      })
      res.json({ ok: true })
    } catch (e) { fail(res, e) }
  })

  r.post('/action-plans/recommendations/:id/retry', requireAuth({ minRole: 'power_user' }), async (req, res) => {
    try {
      const rec = await getRecommendation(req.params.id)
      if (!rec) return res.status(404).json({ error: 'Recomendação não encontrada.' })
      const out = await retryRecommendation({
        dossierId: rec.dossierId,
        setor: rec.setor,
        dossie: rec.dossie,
        tentativa: rec.tentativa,
      })
      res.json(out)
    } catch (e) { fail(res, e) }
  })

  // ─── Tarefas ─────────────────────────────────────────────────
  r.get('/action-plans/tasks', requireAuth(), async (req, res) => {
    try {
      const responsavelId = req.query.responsavel === 'me' ? req.user.email : (req.query.responsavel || undefined)
      res.json({
        tasks: await listTasks({
          responsavelId,
          status: req.query.status || undefined,
          setor: req.query.setor || undefined,
          clienteId: req.query.cliente || undefined,
        }),
      })
    } catch (e) { fail(res, e) }
  })

  r.patch('/action-plans/tasks/:id', requireAuth({ minRole: 'power_user' }), async (req, res) => {
    try {
      if (req.body?.responsavelId !== undefined) await assignTask(req.params.id, req.body.responsavelId)
      if (req.body?.status) await setTaskStatus(req.params.id, req.body.status, req.user.email)
      res.json({ ok: true })
    } catch (e) { fail(res, e) }
  })

  // ─── Reavaliação de impacto (gatilho manual; o job roda após o ETL) ──
  r.post('/action-plans/outcomes/run', requireAuth({ minRole: 'admin' }), async (req, res) => {
    try {
      res.json(await runOutcomeEvaluation({ prazoDias: req.body?.prazoDias }))
    } catch (e) { fail(res, e) }
  })

  // ─── Prompts ─────────────────────────────────────────────────
  r.get('/action-plans/templates', requireAuth({ minRole: 'power_user' }), async (req, res) => {
    try { res.json({ templates: await listTemplates(req.query.setor) }) } catch (e) { fail(res, e) }
  })

  r.post('/action-plans/templates', requireAuth({ minRole: 'admin' }), async (req, res) => {
    try {
      res.json(await createTemplateVersion({
        setor: req.body?.setor, versao: req.body?.versao,
        conteudo: req.body?.conteudo, ativar: req.body?.ativar !== false,
      }, req.user.email))
    } catch (e) { fail(res, e) }
  })

  // ─── Provedor de IA ──────────────────────────────────────────
  // Mesmo contrato do comercial_pbi: um provedor ativo, chave cifrada, e a
  // listagem dos modelos que aquela chave alcança.
  r.get('/ia', requireAuth({ minRole: 'admin' }), (_req, res) => {
    try { res.json(estadoIA()) } catch (e) { fail(res, e) }
  })

  r.put('/ia', requireAuth({ minRole: 'admin' }), (req, res) => {
    try { res.json(salvarIA(req.body || {}, req.user.email)) } catch (e) { fail(res, e) }
  })

  r.delete('/ia', requireAuth({ minRole: 'admin' }), (_req, res) => {
    try { res.json(removerIA()) } catch (e) { fail(res, e) }
  })

  r.post('/ia/modelos', requireAuth({ minRole: 'admin' }), async (req, res) => {
    try { res.json({ modelos: await listarModelos(req.body || {}) }) } catch (e) { fail(res, e) }
  })

  r.post('/ia/testar', requireAuth({ minRole: 'admin' }), async (_req, res) => {
    try { res.json(await testarIA()) } catch (e) { fail(res, e) }
  })

  return r
}
