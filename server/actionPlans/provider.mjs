// ─────────────────────────────────────────────────────────────────────────
// Provedor de IA do módulo de Planos de Ação.
//
// Contrato (AiActionPlanProvider):
//   generatePlan({ system, dossie }) → {
//     ok, value | rawText, modelo, tokensEntrada, tokensSaida, duracaoMs, erro
//   }
//
// Duas implementações:
//   • anthropic — SDK oficial, com o JSON Schema forçado NA ORIGEM via
//     output_config.format (structured outputs). É o caminho de produção.
//   • mock      — determinístico, sem rede. Existe para o fluxo inteiro
//     (rodada → dossiê → aprovação → tarefa → resultado) ser testável e
//     demonstrável antes de haver credencial, e para os testes automatizados.
//
// O dossiê só sai do backend nesta chamada. Nada de dado de cliente trafega
// para o frontend em direção ao provedor.
// ─────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { ACTION_PLAN_JSON_SCHEMA } from './schema.mjs'

// Modelo padrão quando o cadastro não diz outro.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5'

class AnthropicActionPlanProvider {
  constructor(cfg) {
    this.cfg = cfg
    this.kind = 'anthropic'
    this.modelo = cfg.modelo || DEFAULT_ANTHROPIC_MODEL
  }

  client() {
    if (!this.cfg.apiKey) throw new Error('Provedor sem chave de API cadastrada.')
    return new Anthropic({
      apiKey: this.cfg.apiKey,
      ...(this.cfg.baseUrl ? { baseURL: this.cfg.baseUrl } : {}),
    })
  }

  async generatePlan({ system, dossie }) {
    const t0 = Date.now()
    try {
      const response = await this.client().messages.create({
        model: this.modelo,
        max_tokens: this.cfg.maxTokens ?? 16000,
        system,
        messages: [{ role: 'user', content: JSON.stringify(dossie) }],
        output_config: {
          ...(this.cfg.effort ? { effort: this.cfg.effort } : {}),
          // Schema forçado na origem — a primeira das duas barreiras.
          format: { type: 'json_schema', schema: ACTION_PLAN_JSON_SCHEMA },
        },
      })

      const duracaoMs = Date.now() - t0
      const usage = {
        tokensEntrada: response.usage?.input_tokens ?? null,
        tokensSaida: response.usage?.output_tokens ?? null,
      }

      // Recusa por política: HTTP 200, sem conteúdo útil. Tratar antes de ler
      // content, senão vira "resposta vazia" e confunde quem for investigar.
      if (response.stop_reason === 'refusal') {
        return {
          ok: false, modelo: response.model || this.modelo, duracaoMs, ...usage,
          erro: `O modelo recusou a geração (categoria: ${response.stop_details?.category ?? 'não informada'}).`,
        }
      }
      if (response.stop_reason === 'max_tokens') {
        return {
          ok: false, modelo: response.model || this.modelo, duracaoMs, ...usage,
          erro: 'A resposta foi cortada por max_tokens — aumente o limite do provedor.',
        }
      }

      const rawText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')

      return { ok: true, rawText, modelo: response.model || this.modelo, duracaoMs, ...usage }
    } catch (e) {
      const duracaoMs = Date.now() - t0
      const modelo = this.modelo
      // Do mais específico ao mais genérico — a diferença entre "tente de novo"
      // e "o cadastro está errado" importa para quem está na tela.
      if (e instanceof Anthropic.AuthenticationError) return { ok: false, modelo, duracaoMs, erro: 'Chave de API inválida ou sem permissão.' }
      if (e instanceof Anthropic.RateLimitError) return { ok: false, modelo, duracaoMs, erro: 'Limite de requisições do provedor atingido. Tente novamente em instantes.' }
      if (e instanceof Anthropic.BadRequestError) return { ok: false, modelo, duracaoMs, erro: `Requisição recusada pelo provedor: ${e.message}` }
      if (e instanceof Anthropic.APIError) return { ok: false, modelo, duracaoMs, erro: `Erro do provedor (HTTP ${e.status}): ${e.message}` }
      return { ok: false, modelo, duracaoMs, erro: `Falha ao chamar o provedor: ${e.message}` }
    }
  }

  // Teste de conexão do cadastro: uma chamada mínima, só para saber se a
  // chave e o modelo respondem.
  async testConnection() {
    const t0 = Date.now()
    try {
      await this.client().messages.create({
        model: this.modelo,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ok' }],
      })
      return { ok: true, ms: Date.now() - t0 }
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, erro: e.message }
    }
  }
}

// ─── Provedor simulado ─────────────────────────────────────────
// Devolve um plano coerente com o dossiê recebido (usa os indicadores reais do
// cliente), para a tela e os testes exercitarem o caminho feliz sem rede. NÃO
// é IA: é uma resposta montada, e a tela deixa isso explícito.
class MockActionPlanProvider {
  constructor(cfg = {}) {
    this.cfg = cfg
    this.kind = 'mock'
    this.modelo = 'mock-provider'
  }

  async generatePlan({ dossie }) {
    const t0 = Date.now()
    const piores = (dossie.indicadores || [])
      .filter((i) => Number(i.pontos) < 0)
      .sort((a, b) => Number(a.pontos) - Number(b.pontos))
    const nomes = piores.map((i) => i.nome)
    const pior = piores[0]

    const acoes = [{
      titulo: 'Contato ativo de negociação antes de qualquer restrição',
      descricao: pior
        ? `Ligar para o cliente e oferecer parcelamento do débito. O indicador de maior peso negativo é "${pior.nome}" (valor ${pior.valor}, ${pior.pontos} pontos).`
        : 'Ligar para o cliente e entender a situação financeira antes de qualquer restrição de serviço.',
      prioridade: 'alta',
      prazo_sugerido_dias: 3,
      responsavel_sugerido: 'cobranca',
      impacto_esperado: 'Regularização sem atrito e sem interrupção do serviço.',
    }]
    if (nomes.includes('renegociacoes')) {
      acoes.push({
        titulo: 'Revisar histórico de renegociações antes de oferecer nova',
        descricao: 'O cliente já renegociou antes. Verificar por que a renegociação anterior não se sustentou antes de repetir a mesma oferta.',
        prioridade: 'media',
        prazo_sugerido_dias: 7,
        responsavel_sugerido: 'atendimento',
        impacto_esperado: 'Evita repetir um acordo que já falhou.',
      })
    }

    return {
      ok: true,
      modelo: this.modelo,
      duracaoMs: Date.now() - t0,
      tokensEntrada: null,
      tokensSaida: null,
      rawText: JSON.stringify({
        cliente_id: String(dossie.cliente_id),
        setor: dossie.setor || 'financeiro',
        versao_prompt: dossie.versao_prompt || 'v1',
        diagnostico: `Cliente com health score ${dossie.health_score_atual} (${dossie.classificacao}) no setor ${dossie.setor}. Simulação — nenhuma IA foi consultada.`,
        causas_provaveis: nomes.length ? nomes.map((n) => `Indicador negativo: ${n}`) : ['Sem indicador negativo identificado no dossiê.'],
        acoes_recomendadas: acoes,
        indicadores_considerados: (dossie.indicadores || []).map((i) => i.nome),
        confianca_modelo: 0.5,
      }),
    }
  }

  async testConnection() {
    return { ok: true, ms: 0 }
  }
}

// Fábrica. `cfg` vem do cadastro (providerStore), já com a chave decifrada.
export function makeProvider(cfg) {
  const kind = (cfg?.kind || 'mock').toLowerCase()
  if (kind === 'mock') return new MockActionPlanProvider(cfg)
  if (kind === 'anthropic') return new AnthropicActionPlanProvider(cfg)
  // openai/gemini existem no cadastro para o dia em que forem ligados; até lá,
  // falhar claro é melhor do que fingir que funciona.
  throw new Error(`Provedor "${kind}" ainda não implementado neste módulo. Use um provedor Anthropic.`)
}

export { AnthropicActionPlanProvider, MockActionPlanProvider }
