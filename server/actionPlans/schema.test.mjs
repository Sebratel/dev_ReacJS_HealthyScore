// Validação do contrato de saída da IA. É a barreira que impede um plano
// malformado de chegar ao gestor parecendo bom — o modo de falha perigoso
// deste módulo. Cada caso aqui é uma forma real de a geração sair errada.
import { describe, it, expect } from 'vitest'
import { validateRecommendation, validateEditedActions, ACTION_PLAN_JSON_SCHEMA } from './schema.mjs'

const acaoValida = {
  titulo: 'Contato ativo de negociação',
  descricao: 'Ligar em até 3 dias oferecendo parcelamento em 3x.',
  prioridade: 'alta',
  prazo_sugerido_dias: 3,
  responsavel_sugerido: 'cobranca',
  impacto_esperado: 'Regularização sem interrupção do serviço.',
}

const valida = {
  cliente_id: '266818',
  setor: 'financeiro',
  versao_prompt: 'v1',
  diagnostico: 'Cliente com 7 faturas em atraso e histórico de renegociação.',
  causas_provaveis: ['Inadimplência recorrente'],
  acoes_recomendadas: [acaoValida],
  indicadores_considerados: ['faturas_atrasadas'],
  confianca_modelo: 0.72,
}

describe('validateRecommendation', () => {
  it('aceita uma resposta completa e bem formada', () => {
    const r = validateRecommendation(valida)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.value).toBe(valida)
  })

  it('recusa quando não é objeto', () => {
    for (const v of [null, undefined, 'texto', 42, ['a']]) {
      expect(validateRecommendation(v).ok).toBe(false)
    }
  })

  it('recusa campo de texto ausente ou só espaços', () => {
    const r = validateRecommendation({ ...valida, diagnostico: '   ' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('diagnostico')
  })

  it('recusa plano sem nenhuma ação — passaria num validador estrutural e seria inútil', () => {
    const r = validateRecommendation({ ...valida, acoes_recomendadas: [] })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('pelo menos uma ação')
  })

  it('recusa prioridade fora do enum', () => {
    const r = validateRecommendation({
      ...valida,
      acoes_recomendadas: [{ ...acaoValida, prioridade: 'urgentíssima' }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('prioridade inválida')
  })

  it('recusa responsável fora do enum', () => {
    const r = validateRecommendation({
      ...valida,
      acoes_recomendadas: [{ ...acaoValida, responsavel_sugerido: 'financeiro' }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('responsavel_sugerido')
  })

  it('recusa prazo não inteiro, negativo ou absurdo', () => {
    for (const p of [1.5, -1, 400, '3', null]) {
      const r = validateRecommendation({ ...valida, acoes_recomendadas: [{ ...acaoValida, prazo_sugerido_dias: p }] })
      expect(r.ok, `prazo ${p} deveria falhar`).toBe(false)
    }
  })

  it('recusa confianca_modelo fora da faixa 0–1', () => {
    expect(validateRecommendation({ ...valida, confianca_modelo: 72 }).ok).toBe(false)
    expect(validateRecommendation({ ...valida, confianca_modelo: -0.1 }).ok).toBe(false)
    expect(validateRecommendation({ ...valida, confianca_modelo: 0 }).ok).toBe(true)
    expect(validateRecommendation({ ...valida, confianca_modelo: 1 }).ok).toBe(true)
  })

  it('recusa listas de texto que vieram como outra coisa', () => {
    expect(validateRecommendation({ ...valida, causas_provaveis: 'inadimplência' }).ok).toBe(false)
    expect(validateRecommendation({ ...valida, indicadores_considerados: [1, 2] }).ok).toBe(false)
  })

  it('acumula todos os erros em vez de parar no primeiro', () => {
    const r = validateRecommendation({ ...valida, diagnostico: '', confianca_modelo: 9 })
    expect(r.errors.length).toBeGreaterThanOrEqual(2)
  })
})

describe('validateEditedActions', () => {
  it('aceita ações editadas pelo gestor no mesmo formato', () => {
    const r = validateEditedActions([{ ...acaoValida, titulo: 'Título reescrito pelo gestor' }])
    expect(r.ok).toBe(true)
  })

  it('recusa aprovação sem nenhuma ação', () => {
    expect(validateEditedActions([]).ok).toBe(false)
    expect(validateEditedActions(null).ok).toBe(false)
  })

  it('não cobra do gestor os campos que são da IA (diagnóstico, confiança)', () => {
    const r = validateEditedActions([acaoValida])
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })
})

describe('ACTION_PLAN_JSON_SCHEMA', () => {
  it('é estrito — o modo structured output exige additionalProperties:false e required completo', () => {
    expect(ACTION_PLAN_JSON_SCHEMA.additionalProperties).toBe(false)
    expect(ACTION_PLAN_JSON_SCHEMA.required).toContain('acoes_recomendadas')
    const acao = ACTION_PLAN_JSON_SCHEMA.properties.acoes_recomendadas.items
    expect(acao.additionalProperties).toBe(false)
    expect(acao.required).toHaveLength(6)
  })
})
