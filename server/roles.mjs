// ─────────────────────────────────────────────────────────────────────────
// Papéis de acesso (RBAC) do ChurnIQ. Três níveis hierárquicos:
//   viewer (0)  → todo mundo @domínio: só lê.
//   power_user (1) → + pesos dos indicadores e SQL das queries DOS SEUS SETORES.
//   admin (2)  → + limiares do Health Score e gestão de usuários (faz tudo).
//
// ESCOPO POR SETOR: um power_user vale por setor (engine). Ex.: power user do
// "Financeiro" vê todas as telas, mas só edita os indicadores e as queries da
// engine financeira. Escopo `'*'` = todos os setores (comportamento antigo).
//
// Papel efetivo = MAIOR entre:
//   - bootstrap por env (ADMIN_EMAILS / POWER_USER_EMAILS / QUERY_EDITOR_EMAILS[legado→power_user])
//   - papel gravado em data/roles.json (editável pela tela de Usuários e Acessos)
// ADMIN_EMAILS é a "semente": garante que sempre haja um admin pra abrir a tela,
// mesmo com o arquivo vazio/corrompido. Envs NÃO podem ser rebaixadas pela tela
// (nem no papel, nem no escopo: quem vem da env tem escopo total).
//
// Formato do data/roles.json (as duas formas convivem):
//   "fulano@x": "power_user"                                   ← legado: escopo total
//   "ciclano@x": { "role": "power_user", "scopes": ["financial"] }
//   "beltrano@x": { "role": "admin", "scopes": "*" }
//
//   ROLES_PATH  caminho do JSON (default data/roles.json; no servidor, o volume).
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROLES_PATH = process.env.ROLES_PATH
  ? resolve(process.env.ROLES_PATH)
  : resolve(__dirname, '../data/roles.json')

export const ROLE_RANK = { viewer: 0, power_user: 1, admin: 2 }
export const ROLES = ['viewer', 'power_user', 'admin']
export function rankOf(role) { return ROLE_RANK[role] ?? 0 }
export function atLeast(role, min) { return rankOf(role) >= rankOf(min) }

// ─── Setores (engines) ─────────────────────────────────────────
// Mesmas chaves das engines no front (src/features/settings/indicatorCatalog.ts)
// e do POST /api/engine/:key. É o que vai no campo `scopes` do roles.json.
export const ALL_SECTORS = '*'
export const SECTORS = [
  'financial', 'commercial', 'connection', 'network', 'field', 'installation', 'relationship',
]
export const SECTOR_LABELS = {
  financial: 'Financeiro',
  commercial: 'Comercial',
  connection: 'Conexão',
  network: 'Rede',
  field: 'Manutenção',
  installation: 'Instalação',
  relationship: 'Relacionamento',
}

// Grupo de query (scripts/queries/registry.mjs usa rótulos em português) →
// setor. Os grupos que NÃO aparecem aqui são transversais ('base', 'mensal',
// 'cancelados', 'retiradas'): alimentam a plataforma inteira, então só quem tem
// escopo total ('*') mexe neles — mesma regra dos limiares do Health Score.
const SECTOR_BY_QUERY_GROUP = {
  financeiro: 'financial',
  comercial: 'commercial',
  conexao: 'connection',
  rede: 'network',
  field: 'field',
  instalacao: 'installation',
  relacionamento: 'relationship',
}

const csv = (v) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const ENV_ADMINS = new Set(csv(process.env.ADMIN_EMAILS))
// POWER_USER_EMAILS + QUERY_EDITOR_EMAILS (legado) contam como power_user de bootstrap.
const ENV_POWER = new Set([...csv(process.env.POWER_USER_EMAILS), ...csv(process.env.QUERY_EDITOR_EMAILS)])

// Papel vindo APENAS das envs (não pode ser removido pela tela).
function envRole(email) {
  const e = String(email || '').toLowerCase()
  if (ENV_ADMINS.has(e)) return 'admin'
  if (ENV_POWER.has(e)) return 'power_user'
  return 'viewer'
}

// Normaliza o campo `scopes`: '*' (ou ausente/inválido) → todos os setores;
// lista → só as chaves conhecidas, sem repetição e na ordem canônica.
export function normalizeScopes(scopes) {
  if (scopes === ALL_SECTORS || scopes == null) return ALL_SECTORS
  if (!Array.isArray(scopes)) return ALL_SECTORS
  const wanted = new Set(scopes.map((s) => String(s).trim()).filter(Boolean))
  const list = SECTORS.filter((s) => wanted.has(s))
  return list.length === SECTORS.length ? ALL_SECTORS : list
}

// Entrada do arquivo (string legada ou objeto) → { role, scopes } ou null.
function normalizeEntry(value) {
  if (typeof value === 'string') {
    return ROLE_RANK[value] != null ? { role: value, scopes: ALL_SECTORS } : null
  }
  if (value && typeof value === 'object' && ROLE_RANK[value.role] != null) {
    // admin manda em tudo: escopo é sempre total, venha o que vier no arquivo.
    return { role: value.role, scopes: value.role === 'admin' ? ALL_SECTORS : normalizeScopes(value.scopes) }
  }
  return null
}

// Lê o arquivo de papéis. Tolerante: ausente/inválido → {}.
export function readRoles() {
  try {
    if (!existsSync(ROLES_PATH)) return {}
    const raw = readFileSync(ROLES_PATH, 'utf8').trim()
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch (e) {
    console.warn(`[roles] não foi possível ler ${ROLES_PATH}: ${e.message} — usando só as envs.`)
    return {}
  }
}

function writeAll(all) {
  mkdirSync(dirname(ROLES_PATH), { recursive: true })
  writeFileSync(ROLES_PATH, JSON.stringify(all, null, 2) + '\n', 'utf8')
}

// Acesso EFETIVO de um e-mail: { role, scopes }. A env vence quando dá papel
// igual ou maior (bootstrap não é rebaixável — e vem sempre com escopo total).
export function resolveAccess(email) {
  const e = String(email || '').toLowerCase()
  const fromEnv = envRole(e)
  const fromFile = normalizeEntry(readRoles()[e]) || { role: 'viewer', scopes: ALL_SECTORS }
  if (rankOf(fromEnv) >= rankOf(fromFile.role)) return { role: fromEnv, scopes: ALL_SECTORS }
  return { role: fromFile.role, scopes: fromFile.role === 'admin' ? ALL_SECTORS : fromFile.scopes }
}

// Lista consolidada { email, role, scopes, source } — env (fixo) e arquivo (editável).
export function listRoles() {
  const file = readRoles()
  const out = new Map()
  for (const e of ENV_ADMINS) out.set(e, { email: e, role: 'admin', scopes: ALL_SECTORS, source: 'env' })
  for (const e of ENV_POWER) if (!out.has(e)) out.set(e, { email: e, role: 'power_user', scopes: ALL_SECTORS, source: 'env' })
  for (const [e, value] of Object.entries(file)) {
    const entry = normalizeEntry(value)
    if (!entry) continue
    const eff = resolveAccess(e)
    // Se a env já dá papel >=, marca como env (não editável); senão, arquivo.
    if (!out.has(e) || rankOf(eff.role) > rankOf(out.get(e).role)) {
      const fromEnv = rankOf(envRole(e)) >= rankOf(entry.role)
      out.set(e, { email: e, role: eff.role, scopes: eff.scopes, source: fromEnv ? 'env' : 'file' })
    }
  }
  return [...out.values()].sort((a, b) => rankOf(b.role) - rankOf(a.role) || a.email.localeCompare(b.email))
}

// Define papel + escopo de um e-mail no arquivo. 'viewer' remove a entrada.
// Não mexe nas envs (bootstrap permanece). Retorna o acesso efetivo.
export function setRole(email, role, scopes = ALL_SECTORS) {
  const e = String(email || '').trim().toLowerCase()
  if (!e || !e.includes('@')) throw new Error('E-mail inválido.')
  if (!ROLES.includes(role)) throw new Error(`Papel inválido: ${role}.`)
  const all = readRoles()
  if (role === 'viewer') {
    delete all[e]
  } else if (role === 'admin') {
    all[e] = { role: 'admin', scopes: ALL_SECTORS }
  } else {
    // Power user sem setor nenhum não editaria nada — seria o mesmo que viewer,
    // mas com aparência de acesso. Melhor recusar do que gravar um papel vazio.
    if (Array.isArray(scopes) && scopes.length && !scopes.some((s) => SECTORS.includes(String(s)))) {
      throw new Error('Setor inválido. Use as chaves: ' + SECTORS.join(', ') + '.')
    }
    if (Array.isArray(scopes) && scopes.length === 0) {
      throw new Error('Selecione ao menos um setor para o power user.')
    }
    all[e] = { role: 'power_user', scopes: normalizeScopes(scopes) }
  }
  writeAll(all)
  return resolveAccess(e)
}

export function deleteRole(email) {
  const e = String(email || '').trim().toLowerCase()
  const all = readRoles()
  if (!(e in all)) return false
  delete all[e]
  writeAll(all)
  return true
}

// ─── Checagens de escopo ───────────────────────────────────────
export function hasAllSectors(scopes) {
  return scopes === ALL_SECTORS
}

// Pode editar os indicadores/pesos deste setor?
export function canEditSector(scopes, sector) {
  if (hasAllSectors(scopes)) return true
  return Array.isArray(scopes) && scopes.includes(sector)
}

// Pode editar o SQL das queries deste grupo do catálogo? Grupo transversal
// (base/mensal/cancelados/retiradas) exige escopo total.
export function canEditQueryGroup(scopes, group) {
  if (hasAllSectors(scopes)) return true
  const sector = SECTOR_BY_QUERY_GROUP[String(group)]
  return sector ? canEditSector(scopes, sector) : false
}

// Grupos do catálogo de queries que este escopo pode editar (para a UI).
export function editableQueryGroups(scopes) {
  if (hasAllSectors(scopes)) return ALL_SECTORS
  return Object.entries(SECTOR_BY_QUERY_GROUP)
    .filter(([, sector]) => canEditSector(scopes, sector))
    .map(([group]) => group)
}
