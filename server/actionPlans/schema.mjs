// ─────────────────────────────────────────────────────────────────────────
// Contrato de saída da IA — o mesmo JSON Schema em dois usos:
//
//   1. forçado NA ORIGEM, via output_config.format da Messages API;
//   2. revalidado AQUI antes de gravar.
//
// Parece redundante e não é: o schema na origem cobre a forma, mas não cobre
// prompt trocado, modelo trocado, provedor compatível que ignora o campo, nem
// resposta vinda de cache antigo. Uma recomendação que não passa aqui é
// gravada com status 'falha_schema' e NUNCA aparece para o gestor como válida
// — o modo de falha perigoso deste módulo é um plano malformado que parece bom.
// ─────────────────────────────────────────────────────────────────────────

export const PRIORIDADES = ['alta', 'media', 'baixa']
export const RESPONSAVEIS = ['cobranca', 'atendimento', 'comercial', 'juridico']

// JSON Schema enviado em output_config.format. `additionalProperties: false` e
// `required` completo são exigência do modo estrito.
export const ACTION_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    cliente_id: { type: 'string' },
    setor: { type: 'string' },
    versao_prompt: { type: 'string' },
    diagnostico: { type: 'string' },
    causas_provaveis: { type: 'array', items: { type: 'string' } },
    acoes_recomendadas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          descricao: { type: 'string' },
          prioridade: { type: 'string', enum: PRIORIDADES },
          prazo_sugerido_dias: { type: 'integer' },
          responsavel_sugerido: { type: 'string', enum: RESPONSAVEIS },
          impacto_esperado: { type: 'string' },
        },
        required: ['titulo', 'descricao', 'prioridade', 'prazo_sugerido_dias', 'responsavel_sugerido', 'impacto_esperado'],
        additionalProperties: false,
      },
    },
    indicadores_considerados: { type: 'array', items: { type: 'string' } },
    confianca_modelo: { type: 'number' },
  },
  required: [
    'cliente_id', 'setor', 'versao_prompt', 'diagnostico', 'causas_provaveis',
    'acoes_recomendadas', 'indicadores_considerados', 'confianca_modelo',
  ],
  additionalProperties: false,
}

// ─── O contrato em texto, para viajar DENTRO do prompt ─────────
//
// Por que isto existe: o schema forçado na origem só funciona onde o provedor
// suporta JSON Schema — hoje só a Anthropic. Em "modo JSON" (OpenAI, Gemini) o
// provedor garante que a saída é JSON válido, e NADA sobre quais campos ela
// tem. O modelo então inventa nomes razoáveis e o plano inteiro é descartado.
//
// Foi exatamente o que aconteceu na primeira rodada real com o Gemini: ele
// devolveu `acao` no lugar de `titulo`, `por_que` no lugar de `descricao`, e
// `responsavel_sugerido: "financeiro"` — que nem existe no nosso enum. O plano
// era bom; o formato é que ninguém tinha contado a ele.
//
// Gerado a partir das MESMAS constantes que validam, para não haver como o
// texto do prompt divergir da regra que reprova.
const TIPO_LEGIVEL = {
  string: 'texto',
  integer: 'número inteiro',
  number: 'número',
}

function descreveCampo(nome, def, obrigatorio) {
  if (def.type === 'array') {
    const it = def.items || {}
    // Lista de objetos entra aqui MESMO tendo bloco próprio mais abaixo. Sem
    // esta linha, o campo sumia da lista da raiz e um modelo atento concluía
    // que o objeto tinha só os outros campos — a ambiguidade que já custou
    // uma rodada inteira.
    if (it.type === 'object') {
      return `- "${nome}": lista de objetos${obrigatorio ? '' : ' (opcional)'} — o formato de cada item está logo abaixo`
    }
    return `- "${nome}": lista de ${TIPO_LEGIVEL[it.type] ?? it.type}s${obrigatorio ? '' : ' (opcional)'}`
  }
  const enumTxt = def.enum ? ` — exatamente um de: ${def.enum.map((v) => `"${v}"`).join(' | ')}` : ''
  return `- "${nome}": ${TIPO_LEGIVEL[def.type] ?? def.type}${enumTxt}${obrigatorio ? '' : ' (opcional)'}`
}

export function contratoEmTexto() {
  const s = ACTION_PLAN_JSON_SCHEMA
  const req = new Set(s.required)
  const raiz = Object.entries(s.properties)
    .map(([k, v]) => descreveCampo(k, v, req.has(k)))
    .filter(Boolean)

  const acao = s.properties.acoes_recomendadas.items
  const reqAcao = new Set(acao.required)
  const campos = Object.entries(acao.properties)
    .map(([k, v]) => `  ${descreveCampo(k, v, reqAcao.has(k)).slice(2)}`)

  return [
    'FORMATO OBRIGATÓRIO DA RESPOSTA',
    '',
    'Responda com UM objeto JSON e nada mais — sem markdown, sem cercas de',
    'código, sem texto antes ou depois. Use EXATAMENTE estes nomes de campo, em',
    'português e sem acento, e não acrescente nenhum campo além dos listados.',
    '',
    ...raiz,
    '',
    'Cada item de "acoes_recomendadas" é um objeto com EXATAMENTE estes campos:',
    ...campos,
    '',
    'Atenção aos dois campos de lista fechada: "prioridade" e',
    '"responsavel_sugerido" só aceitam os valores acima. Se a área que você',
    'considera ideal não estiver na lista, escolha a mais próxima entre as',
    'disponíveis e explique o encaminhamento dentro de "descricao".',
    '',
    'Exemplo da forma esperada (conteúdo meramente ilustrativo):',
    JSON.stringify({
      cliente_id: '123456',
      setor: 'financeiro',
      versao_prompt: 'v1',
      diagnostico: 'Resumo do quadro do cliente em uma ou duas frases.',
      causas_provaveis: ['Causa provável em uma frase.'],
      acoes_recomendadas: [{
        titulo: 'Título curto da ação',
        descricao: 'O que fazer, quando e por quê, de forma específica.',
        prioridade: 'alta',
        prazo_sugerido_dias: 3,
        responsavel_sugerido: 'cobranca',
        impacto_esperado: 'O que se espera que mude.',
      }],
      indicadores_considerados: ['faturas_atrasadas'],
      confianca_modelo: 0.7,
    }, null, 2),
  ].join('\n')
}

const isStr = (v) => typeof v === 'string' && v.trim() !== ''
const isStrArray = (v) => Array.isArray(v) && v.every((x) => isStr(x))

// Valida e devolve { ok, errors[], value }. Validador escrito à mão em vez de
// ajv: são oito campos, e a mensagem em português diz exatamente qual saiu
// errado — o que importa quando alguém edita o prompt e a geração começa a
// falhar.
export function validateRecommendation(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['A resposta não é um objeto JSON.'], value: null }
  }

  for (const f of ['cliente_id', 'setor', 'versao_prompt', 'diagnostico']) {
    if (!isStr(raw[f])) errors.push(`Campo "${f}" ausente ou vazio (esperado texto).`)
  }
  if (!isStrArray(raw.causas_provaveis)) errors.push('Campo "causas_provaveis" deve ser uma lista de textos.')
  if (!isStrArray(raw.indicadores_considerados)) errors.push('Campo "indicadores_considerados" deve ser uma lista de textos.')

  const conf = raw.confianca_modelo
  if (typeof conf !== 'number' || !Number.isFinite(conf)) {
    errors.push('Campo "confianca_modelo" deve ser um número.')
  } else if (conf < 0 || conf > 1) {
    errors.push(`Campo "confianca_modelo" fora da faixa 0–1 (recebido ${conf}).`)
  }

  if (!Array.isArray(raw.acoes_recomendadas) || raw.acoes_recomendadas.length === 0) {
    // Um plano sem ação nenhuma passaria num validador estrutural e seria
    // inútil na tela — então não passa aqui.
    errors.push('Campo "acoes_recomendadas" deve ser uma lista com pelo menos uma ação.')
  } else {
    raw.acoes_recomendadas.forEach((a, i) => {
      const at = `acoes_recomendadas[${i}]`
      if (!a || typeof a !== 'object' || Array.isArray(a)) { errors.push(`${at} não é um objeto.`); return }
      for (const f of ['titulo', 'descricao', 'impacto_esperado']) {
        if (!isStr(a[f])) errors.push(`${at}.${f} ausente ou vazio.`)
      }
      if (!PRIORIDADES.includes(a.prioridade)) {
        errors.push(`${at}.prioridade inválida (recebido ${JSON.stringify(a.prioridade)}; esperado ${PRIORIDADES.join(' | ')}).`)
      }
      if (!RESPONSAVEIS.includes(a.responsavel_sugerido)) {
        errors.push(`${at}.responsavel_sugerido inválido (recebido ${JSON.stringify(a.responsavel_sugerido)}; esperado ${RESPONSAVEIS.join(' | ')}).`)
      }
      const p = a.prazo_sugerido_dias
      if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 365) {
        errors.push(`${at}.prazo_sugerido_dias deve ser um inteiro entre 0 e 365 (recebido ${JSON.stringify(p)}).`)
      }
    })
  }

  return { ok: errors.length === 0, errors, value: errors.length ? null : raw }
}

// O mesmo formato das ações, para o que o GESTOR editou antes de aprovar. O
// gestor pode reescrever tudo menos a forma — senão a tarefa criada não tem
// prazo nem responsável.
export function validateEditedActions(acoes) {
  if (!Array.isArray(acoes) || acoes.length === 0) {
    return { ok: false, errors: ['Envie pelo menos uma ação para aprovar.'], value: null }
  }
  const fake = {
    cliente_id: 'x', setor: 'x', versao_prompt: 'x', diagnostico: 'x',
    causas_provaveis: [], indicadores_considerados: [], confianca_modelo: 0,
    acoes_recomendadas: acoes,
  }
  const r = validateRecommendation(fake)
  const errors = r.errors.filter((e) => e.startsWith('acoes_recomendadas'))
  return { ok: errors.length === 0, errors, value: errors.length ? null : acoes }
}
