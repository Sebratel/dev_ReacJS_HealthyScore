// ─────────────────────────────────────────────────────────────────────────
// Cadastro de provedores de IA (tabela ai_providers).
//
// Regra que atravessa o arquivo inteiro: a chave em claro NUNCA sai daqui.
// Entra em `create`/`update`, é cifrada, e só volta a existir dentro de
// `resolveProvider()`, que monta o cliente. Tudo que a API devolve para a tela
// passa por `publicView()`.
// ─────────────────────────────────────────────────────────────────────────
import { query, withTransaction } from '../db.mjs'
import { encryptSecret, decryptSecret, keyHint } from '../crypto.mjs'
import { makeProvider, DEFAULT_ANTHROPIC_MODEL } from './provider.mjs'

const KINDS = ['anthropic', 'openai', 'gemini', 'mock']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// O que a tela pode ver. Sem api_key_enc, em nenhuma hipótese.
function publicView(row) {
  if (!row) return null
  return {
    id: row.id,
    nome: row.nome,
    kind: row.kind,
    modelo: row.modelo,
    temChave: !!row.api_key_enc,
    keyHint: row.key_hint,
    baseUrl: row.base_url,
    maxTokens: row.max_tokens,
    effort: row.effort,
    ativo: !!row.ativo,
    padrao: !!row.padrao,
    ultimoTeste: row.ultimo_teste_em
      ? { em: row.ultimo_teste_em, ok: !!row.ultimo_teste_ok, erro: row.ultimo_teste_erro, ms: row.ultimo_teste_ms }
      : null,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  }
}

export async function listProviders() {
  const rows = await query('select * from ai_providers order by padrao desc, nome asc')
  return rows.map(publicView)
}

function validate({ nome, kind, modelo, maxTokens, effort }) {
  if (!nome || !String(nome).trim()) throw new Error('Informe um nome para o provedor.')
  if (!KINDS.includes(kind)) throw new Error(`Tipo inválido. Esperado: ${KINDS.join(' | ')}.`)
  if (kind !== 'mock' && (!modelo || !String(modelo).trim())) throw new Error('Informe o modelo.')
  if (maxTokens != null && (!Number.isInteger(Number(maxTokens)) || Number(maxTokens) < 256)) {
    throw new Error('max_tokens deve ser um inteiro a partir de 256.')
  }
  if (effort && !EFFORTS.includes(effort)) throw new Error(`Esforço inválido. Esperado: ${EFFORTS.join(' | ')}.`)
}

export async function createProvider(input, criadoPor) {
  const kind = String(input.kind || 'anthropic').toLowerCase()
  const modelo = input.modelo || (kind === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : '')
  validate({ ...input, kind, modelo })

  const apiKey = input.apiKey ? String(input.apiKey).trim() : ''
  const enc = apiKey ? encryptSecret(apiKey) : null

  return withTransaction(async (conn) => {
    // Marcar como padrão exige tirar o padrão de quem era — o índice único
    // recusaria dois. Dentro da transação para não existir um instante sem
    // nenhum padrão visível.
    if (input.padrao) await conn.execute('update ai_providers set padrao = 0 where padrao = 1')
    const [res] = await conn.execute(
      `insert into ai_providers (nome, kind, modelo, api_key_enc, key_hint, base_url, max_tokens, effort, ativo, padrao, criado_por)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(input.nome).trim(), kind, modelo, enc, apiKey ? keyHint(apiKey) : null,
        input.baseUrl || null, Number(input.maxTokens) || 16000, input.effort || null,
        input.ativo === false ? 0 : 1, input.padrao ? 1 : 0, criadoPor,
      ],
    )
    const [rows] = await conn.execute('select * from ai_providers where id = ?', [res.insertId])
    return publicView(rows[0])
  })
}

export async function updateProvider(id, input, _atualizadoPor) {
  const [cur] = await query('select * from ai_providers where id = ?', [id])
  if (!cur) throw new Error('Provedor não encontrado.')

  const kind = String(input.kind ?? cur.kind).toLowerCase()
  const modelo = input.modelo ?? cur.modelo
  validate({ nome: input.nome ?? cur.nome, kind, modelo, maxTokens: input.maxTokens, effort: input.effort })

  // Chave: string vazia não apaga (é o campo em branco da tela, que significa
  // "não mexi"). Para remover, o cliente manda apiKey: null explicitamente.
  let enc = cur.api_key_enc
  let hint = cur.key_hint
  if (input.apiKey === null) { enc = null; hint = null }
  else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    const k = input.apiKey.trim()
    enc = encryptSecret(k); hint = keyHint(k)
  }

  return withTransaction(async (conn) => {
    if (input.padrao) await conn.execute('update ai_providers set padrao = 0 where padrao = 1 and id <> ?', [id])
    await conn.execute(
      `update ai_providers set nome = ?, kind = ?, modelo = ?, api_key_enc = ?, key_hint = ?,
              base_url = ?, max_tokens = ?, effort = ?, ativo = ?, padrao = ?
       where id = ?`,
      [
        String(input.nome ?? cur.nome).trim(), kind, modelo, enc, hint,
        input.baseUrl !== undefined ? (input.baseUrl || null) : cur.base_url,
        Number(input.maxTokens ?? cur.max_tokens) || 16000,
        input.effort !== undefined ? (input.effort || null) : cur.effort,
        input.ativo !== undefined ? (input.ativo ? 1 : 0) : cur.ativo,
        input.padrao !== undefined ? (input.padrao ? 1 : 0) : cur.padrao,
        id,
      ],
    )
    const [rows] = await conn.execute('select * from ai_providers where id = ?', [id])
    return publicView(rows[0])
  })
}

export async function deleteProvider(id) {
  const rows = await query('delete from ai_providers where id = ?', [id])
  return { removed: rows.affectedRows > 0 }
}

// Monta o provedor executável. Este é o ÚNICO ponto onde a chave é decifrada.
// Sem cadastro ativo, cai no mock — o módulo continua demonstrável e a tela
// avisa que nenhuma IA foi consultada.
export async function resolveProvider(providerId = null) {
  let row = null
  if (providerId) {
    const [r] = await query('select * from ai_providers where id = ? and ativo = 1', [providerId])
    row = r || null
    if (!row) throw new Error('Provedor informado não existe ou está inativo.')
  } else {
    const [r] = await query('select * from ai_providers where ativo = 1 and padrao = 1')
    row = r || null
  }
  if (!row) {
    return { provider: makeProvider({ kind: 'mock' }), row: null, simulado: true }
  }
  const apiKey = row.api_key_enc ? decryptSecret(row.api_key_enc) : null
  const provider = makeProvider({
    kind: row.kind, modelo: row.modelo, apiKey,
    baseUrl: row.base_url, maxTokens: row.max_tokens, effort: row.effort,
  })
  return { provider, row, simulado: row.kind === 'mock' }
}

// Testa o cadastro e grava o resultado — a tela mostra "última verificação".
export async function testProvider(id) {
  const { provider } = await resolveProvider(id)
  const r = await provider.testConnection()
  await query(
    'update ai_providers set ultimo_teste_em = now(), ultimo_teste_ok = ?, ultimo_teste_erro = ?, ultimo_teste_ms = ? where id = ?',
    [r.ok ? 1 : 0, r.erro || null, r.ms ?? null, id],
  )
  return r
}
