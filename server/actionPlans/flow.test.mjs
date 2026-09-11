// ─────────────────────────────────────────────────────────────────────────
// Fluxo ponta a ponta: dossiê → recomendação (provider mockado) → aprovação →
// tarefa → reavaliação. Exercita a máquina de estados da seção 6 contra um
// MariaDB de verdade.
//
// Roda numa BASE PRÓPRIA, criada e derrubada pelo próprio teste. Como isso
// acontece no mesmo servidor MariaDB da casa, é opt-in de propósito — um
// `npm test` distraído não deve criar e apagar bases em produção:
//
//   ACTION_PLAN_E2E=1 npm test
// ─────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mysql from 'mysql2/promise'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HABILITADO = process.env.ACTION_PLAN_E2E === '1'
const TEST_DB = process.env.ACTION_PLAN_E2E_DB || 'DB_HealthScore_Test'
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = resolve(__dirname, '../migrations')

// Importados dinamicamente: os módulos leem DB_APP_DATABASE na primeira
// conexão, então a env precisa estar posta antes do import.
let store, closePool, MockActionPlanProvider, validateRecommendation

function cfg() {
  return {
    host: process.env.DB_APP_HOST || process.env.DB_MARIA_HOST,
    port: Number(process.env.DB_APP_PORT || process.env.DB_MARIA_PORT) || 3306,
    user: process.env.DB_APP_USER || process.env.DB_MARIA_USER,
    password: process.env.DB_APP_PASSWORD || process.env.DB_MARIA_PASSWORD,
  }
}

// Mesma divisão de statements do runner de migrations, simplificada: os
// arquivos do projeto não têm ';' dentro de string.
function statementsOf(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

describe.runIf(HABILITADO)('fluxo ponta a ponta dos Planos de Ação', () => {
  beforeAll(async () => {
    process.env.DB_APP_DATABASE = TEST_DB
    const root = await mysql.createConnection(cfg())
    await root.query(`drop database if exists \`${TEST_DB}\``)
    await root.query(`create database \`${TEST_DB}\` character set utf8mb4 collate utf8mb4_unicode_ci`)
    await root.end()

    const conn = await mysql.createConnection({ ...cfg(), database: TEST_DB })
    for (const f of readdirSync(MIGRATIONS).filter((x) => /^\d{3}-.+\.sql$/.test(x)).sort()) {
      for (const st of statementsOf(readFileSync(join(MIGRATIONS, f), 'utf8'))) await conn.query(st)
    }
    await conn.end()

    store = await import('./store.mjs')
    ;({ closePool } = await import('../db.mjs'))
    ;({ MockActionPlanProvider } = await import('./provider.mjs'))
    ;({ validateRecommendation } = await import('./schema.mjs'))
  })

  afterAll(async () => {
    if (closePool) await closePool()
    const root = await mysql.createConnection(cfg())
    await root.query(`drop database if exists \`${TEST_DB}\``)
    await root.end()
  })

  const dossie = {
    cliente_id: '999001',
    nome: 'CLIENTE E2E',
    setor: 'financeiro',
    health_score_atual: 38,
    classificacao: 'critical',
    indicadores: [{ nome: 'faturas_atrasadas', valor: 6, pontos: -25 }],
    planos_anteriores: [],
  }

  let runId, dossierId, recId, approvalId

  it('semeia o prompt do Financeiro e o mantém único por setor', async () => {
    const ativo = await store.getActiveTemplate('financeiro')
    expect(ativo).toBeTruthy()
    expect(ativo.versao).toBe('v1')

    // Uma segunda versão ativa desativa a primeira — a regra é do banco.
    await store.createTemplateVersion(
      { setor: 'financeiro', versao: 'v2', conteudo: 'Novo prompt {{dossie_json}}' },
      'teste@sebratel.com.br',
    )
    const agora = await store.getActiveTemplate('financeiro')
    expect(agora.versao).toBe('v2')
    const todos = await store.listTemplates('financeiro')
    expect(todos.filter((t) => t.ativo)).toHaveLength(1)
  })

  it('recusa prompt sem o marcador do dossiê', async () => {
    await expect(
      store.createTemplateVersion({ setor: 'financeiro', versao: 'v3', conteudo: 'sem marcador' }, 'x@y.z'),
    ).rejects.toThrow(/dossie_json/)
  })

  it('cria a rodada e grava o dossiê congelado', async () => {
    runId = await store.createRun({ setor: 'financeiro', criterio: { quantidade: 1 } }, 'gestor@sebratel.com.br')
    expect(runId).toBeGreaterThan(0)

    dossierId = await store.insertDossier({
      runId, clienteId: dossie.cliente_id, contratoId: '266818',
      dados: dossie, healthScore: 38, classificacao: 'critical',
    })
    expect(dossierId).toBeGreaterThan(0)
  })

  it('grava a recomendação do provedor mockado depois de validar o schema', async () => {
    const r = await new MockActionPlanProvider().generatePlan({ dossie })
    const v = validateRecommendation(JSON.parse(r.rawText))
    expect(v.ok).toBe(true)

    const tpl = await store.getActiveTemplate('financeiro')
    recId = await store.insertRecommendation({
      dossierId, promptTemplateId: tpl.id, modelo: r.modelo,
      status: 'valida', resposta: v.value, duracaoMs: r.duracaoMs,
    })
    const rec = await store.getRecommendation(recId)
    expect(rec.status).toBe('valida')
    // O JSON precisa voltar como OBJETO — no MariaDB a coluna json é longtext.
    expect(rec.resposta.acoes_recomendadas[0].titulo).toBeTruthy()
    expect(rec.dossie.cliente_id).toBe('999001')
  })

  it('resposta fora do schema é gravada como falha e não vira recomendação válida', async () => {
    const tpl = await store.getActiveTemplate('financeiro')
    const badId = await store.insertRecommendation({
      dossierId, promptTemplateId: tpl.id, modelo: 'mock-provider',
      status: 'falha_schema', respostaBruta: '{"diagnostico":', erroValidacao: 'JSON inválido',
    })
    const bad = await store.getRecommendation(badId)
    expect(bad.status).toBe('falha_schema')
    expect(bad.resposta).toBeNull()

    // A lista da rodada mostra só a tentativa mais recente por cliente.
    const lista = await store.listRecommendationsByRun(runId)
    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe(badId)
  })

  it('aprovar cria as tarefas com prazo e responsável', async () => {
    const rec = await store.getRecommendation(recId)
    const out = await store.approveRecommendation({
      recommendationId: recId,
      gestorId: 'gestor@sebratel.com.br',
      acoes: rec.resposta.acoes_recomendadas,
      comentario: 'Aprovado sem edição.',
      responsavelId: 'cobranca@sebratel.com.br',
    })
    approvalId = out.approvalId
    expect(out.tarefasCriadas).toBe(rec.resposta.acoes_recomendadas.length)

    const tasks = await store.listTasks({ clienteId: '999001' })
    expect(tasks.length).toBe(out.tarefasCriadas)
    expect(tasks[0].status).toBe('em_execucao')
    expect(tasks[0].prazo).toBeTruthy()
    expect(tasks[0].responsavelId).toBe('cobranca@sebratel.com.br')
    expect(tasks[0].clienteNome).toBe('CLIENTE E2E')
  })

  it('não deixa aprovar uma recomendação inválida', async () => {
    const lista = await store.listRecommendationsByRun(runId)
    const invalida = lista.find((x) => x.status !== 'valida')
    if (invalida) {
      await expect(
        store.approveRecommendation({ recommendationId: invalida.id, gestorId: 'g@s.br', acoes: [] }),
      ).rejects.toThrow()
    }
  })

  it('concluir a tarefa carimba a data', async () => {
    const [t] = await store.listTasks({ clienteId: '999001' })
    await store.setTaskStatus(t.id, 'concluido', 'cobranca@sebratel.com.br')
    const [depois] = await store.listTasks({ clienteId: '999001', status: 'concluido' })
    expect(depois.concluidoEm).toBeTruthy()
  })

  it('a reavaliação registra antes, depois e a régua usada', async () => {
    const [t] = await store.listTasks({ clienteId: '999001', status: 'concluido' })
    await store.insertOutcome({
      taskId: t.id, scoreAntes: 38, scoreDepois: 55,
      classificacaoAntes: 'critical', classificacaoDepois: 'attention',
      diasDecorridos: 30, configVersao: 'oficial@2026-09-01T13:21:30.322Z',
    })
    const [comResultado] = await store.listTasks({ clienteId: '999001', status: 'concluido' })
    expect(comResultado.resultado.antes).toBe(38)
    expect(comResultado.resultado.depois).toBe(55)
    expect(comResultado.resultado.variacao).toBe(17)
  })

  it('o histórico do cliente alimenta o próximo dossiê', async () => {
    const { fetchPreviousPlans } = await import('./dossier.mjs')
    const anteriores = await fetchPreviousPlans('999001')
    expect(anteriores.length).toBeGreaterThan(0)
    expect(anteriores[0].resultado.variacao).toBe(17)
  })

  it('rejeitar cancela as tarefas ainda em execução', async () => {
    const rec = await store.getRecommendation(recId)
    await store.approveRecommendation({
      recommendationId: recId, gestorId: 'g@sebratel.com.br',
      acoes: rec.resposta.acoes_recomendadas, responsavelId: 'x@sebratel.com.br',
    })
    await store.rejectRecommendation({ recommendationId: recId, gestorId: 'g@sebratel.com.br', comentario: 'Mudei de ideia.' })

    const emExecucao = await store.listTasks({ clienteId: '999001', status: 'em_execucao' })
    expect(emExecucao).toHaveLength(0)
    const depois = await store.getRecommendation(recId)
    expect(depois.aprovacao.status).toBe('rejeitado')
  })

  it('o placar da rodada conta válidas, falhas e decididas', async () => {
    const [run] = await store.listRuns({ setor: 'financeiro' })
    expect(run.totais.dossies).toBe(1)
    expect(run.totais.validas).toBe(1)
    expect(run.totais.falhas).toBe(1)
    expect(run.totais.decididas).toBe(1)
  })
})

describe.skipIf(HABILITADO)('fluxo ponta a ponta (pulado)', () => {
  it('precisa de ACTION_PLAN_E2E=1 — cria e derruba uma base no MariaDB', () => {
    expect(HABILITADO).toBe(false)
  })
})
