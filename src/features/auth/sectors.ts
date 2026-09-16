// ─────────────────────────────────────────────────────────────────────────
// Setores (engines) do ChurnIQ — fonte única das chaves no front.
//
// O mesmo conceito aparece em três lugares e tem de ser UMA coisa só: a chave
// da engine (`POST /api/engine/:key`), o grupo de nomenclaturas em
// /configuracoes e o ESCOPO de edição de um power user. As chaves aqui são as
// mesmas de SECTORS em server/roles.mjs.
//
// Escopo = '*' (todos os setores) ou a lista dos que o usuário edita. Todo
// mundo VÊ todas as telas; o escopo só decide onde ele pode MEXER.
// ─────────────────────────────────────────────────────────────────────────

export type SectorKey =
  | 'financial' | 'commercial' | 'connection' | 'network'
  | 'field' | 'installation' | 'relationship'

export const SECTOR_ORDER: SectorKey[] = [
  'financial', 'commercial', 'connection', 'network', 'field', 'installation', 'relationship',
]

export const SECTOR_LABELS: Record<SectorKey, string> = {
  financial: 'Financeiro',
  commercial: 'Comercial',
  connection: 'Conexão',
  network: 'Rede',
  field: 'Manutenção',
  installation: 'Instalação',
  relationship: 'Relacionamento',
}

// '*' = todos os setores. Null = /api/me ainda não respondeu.
export type Scopes = '*' | SectorKey[]

export function isAllSectors(scopes: Scopes | null): boolean {
  return scopes === '*'
}

// Este escopo edita este setor? Sem escopo conhecido ainda → não (a UI começa
// fechada e abre quando o /api/me responde; nunca o contrário).
export function scopeCanEdit(scopes: Scopes | null, sector: SectorKey | string): boolean {
  if (scopes === '*') return true
  if (!Array.isArray(scopes)) return false
  return scopes.includes(sector as SectorKey)
}

// Aceita o que vier do servidor e devolve um escopo válido (ou null).
export function parseScopes(raw: unknown): Scopes | null {
  if (raw === '*') return '*'
  if (!Array.isArray(raw)) return null
  const list = SECTOR_ORDER.filter((s) => raw.includes(s))
  return list.length === SECTOR_ORDER.length ? '*' : list
}

// Rótulo curto para a tela de acessos: "Todos os setores" ou "Financeiro, Rede".
export function describeScopes(scopes: Scopes | null): string {
  if (scopes === '*') return 'Todos os setores'
  if (!Array.isArray(scopes) || scopes.length === 0) return '—'
  return SECTOR_ORDER.filter((s) => scopes.includes(s)).map((s) => SECTOR_LABELS[s]).join(', ')
}
