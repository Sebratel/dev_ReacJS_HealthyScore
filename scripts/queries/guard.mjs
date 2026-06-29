// ─────────────────────────────────────────────────────────────────────────
// Guard de segurança para o SQL editável. Como as queries rodam contra o banco
// de produção no ETL, só permitimos statements de LEITURA. Usado em dois
// pontos (defesa em profundidade):
//   1. no backend, ANTES de gravar um override (rejeita salvar SQL perigoso);
//   2. no ETL, ANTES de executar (um override corrompido jamais roda).
//
// Não substitui um usuário de banco somente-leitura (recomendado no README),
// mas barra os erros e abusos óbvios.
// ─────────────────────────────────────────────────────────────────────────

// Palavras que indicam escrita / DDL / efeitos colaterais.
const FORBIDDEN = [
  'insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create',
  'grant', 'revoke', 'merge', 'copy', 'call', 'vacuum', 'comment',
  'reindex', 'cluster', 'lock', 'listen', 'notify', 'execute', 'into',
]

// Remove comentários (-- linha e /* bloco */) e literais de string para que a
// análise de palavras-chave não dispare por texto dentro de aspas/comentários.
function stripNoise(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')        // comentários de linha
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // comentários de bloco
    .replace(/'(?:''|[^'])*'/g, "''")  // literais de string
    .replace(/"(?:[^"])*"/g, '""')     // identificadores entre aspas
}

// Retorna { ok: true } ou { ok: false, reason }.
export function checkReadOnly(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    return { ok: false, reason: 'SQL vazio.' }
  }
  const clean = stripNoise(sql).toLowerCase()

  // Precisa começar com select ou with (CTE de leitura).
  const firstWord = clean.trim().split(/[\s(]+/)[0]
  if (firstWord !== 'select' && firstWord !== 'with') {
    return { ok: false, reason: 'O SQL deve começar com SELECT ou WITH (somente leitura).' }
  }

  // Sem múltiplos statements (um `;` que não seja o final).
  const withoutTrailing = clean.replace(/;\s*$/, '')
  if (withoutTrailing.includes(';')) {
    return { ok: false, reason: 'Múltiplos statements não são permitidos (";" no meio do SQL).' }
  }

  // Nenhuma palavra-chave de escrita / DDL (comparação por palavra inteira).
  for (const kw of FORBIDDEN) {
    const re = new RegExp(`\\b${kw}\\b`, 'i')
    if (re.test(clean)) {
      return { ok: false, reason: `Palavra não permitida no SQL: "${kw}". Apenas leitura (SELECT/WITH).` }
    }
  }

  return { ok: true }
}

export function isReadOnly(sql) {
  return checkReadOnly(sql).ok
}

// Lança erro se o SQL não for somente-leitura.
export function assertReadOnly(sql) {
  const r = checkReadOnly(sql)
  if (!r.ok) throw new Error(r.reason)
}
