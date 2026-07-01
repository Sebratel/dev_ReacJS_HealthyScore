// Espelho client-side do guard do servidor (scripts/queries/guard.mjs) — dá
// feedback imediato ao editar, mas a validação que VALE é a do backend.
const FORBIDDEN = [
  'insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create',
  'grant', 'revoke', 'merge', 'copy', 'call', 'vacuum', 'comment',
  'reindex', 'cluster', 'lock', 'listen', 'notify', 'execute', 'into',
]

function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:[^"])*"/g, '""')
}

export function checkReadOnly(sql: string): { ok: boolean; reason?: string } {
  if (!sql || !sql.trim()) return { ok: false, reason: 'SQL vazio.' }
  const clean = stripNoise(sql).toLowerCase()
  const firstWord = clean.trim().split(/[\s(]+/)[0]
  if (firstWord !== 'select' && firstWord !== 'with') {
    return { ok: false, reason: 'O SQL deve começar com SELECT ou WITH (somente leitura).' }
  }
  if (clean.replace(/;\s*$/, '').includes(';')) {
    return { ok: false, reason: 'Múltiplos statements não são permitidos (";" no meio do SQL).' }
  }
  for (const kw of FORBIDDEN) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(clean)) {
      return { ok: false, reason: `Palavra não permitida: "${kw}". Apenas leitura (SELECT/WITH).` }
    }
  }
  return { ok: true }
}
