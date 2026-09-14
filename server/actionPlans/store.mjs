// ─────────────────────────────────────────────────────────────────────────
// Acesso a dados do módulo de Planos de Ação.
//
// Detalhe do MariaDB que vale registrar: `json` ali é um alias de LONGTEXT com
// CHECK, então o driver devolve STRING — diferente do MySQL 8, onde vem
// objeto. `parseJson` cobre os dois casos; sem isso, tudo que sai do banco
// chega na tela como texto e quebra silenciosamente.
// ─────────────────────────────────────────────────────────────────────────
import { query, withTransaction } from '../db.mjs'

function parseJson(v) {
  if (v == null) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}
const j = (v) => (v == null ? null : JSON.stringify(v))

// ─── Prompt templates ──────────────────────────────────────────
export async function getActiveTemplate(setor) {
  const [row] = await query(
    'select * from action_plan_prompt_templates where setor = ? and ativo = 1',
    [setor],
  )
  return row || null
}

export async function listTemplates(setor) {
  const rows = setor
    ? await query('select * from action_plan_prompt_templates where setor = ? order by criado_em desc', [setor])
    : await query('select * from action_plan_prompt_templates order by setor, criado_em desc')
  return rows.map((r) => ({
    id: r.id, setor: r.setor, versao: r.versao, conteudo: r.conteudo,
    ativo: !!r.ativo, criadoPor: r.criado_por, criadoEm: r.criado_em,
  }))
}

// Nova versão de um prompt. Editar o texto de uma versão já usada apagaria a
// explicação de recomendações antigas, então cada edição vira versão nova; a
// ativação é o que troca o que vale daqui pra frente.
export async function createTemplateVersion({ setor, versao, conteudo, ativar = true }, criadoPor) {
  if (!setor || !versao || !conteudo) throw new Error('setor, versao e conteudo são obrigatórios.')
  if (!String(conteudo).includes('{{dossie_json}}')) {
    throw new Error('O prompt precisa conter o marcador {{dossie_json}} — é onde o dossiê é interpolado.')
  }
  return withTransaction(async (conn) => {
    if (ativar) await conn.execute('update action_plan_prompt_templates set ativo = 0 where setor = ? and ativo = 1', [setor])
    const [res] = await conn.execute(
      'insert into action_plan_prompt_templates (setor, versao, conteudo, ativo, criado_por) values (?, ?, ?, ?, ?)',
      [setor, versao, conteudo, ativar ? 1 : 0, criadoPor],
    )
    return { id: res.insertId, setor, versao, ativo: ativar }
  })
}

// ─── Rodadas ───────────────────────────────────────────────────
export async function createRun({ setor, criterio }, iniciadoPor) {
  const rows = await query(
    'insert into action_plan_runs (setor, criterio_selecao, iniciado_por, status) values (?, ?, ?, ?)',
    [setor, j(criterio), iniciadoPor, 'pendente'],
  )
  return rows.insertId
}

export async function updateRun(id, fields) {
  const sets = []
  const vals = []
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); vals.push(v) }
  if (!sets.length) return
  vals.push(id)
  await query(`update action_plan_runs set ${sets.join(', ')} where id = ?`, vals)
}

export async function getRun(id) {
  const [r] = await query('select * from action_plan_runs where id = ?', [id])
  if (!r) return null
  return {
    id: r.id, setor: r.setor, criterio: parseJson(r.criterio_selecao), qtdClientes: r.qtd_clientes,
    iniciadoPor: r.iniciado_por, status: r.status, erro: r.erro,
    criadoEm: r.criado_em, concluidoEm: r.concluido_em,
  }
}

// Lista com o placar de cada rodada — a tela precisa saber, sem abrir, quantas
// recomendações saíram válidas e quantas já foram decididas.
export async function listRuns({ setor, limit = 25 } = {}) {
  const rows = await query(
    `select r.*,
            (select count(*) from action_plan_dossiers d where d.run_id = r.id) as total_dossies,
            (select count(*) from action_plan_recommendations c
               join action_plan_dossiers d on d.id = c.dossier_id
              where d.run_id = r.id and c.status = 'valida') as total_validas,
            (select count(*) from action_plan_recommendations c
               join action_plan_dossiers d on d.id = c.dossier_id
              where d.run_id = r.id and c.status <> 'valida') as total_falhas,
            (select count(*) from action_plan_approvals a
               join action_plan_recommendations c on c.id = a.recommendation_id
               join action_plan_dossiers d on d.id = c.dossier_id
              where d.run_id = r.id and a.status in ('aprovado','rejeitado')) as total_decididas
       from action_plan_runs r
      ${setor ? 'where r.setor = ?' : ''}
      order by r.criado_em desc
      limit ${Math.min(100, Math.max(1, Number(limit) || 25))}`,
    setor ? [setor] : [],
  )
  return rows.map((r) => ({
    id: r.id, setor: r.setor, criterio: parseJson(r.criterio_selecao), qtdClientes: r.qtd_clientes,
    iniciadoPor: r.iniciado_por, status: r.status, erro: r.erro,
    criadoEm: r.criado_em, concluidoEm: r.concluido_em,
    totais: {
      dossies: r.total_dossies, validas: r.total_validas,
      falhas: r.total_falhas, decididas: r.total_decididas,
    },
  }))
}

// ─── Dossiês e recomendações ───────────────────────────────────
export async function insertDossier({ runId, clienteId, contratoId, dados, healthScore, classificacao }) {
  const rows = await query(
    `insert into action_plan_dossiers (run_id, cliente_id, contrato_id, dados_agregados, health_score_no_momento, classificacao)
     values (?, ?, ?, ?, ?, ?)`,
    [runId, String(clienteId), contratoId ? String(contratoId) : null, j(dados), healthScore ?? null, classificacao ?? null],
  )
  return rows.insertId
}

export async function insertRecommendation(rec) {
  const rows = await query(
    `insert into action_plan_recommendations
       (dossier_id, prompt_template_id, modelo_ia, status, resposta, resposta_bruta,
        erro_validacao, tokens_entrada, tokens_saida, tokens_usados, duracao_ms, tentativa)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.dossierId, rec.promptTemplateId, rec.modelo, rec.status,
      j(rec.resposta), rec.respostaBruta ?? null, rec.erroValidacao ?? null,
      rec.tokensEntrada ?? null, rec.tokensSaida ?? null,
      (rec.tokensEntrada ?? 0) + (rec.tokensSaida ?? 0) || null,
      rec.duracaoMs ?? null, rec.tentativa ?? 1,
    ],
  )
  return rows.insertId
}

function mapRecommendation(r) {
  return {
    id: r.id,
    dossierId: r.dossier_id,
    runId: r.run_id,
    clienteId: r.cliente_id,
    contratoId: r.contrato_id,
    setor: r.setor,
    healthScoreNoMomento: r.health_score_no_momento == null ? null : Number(r.health_score_no_momento),
    classificacao: r.classificacao,
    dossie: parseJson(r.dados_agregados),
    promptTemplateId: r.prompt_template_id,
    versaoPrompt: r.versao,
    modelo: r.modelo_ia,
    status: r.status,
    resposta: parseJson(r.resposta),
    erroValidacao: r.erro_validacao,
    tokens: { entrada: r.tokens_entrada, saida: r.tokens_saida, total: r.tokens_usados },
    duracaoMs: r.duracao_ms,
    tentativa: r.tentativa,
    criadoEm: r.criado_em,
    aprovacao: r.approval_id ? {
      id: r.approval_id, status: r.approval_status, gestorId: r.gestor_id,
      acoesEditadas: parseJson(r.acoes_editadas), comentario: r.comentario, decididoEm: r.decidido_em,
    } : null,
  }
}

const REC_SELECT = `
  select c.*, d.run_id, d.cliente_id, d.contrato_id, d.dados_agregados,
         d.health_score_no_momento, d.classificacao,
         r.setor, t.versao,
         a.id as approval_id, a.status as approval_status, a.gestor_id,
         a.acoes_editadas, a.comentario, a.decidido_em
    from action_plan_recommendations c
    join action_plan_dossiers d on d.id = c.dossier_id
    join action_plan_runs r on r.id = d.run_id
    join action_plan_prompt_templates t on t.id = c.prompt_template_id
    left join action_plan_approvals a on a.recommendation_id = c.id`

// Uma linha por cliente: a tentativa MAIS RECENTE. As anteriores continuam no
// banco (é o registro de que algo falhou), mas mostrar as duas faria a mesma
// pessoa aparecer duas vezes na lista de aprovação.
export async function listRecommendationsByRun(runId) {
  const rows = await query(
    `${REC_SELECT}
      join (select dossier_id, max(id) as ultima
              from action_plan_recommendations group by dossier_id) u
        on u.ultima = c.id
     where d.run_id = ?
     order by d.health_score_no_momento asc, c.id asc`,
    [runId],
  )
  return rows.map(mapRecommendation)
}

export async function getRecommendation(id) {
  const [r] = await query(`${REC_SELECT} where c.id = ?`, [id])
  return r ? mapRecommendation(r) : null
}

// ─── Decisão e tarefas ─────────────────────────────────────────
// Aprovar é uma transação: grava a decisão E cria as tarefas. Se a criação de
// tarefa falhar no meio, a recomendação não pode ficar marcada como aprovada
// sem tarefa nenhuma — é o estado que ninguém percebe que está errado.
export async function approveRecommendation({ recommendationId, gestorId, acoes, comentario, responsavelId }) {
  return withTransaction(async (conn) => {
    const [recRows] = await conn.execute(
      `select c.id, d.cliente_id, d.contrato_id, r.setor
         from action_plan_recommendations c
         join action_plan_dossiers d on d.id = c.dossier_id
         join action_plan_runs r on r.id = d.run_id
        where c.id = ? and c.status = 'valida'`,
      [recommendationId],
    )
    const rec = recRows[0]
    if (!rec) throw new Error('Recomendação não encontrada ou inválida (não pode ser aprovada).')

    await conn.execute(
      `insert into action_plan_approvals (recommendation_id, gestor_id, status, acoes_editadas, comentario, decidido_em)
       values (?, ?, 'aprovado', ?, ?, now())
       on duplicate key update gestor_id = values(gestor_id), status = 'aprovado',
         acoes_editadas = values(acoes_editadas), comentario = values(comentario), decidido_em = now()`,
      [recommendationId, gestorId, j(acoes), comentario || null],
    )
    const [apprRows] = await conn.execute('select id from action_plan_approvals where recommendation_id = ?', [recommendationId])
    const approvalId = apprRows[0].id

    // Reaprovar substitui as tarefas ainda não concluídas — o gestor mudou de
    // ideia sobre o plano, e as tarefas velhas não representam mais a decisão.
    await conn.execute("delete from action_plan_tasks where approval_id = ? and status = 'em_execucao'", [approvalId])

    const hoje = new Date()
    for (const a of acoes) {
      const prazo = new Date(hoje)
      prazo.setDate(prazo.getDate() + (Number(a.prazo_sugerido_dias) || 0))
      await conn.execute(
        `insert into action_plan_tasks
           (approval_id, cliente_id, contrato_id, setor, titulo, descricao, prioridade,
            responsavel_area, responsavel_id, prazo, status)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_execucao')`,
        [
          approvalId, rec.cliente_id, rec.contrato_id, rec.setor,
          a.titulo, a.descricao || null, a.prioridade || null,
          a.responsavel_sugerido || null, responsavelId || null,
          prazo.toISOString().slice(0, 10),
        ],
      )
    }
    return { approvalId, tarefasCriadas: acoes.length }
  })
}

export async function rejectRecommendation({ recommendationId, gestorId, comentario }) {
  await query(
    `insert into action_plan_approvals (recommendation_id, gestor_id, status, comentario, decidido_em)
     values (?, ?, 'rejeitado', ?, now())
     on duplicate key update gestor_id = values(gestor_id), status = 'rejeitado',
       comentario = values(comentario), decidido_em = now()`,
    [recommendationId, gestorId, comentario || null],
  )
  // Rejeitar depois de ter aprovado cancela o que ainda não foi feito.
  await query(
    `update action_plan_tasks t
       join action_plan_approvals a on a.id = t.approval_id
        set t.status = 'cancelado'
      where a.recommendation_id = ? and t.status = 'em_execucao'`,
    [recommendationId],
  )
  return { ok: true }
}

export async function listTasks({ responsavelId, status, setor, clienteId, limit = 200 } = {}) {
  const where = []
  const params = []
  if (responsavelId) { where.push('t.responsavel_id = ?'); params.push(responsavelId) }
  if (status) { where.push('t.status = ?'); params.push(status) }
  if (setor) { where.push('t.setor = ?'); params.push(setor) }
  if (clienteId) { where.push('t.cliente_id = ?'); params.push(String(clienteId)) }
  const rows = await query(
    `select t.*, d.dados_agregados, o.health_score_antes, o.health_score_depois,
            o.dias_decorridos, o.avaliado_em, o.classificacao_antes, o.classificacao_depois
       from action_plan_tasks t
       join action_plan_approvals a on a.id = t.approval_id
       join action_plan_recommendations c on c.id = a.recommendation_id
       join action_plan_dossiers d on d.id = c.dossier_id
       left join action_plan_outcomes o on o.task_id = t.id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by t.status = 'concluido', t.prazo asc, t.id asc
      limit ${Math.min(500, Math.max(1, Number(limit) || 200))}`,
    params,
  )
  return rows.map((r) => {
    const dossie = parseJson(r.dados_agregados)
    return {
      id: r.id, approvalId: r.approval_id, clienteId: r.cliente_id, contratoId: r.contrato_id,
      clienteNome: dossie?.nome ?? null, setor: r.setor,
      titulo: r.titulo, descricao: r.descricao, prioridade: r.prioridade,
      responsavelArea: r.responsavel_area, responsavelId: r.responsavel_id,
      prazo: r.prazo, status: r.status, concluidoEm: r.concluido_em, criadoEm: r.criado_em,
      resultado: r.health_score_depois == null ? null : {
        antes: Number(r.health_score_antes), depois: Number(r.health_score_depois),
        variacao: Number(r.health_score_depois) - Number(r.health_score_antes),
        classificacaoAntes: r.classificacao_antes, classificacaoDepois: r.classificacao_depois,
        diasDecorridos: r.dias_decorridos, avaliadoEm: r.avaliado_em,
      },
    }
  })
}

export async function setTaskStatus(id, status, responsavelId) {
  const permitido = ['em_execucao', 'concluido', 'cancelado']
  if (!permitido.includes(status)) throw new Error(`Status inválido. Esperado: ${permitido.join(' | ')}.`)
  await query(
    `update action_plan_tasks
        set status = ?, concluido_em = ?, responsavel_id = coalesce(responsavel_id, ?)
      where id = ?`,
    [status, status === 'concluido' ? new Date() : null, responsavelId || null, id],
  )
  return { ok: true }
}

export async function assignTask(id, responsavelId) {
  await query('update action_plan_tasks set responsavel_id = ? where id = ?', [responsavelId || null, id])
  return { ok: true }
}

// ─── Resultado (reavaliação de impacto) ────────────────────────
// Tarefas concluídas há >= prazoDias e ainda sem outcome — a fila do job.
export async function listTasksDueForOutcome(prazoDias = 30) {
  const rows = await query(
    `select t.id, t.cliente_id, t.concluido_em, d.health_score_no_momento, d.classificacao
       from action_plan_tasks t
       join action_plan_approvals a on a.id = t.approval_id
       join action_plan_recommendations c on c.id = a.recommendation_id
       join action_plan_dossiers d on d.id = c.dossier_id
       left join action_plan_outcomes o on o.task_id = t.id
      where t.status = 'concluido'
        and t.concluido_em is not null
        and o.id is null
        and t.concluido_em <= date_sub(now(), interval ? day)`,
    [Number(prazoDias) || 30],
  )
  return rows.map((r) => ({
    taskId: r.id,
    clienteId: r.cliente_id,
    concluidoEm: r.concluido_em,
    scoreAntes: r.health_score_no_momento == null ? null : Number(r.health_score_no_momento),
    classificacaoAntes: r.classificacao,
  }))
}

export async function insertOutcome(o) {
  await query(
    `insert into action_plan_outcomes
       (task_id, health_score_antes, health_score_depois, classificacao_antes, classificacao_depois,
        dias_decorridos, config_versao, observacao)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on duplicate key update health_score_depois = values(health_score_depois),
       classificacao_depois = values(classificacao_depois), dias_decorridos = values(dias_decorridos),
       config_versao = values(config_versao), observacao = values(observacao), avaliado_em = now()`,
    [
      o.taskId, o.scoreAntes ?? null, o.scoreDepois ?? null,
      o.classificacaoAntes ?? null, o.classificacaoDepois ?? null,
      o.diasDecorridos ?? null, o.configVersao ?? null, o.observacao ?? null,
    ],
  )
  return { ok: true }
}
