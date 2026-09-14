// ─────────────────────────────────────────────────────────────────────────
// Camada desacoplada de LLM — mesmo desenho do comercial_pbi
// (dashboard/server/src/ia/provedor.js). Três dialetos, uma interface:
//
//   anthropic — API de mensagens
//   openai    — /chat/completions. Cobre Azure, Groq, OpenRouter, Together e
//               servidores locais compatíveis: muda só a URL base.
//   gemini    — generateContent do Google
//   simulado  — sem rede; existe para o fluxo inteiro ser demonstrável e
//               testável antes de haver credencial.
//
// HTTP cru em vez do SDK oficial de propósito: são três provedores atrás de
// uma interface só, e misturar SDK num deles com fetch nos outros dobraria o
// tratamento de erro e o timeout. É o padrão já em produção no comercial_pbi.
//
// SAÍDA ESTRUTURADA: cada dialeto pede JSON do jeito que sabe — Anthropic
// aceita o JSON Schema inteiro; OpenAI e Gemini entram em "modo JSON". Nenhum
// deles é a garantia: a garantia é o validador do servidor
// (actionPlans/schema.mjs), que roda depois em qualquer caminho.
// ─────────────────────────────────────────────────────────────────────────
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 120000

async function pedir(url, corpo, headers) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(corpo),
      signal: abort.signal,
    })
    const texto = await res.text()
    let json = {}
    try { json = JSON.parse(texto) } catch { /* resposta não-JSON */ }
    if (!res.ok) {
      const err = json.error
      const detalhe = typeof err === 'string' ? err : err?.message
      throw new Error(detalhe || texto.slice(0, 300) || `HTTP ${res.status}`)
    }
    return json
  } catch (e) {
    if (abort.signal.aborted) {
      throw new Error(`O provedor de IA não respondeu em ${Math.round(TIMEOUT_MS / 1000)}s.`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function buscar(url, headers) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 30000)
  try {
    const res = await fetch(url, { headers, signal: abort.signal })
    const texto = await res.text()
    let json = {}
    try { json = JSON.parse(texto) } catch { /* resposta não-JSON */ }
    if (!res.ok) {
      const err = json.error
      const detalhe = typeof err === 'string' ? err : err?.message
      throw new Error(detalhe || texto.slice(0, 300) || `HTTP ${res.status}`)
    }
    return json
  } finally {
    clearTimeout(timer)
  }
}

const limpaBarra = (u) => String(u).replace(/\/+$/, '')
const uso = (entrada, saida) => ({ tokensEntrada: entrada ?? null, tokensSaida: saida ?? null })

// --------------------------------------------------------------- Anthropic
const anthropic = (cfg) => ({
  nome: 'anthropic',

  async gerar({ sistema, pergunta, schema }) {
    const base = limpaBarra(cfg.baseUrl || 'https://api.anthropic.com')
    const json = await pedir(`${base}/v1/messages`, {
      model: cfg.modelo,
      max_tokens: cfg.maxTokens || 8000,
      system: sistema,
      messages: [{ role: 'user', content: pergunta }],
      output_config: {
        ...(cfg.effort ? { effort: cfg.effort } : {}),
        // Schema forçado na origem — o único dos três que aceita o schema
        // completo em vez de só "responda em JSON".
        ...(schema ? { format: { type: 'json_schema', schema } } : {}),
      },
    }, {
      'x-api-key': cfg.chave,
      'anthropic-version': '2023-06-01',
    })

    // Recusa por política: HTTP 200, sem conteúdo útil. Tratar antes de ler o
    // content, senão vira "resposta vazia" e confunde quem for investigar.
    if (json.stop_reason === 'refusal') {
      throw new Error(`O modelo recusou a geração (categoria: ${json.stop_details?.category ?? 'não informada'}).`)
    }
    if (json.stop_reason === 'max_tokens') {
      throw new Error('A resposta foi cortada por max_tokens — aumente o teto de tokens do provedor.')
    }
    const texto = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    return { texto, modelo: json.model || cfg.modelo, ...uso(json.usage?.input_tokens, json.usage?.output_tokens) }
  },

  async conversar(sistema, pergunta) {
    return (await this.gerar({ sistema, pergunta })).texto
  },

  async modelos() {
    const base = limpaBarra(cfg.baseUrl || 'https://api.anthropic.com')
    const json = await buscar(`${base}/v1/models?limit=100`, {
      'x-api-key': cfg.chave,
      'anthropic-version': '2023-06-01',
    })
    return (json.data || []).filter((m) => m.id).map((m) => ({ id: m.id, label: m.display_name || m.id }))
  },
})

// ------------------------------------------------------ OpenAI e compatíveis
const openai = (cfg) => ({
  nome: 'openai',

  async gerar({ sistema, pergunta, schema }) {
    const base = limpaBarra(cfg.baseUrl || 'https://api.openai.com/v1')
    const json = await pedir(`${base}/chat/completions`, {
      model: cfg.modelo,
      max_completion_tokens: cfg.maxTokens || 8000,
      // Modo JSON: garante que a resposta é JSON analisável, não que ela
      // obedece ao schema. Quem cobra o schema é o validador do servidor.
      ...(schema ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: pergunta },
      ],
    }, { authorization: `Bearer ${cfg.chave}` })
    return {
      texto: json.choices?.[0]?.message?.content || '',
      modelo: json.model || cfg.modelo,
      ...uso(json.usage?.prompt_tokens, json.usage?.completion_tokens),
    }
  },

  async conversar(sistema, pergunta) {
    return (await this.gerar({ sistema, pergunta })).texto
  },

  async modelos() {
    const base = limpaBarra(cfg.baseUrl || 'https://api.openai.com/v1')
    const json = await buscar(`${base}/models`, { authorization: `Bearer ${cfg.chave}` })
    const dados = (json.data || []).filter((m) => m.id)
    // a lista traz embeddings, TTS, moderação… filtra o que conversa
    const conversam = dados.filter((m) => /gpt|^o\d|chat|llama|mistral|qwen|claude|gemini|deepseek/i.test(m.id))
    return (conversam.length ? conversam : dados)
      .map((m) => ({ id: m.id, label: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id))
  },
})

// ------------------------------------------------------------------ Gemini
const gemini = (cfg) => ({
  nome: 'gemini',

  async gerar({ sistema, pergunta, schema }) {
    const base = limpaBarra(cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
    const json = await pedir(`${base}/models/${encodeURIComponent(cfg.modelo)}:generateContent`, {
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: 'user', parts: [{ text: pergunta }] }],
      generationConfig: {
        maxOutputTokens: cfg.maxTokens || 8000,
        // Modo JSON, como no OpenAI: forma garantida, schema não.
        ...(schema ? { responseMimeType: 'application/json' } : {}),
      },
    }, { 'x-goog-api-key': cfg.chave })
    const texto = (json.candidates?.[0]?.content?.parts || [])
      .filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n')
    return {
      texto,
      modelo: cfg.modelo,
      ...uso(json.usageMetadata?.promptTokenCount, json.usageMetadata?.candidatesTokenCount),
    }
  },

  async conversar(sistema, pergunta) {
    return (await this.gerar({ sistema, pergunta })).texto
  },

  async modelos() {
    const base = limpaBarra(cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
    const json = await buscar(`${base}/models?pageSize=200`, { 'x-goog-api-key': cfg.chave })
    return (json.models || [])
      .filter((m) => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => {
        const id = String(m.name).replace(/^models\//, '')
        return { id, label: m.displayName || id }
      })
  },
})

// ---------------------------------------------------------------- Simulado
// Não é IA: monta um plano coerente com o dossiê recebido. Existe para a tela
// e os testes exercitarem o fluxo inteiro sem rede — e a interface deixa isso
// explícito no próprio texto que devolve.
const simulado = () => ({
  nome: 'simulado',

  async gerar({ dossie }) {
    const d = dossie || {}
    const piores = (d.indicadores || [])
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
      texto: JSON.stringify({
        cliente_id: String(d.cliente_id ?? ''),
        setor: d.setor || 'financeiro',
        versao_prompt: d.versao_prompt || 'v1',
        diagnostico: `Cliente com health score ${d.health_score_atual} (${d.classificacao}) no setor ${d.setor}. Simulação — nenhuma IA foi consultada.`,
        causas_provaveis: nomes.length ? nomes.map((n) => `Indicador negativo: ${n}`) : ['Sem indicador negativo identificado no dossiê.'],
        acoes_recomendadas: acoes,
        indicadores_considerados: (d.indicadores || []).map((i) => i.nome),
        confianca_modelo: 0.5,
      }),
      modelo: 'simulado',
      tokensEntrada: null,
      tokensSaida: null,
    }
  },

  async conversar() { return 'OK' },
  async modelos() { return [{ id: 'simulado', label: 'Resposta simulada (sem IA)' }] },
})

export const TIPOS = ['anthropic', 'openai', 'gemini', 'simulado']

export const ROTULO_TIPO = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI e compatíveis',
  gemini: 'Google Gemini',
  simulado: 'Simulado (sem IA, para demonstrar o fluxo)',
}

// Modelo sugerido ao trocar de provedor na tela.
export const MODELO_PADRAO = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  simulado: 'simulado',
}

export function construir(cfg) {
  if (cfg.tipo === 'anthropic') return anthropic(cfg)
  if (cfg.tipo === 'openai') return openai(cfg)
  if (cfg.tipo === 'gemini') return gemini(cfg)
  if (cfg.tipo === 'simulado') return simulado(cfg)
  throw new Error(`Provedor de IA desconhecido: ${cfg.tipo}`)
}

// Provedor vindo do .env — usado quando não há nada cadastrado na tela.
export function provedorDoEnv() {
  const chave = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
  if (!chave) return null
  const tipo = process.env.AI_PROVIDER
    || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'gemini')
  return {
    tipo,
    modelo: process.env.AI_MODEL || MODELO_PADRAO[tipo],
    chave,
    baseUrl: process.env.AI_BASE_URL || null,
    maxTokens: Number(process.env.AI_MAX_TOKENS) || 8000,
    effort: process.env.AI_EFFORT || null,
    origem: 'env',
  }
}
