// O provedor simulado e a interpolação do prompt. O que importa aqui é o
// contrato: o que o provedor devolve tem de passar pela MESMA validação que a
// resposta real — senão o mock testaria um caminho que produção não percorre.
import { describe, it, expect } from 'vitest'
import { makeProvider, MockActionPlanProvider, DEFAULT_ANTHROPIC_MODEL } from './provider.mjs'
import { validateRecommendation } from './schema.mjs'
import { renderPrompt } from './dossier.mjs'

const dossie = {
  cliente_id: '266818',
  nome: 'CLIENTE DE TESTE',
  setor: 'financeiro',
  versao_prompt: 'v1',
  health_score_atual: 40,
  classificacao: 'critical',
  indicadores: [
    { nome: 'faturas_atrasadas', valor: 7, pontos: -25 },
    { nome: 'renegociacoes', valor: 1, pontos: -20 },
    { nome: 'faturas_pagas_no_prazo', valor: 0, pontos: 0 },
  ],
  planos_anteriores: [],
}

describe('provedor simulado', () => {
  it('devolve uma resposta que passa na validação de schema', async () => {
    const p = new MockActionPlanProvider()
    const r = await p.generatePlan({ system: 'irrelevante', dossie })
    expect(r.ok).toBe(true)
    const v = validateRecommendation(JSON.parse(r.rawText))
    expect(v.errors).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('usa os indicadores reais do dossiê, não texto genérico', async () => {
    const r = await new MockActionPlanProvider().generatePlan({ dossie })
    const plano = JSON.parse(r.rawText)
    expect(plano.indicadores_considerados).toContain('faturas_atrasadas')
    // O pior indicador (mais negativo) precisa aparecer na descrição.
    expect(JSON.stringify(plano)).toContain('faturas_atrasadas')
  })

  it('reconhece renegociação anterior e acrescenta a ação de revisão', async () => {
    const r = await new MockActionPlanProvider().generatePlan({ dossie })
    const plano = JSON.parse(r.rawText)
    expect(plano.acoes_recomendadas.length).toBe(2)
    const semReneg = await new MockActionPlanProvider().generatePlan({
      dossie: { ...dossie, indicadores: [{ nome: 'faturas_atrasadas', valor: 7, pontos: -25 }] },
    })
    expect(JSON.parse(semReneg.rawText).acoes_recomendadas.length).toBe(1)
  })

  it('deixa explícito que nenhuma IA foi consultada', async () => {
    const r = await new MockActionPlanProvider().generatePlan({ dossie })
    expect(JSON.parse(r.rawText).diagnostico).toMatch(/[Ss]imulação/)
    expect(r.modelo).toBe('mock-provider')
  })
})

describe('makeProvider', () => {
  it('cai no mock quando nenhum tipo é informado', () => {
    expect(makeProvider({}).kind).toBe('mock')
  })

  it('monta o provedor Anthropic com o modelo padrão do projeto', () => {
    const p = makeProvider({ kind: 'anthropic' })
    expect(p.kind).toBe('anthropic')
    expect(p.modelo).toBe(DEFAULT_ANTHROPIC_MODEL)
  })

  it('falha claro para tipo ainda não implementado, em vez de fingir', () => {
    expect(() => makeProvider({ kind: 'gemini' })).toThrow(/ainda não implementado/)
  })

  it('o provedor Anthropic recusa gerar sem chave cadastrada', async () => {
    const r = await makeProvider({ kind: 'anthropic' }).generatePlan({ system: 'x', dossie })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/chave de API/i)
  })
})

describe('renderPrompt', () => {
  it('interpola o dossiê no marcador', () => {
    const out = renderPrompt('Analise:\n{{dossie_json}}\nFim.', dossie)
    expect(out).not.toContain('{{dossie_json}}')
    expect(out).toContain('"cliente_id": "266818"')
  })

  it('aceita espaços dentro do marcador', () => {
    expect(renderPrompt('{{ dossie_json }}', dossie)).toContain('266818')
  })

  it('substitui todas as ocorrências', () => {
    const out = renderPrompt('{{dossie_json}} e {{dossie_json}}', { a: 1 })
    expect(out).toBe('{\n  "a": 1\n} e {\n  "a": 1\n}')
  })
})
