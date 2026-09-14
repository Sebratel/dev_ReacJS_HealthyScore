// Camada de provedores de IA: o simulado, a fábrica e o registro (data/ia.json).
//
// O que este arquivo protege, acima de tudo: a chave de API NÃO pode sair numa
// resposta da API. É a regra que, se quebrar, quebra em silêncio.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { construir, TIPOS, ROTULO_TIPO, MODELO_PADRAO, provedorDoEnv } from './provedor.mjs'
import * as registro from './registro.mjs'
import { validateRecommendation } from '../actionPlans/schema.mjs'
import { renderPrompt } from '../actionPlans/dossier.mjs'

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
  const p = construir({ tipo: 'simulado' })

  it('devolve uma resposta que passa na validação de schema', async () => {
    const r = await p.gerar({ dossie })
    const v = validateRecommendation(JSON.parse(r.texto))
    expect(v.errors).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('usa os indicadores reais do dossiê, não texto genérico', async () => {
    const plano = JSON.parse((await p.gerar({ dossie })).texto)
    expect(plano.indicadores_considerados).toContain('faturas_atrasadas')
    expect(JSON.stringify(plano)).toContain('faturas_atrasadas')
  })

  it('reconhece renegociação anterior e acrescenta a ação de revisão', async () => {
    expect(JSON.parse((await p.gerar({ dossie })).texto).acoes_recomendadas).toHaveLength(2)
    const semReneg = await p.gerar({ dossie: { ...dossie, indicadores: [{ nome: 'faturas_atrasadas', valor: 7, pontos: -25 }] } })
    expect(JSON.parse(semReneg.texto).acoes_recomendadas).toHaveLength(1)
  })

  it('deixa explícito que nenhuma IA foi consultada', async () => {
    const r = await p.gerar({ dossie })
    expect(JSON.parse(r.texto).diagnostico).toMatch(/[Ss]imulação/)
    expect(r.modelo).toBe('simulado')
  })
})

describe('fábrica de provedores', () => {
  it('conhece os quatro tipos, e cada um tem rótulo e modelo padrão', () => {
    expect(TIPOS).toEqual(['anthropic', 'openai', 'gemini', 'simulado'])
    for (const t of TIPOS) {
      expect(ROTULO_TIPO[t], `rótulo de ${t}`).toBeTruthy()
      expect(MODELO_PADRAO[t], `modelo padrão de ${t}`).toBeTruthy()
      expect(construir({ tipo: t }).nome).toBe(t)
    }
  })

  it('falha claro para tipo desconhecido, em vez de fingir', () => {
    expect(() => construir({ tipo: 'llama-caseiro' })).toThrow(/desconhecido/)
  })

  it('o padrão da Anthropic é o modelo atual do projeto', () => {
    expect(MODELO_PADRAO.anthropic).toBe('claude-opus-5')
  })
})

describe('provedorDoEnv', () => {
  const limpar = () => {
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER', 'AI_MODEL']) delete process.env[k]
  }
  beforeEach(limpar)
  afterEach(limpar)

  it('devolve null quando não há chave nenhuma no ambiente', () => {
    expect(provedorDoEnv()).toBeNull()
  })

  it('deduz o tipo pela chave presente', () => {
    process.env.OPENAI_API_KEY = 'sk-teste'
    expect(provedorDoEnv().tipo).toBe('openai')
  })

  it('AI_PROVIDER manda sobre a dedução', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-teste'
    process.env.AI_PROVIDER = 'gemini'
    expect(provedorDoEnv().tipo).toBe('gemini')
  })
})

describe('renderPrompt', () => {
  it('interpola o dossiê no marcador e não deixa o marcador para trás', () => {
    const out = renderPrompt('Analise:\n{{dossie_json}}\nFim.', dossie)
    expect(out).not.toContain('{{dossie_json}}')
    expect(out).toContain('"cliente_id": "266818"')
  })

  it('aceita espaços dentro do marcador e substitui todas as ocorrências', () => {
    expect(renderPrompt('{{ dossie_json }}', dossie)).toContain('266818')
    expect(renderPrompt('{{dossie_json}} e {{dossie_json}}', { a: 1 })).toBe('{\n  "a": 1\n} e {\n  "a": 1\n}')
  })
})

// ─── Registro (data/ia.json) ───────────────────────────────────
// Cada teste roda num diretório temporário próprio. Funciona com um import
// estático porque o caminho é resolvido a cada chamada, não congelado no
// import — o que também é o comportamento certo em produção.
describe('registro do provedor', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'healthscore-ia-'))
    process.env.IA_DATA_DIR = dir
    delete process.env.APP_SECRET
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) delete process.env[k]
  })

  afterEach(() => {
    delete process.env.IA_DATA_DIR
    rmSync(dir, { recursive: true, force: true })
  })

  it('começa não configurado e oferece os tipos para a tela', () => {
    const e = registro.estado()
    expect(e.configurado).toBe(false)
    expect(e.origem).toBeNull()
    expect(e.tipos.map((t) => t.id)).toEqual(TIPOS)
  })

  it('sem nada cadastrado, o provedor ativo cai no simulado em vez de estourar', () => {
    const { provedor, simulado } = registro.provedorAtivo()
    expect(simulado).toBe(true)
    expect(provedor.nome).toBe('simulado')
  })

  it('grava a chave cifrada e NUNCA a devolve — só os 4 últimos caracteres', () => {
    const e = registro.salvar(
      { tipo: 'anthropic', modelo: 'claude-opus-5', chave: 'sk-ant-super-secreta-4f2a', maxTokens: 8000 },
      'admin@sebratel.com.br',
    )
    expect(e.configurado).toBe(true)
    expect(e.dica).toBe('••••4f2a')
    // A visão pública não pode conter a chave em lugar nenhum.
    expect(JSON.stringify(e)).not.toContain('super-secreta')
    // Nem o arquivo em repouso.
    const bruto = readFileSync(join(dir, 'ia.json'), 'utf8')
    expect(bruto).not.toContain('super-secreta')
    expect(bruto).toContain('chaveCifrada')
    // Mas o uso interno consegue decifrar.
    expect(registro.configuracaoAtiva().chave).toBe('sk-ant-super-secreta-4f2a')
  })

  it('gera a chave de cifra no volume quando APP_SECRET não existe', () => {
    registro.salvar({ tipo: 'anthropic', modelo: 'claude-opus-5', chave: 'sk-ant-abcd' }, 'admin@sebratel.com.br')
    expect(existsSync(join(dir, '.secret'))).toBe(true)
    expect(registro.estado().segredo).toBe('volume')
  })

  it('salvar sem chave mantém a que já estava (é o campo em branco da tela)', () => {
    registro.salvar({ tipo: 'anthropic', modelo: 'claude-opus-5', chave: 'sk-ant-1234' }, 'a@b.c')
    registro.salvar({ tipo: 'anthropic', modelo: 'claude-sonnet-5' }, 'a@b.c')
    const e = registro.estado()
    expect(e.modelo).toBe('claude-sonnet-5')
    expect(e.dica).toBe('••••1234')
    expect(registro.configuracaoAtiva().chave).toBe('sk-ant-1234')
  })

  it('trocar a chave invalida o teste anterior — senão a tela mostraria um "ok" de outra chave', async () => {
    registro.salvar({ tipo: 'simulado', modelo: 'simulado' }, 'a@b.c')
    const t = await registro.testar()
    expect(t.ok).toBe(true)
    expect(registro.estado().ultimoTeste.ok).toBe(true)

    registro.salvar({ tipo: 'anthropic', modelo: 'claude-opus-5', chave: 'sk-ant-nova' }, 'a@b.c')
    expect(registro.estado().ultimoTeste).toBeNull()
  })

  it('o tipo simulado é "configurado" sem chave nenhuma — é o ponto dele', () => {
    const e = registro.salvar({ tipo: 'simulado', modelo: 'simulado' }, 'a@b.c')
    expect(e.configurado).toBe(true)
    expect(e.dica).toBeNull()
    expect(registro.provedorAtivo().simulado).toBe(true)
  })

  it('recusa provedor sem modelo, tipo inválido e URL base sem esquema', () => {
    expect(() => registro.salvar({ tipo: 'anthropic', modelo: '', chave: 'x' }, 'a@b.c')).toThrow(/modelo/)
    expect(() => registro.salvar({ tipo: 'inexistente', modelo: 'x', chave: 'y' }, 'a@b.c')).toThrow(/inválido/)
    expect(() => registro.salvar({ tipo: 'openai', modelo: 'gpt', chave: 'y', baseUrl: 'ftp://x' }, 'a@b.c')).toThrow(/URL base/)
    expect(() => registro.salvar({ tipo: 'openai', modelo: 'gpt', chave: 'y', maxTokens: 10 }, 'a@b.c')).toThrow(/tokens/)
  })

  it('cadastrar um provedor real sem informar chave é recusado', () => {
    expect(() => registro.salvar({ tipo: 'anthropic', modelo: 'claude-opus-5' }, 'a@b.c')).toThrow(/chave de API/)
  })

  it('remover apaga o arquivo e volta ao não configurado', () => {
    registro.salvar({ tipo: 'anthropic', modelo: 'claude-opus-5', chave: 'sk-ant-1234' }, 'a@b.c')
    expect(existsSync(join(dir, 'ia.json'))).toBe(true)
    const e = registro.remover()
    expect(existsSync(join(dir, 'ia.json'))).toBe(false)
    expect(e.configurado).toBe(false)
  })
})
