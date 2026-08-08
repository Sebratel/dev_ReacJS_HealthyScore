// ─────────────────────────────────────────────────────────────────────────
// Papéis de acesso (RBAC) do ChurnIQ. Três níveis hierárquicos:
//   viewer (0)  → todo mundo @domínio: só lê.
//   power_user (1) → + tela de SQL/Queries e limiares do Health Score.
//   admin (2)  → + editar pesos dos indicadores e gerir usuários (faz tudo).
//
// Papel efetivo = MAIOR entre:
//   - bootstrap por env (ADMIN_EMAILS / POWER_USER_EMAILS / QUERY_EDITOR_EMAILS[legado→power_user])
//   - papel gravado em data/roles.json (editável pela tela de Usuários e Acessos)
// ADMIN_EMAILS é a "semente": garante que sempre haja um admin pra abrir a tela,
// mesmo com o arquivo vazio/corrompido. Envs NÃO podem ser rebaixadas pela tela.
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

// Papel EFETIVO de um e-mail = maior entre env e arquivo.
export function resolveRole(email) {
  const e = String(email || '').toLowerCase()
  const fromEnv = envRole(e)
  const fromFile = readRoles()[e]
  const fileRole = ROLE_RANK[fromFile] != null ? fromFile : 'viewer'
  return rankOf(fromEnv) >= rankOf(fileRole) ? fromEnv : fileRole
}

// Lista consolidada { email, role, source } — env (fixo) e arquivo (editável).
export function listRoles() {
  const file = readRoles()
  const out = new Map()
  for (const e of ENV_ADMINS) out.set(e, { email: e, role: 'admin', source: 'env' })
  for (const e of ENV_POWER) if (!out.has(e)) out.set(e, { email: e, role: 'power_user', source: 'env' })
  for (const [e, role] of Object.entries(file)) {
    if (ROLE_RANK[role] == null) continue
    const eff = resolveRole(e)
    // Se a env já dá papel >=, marca como env (não editável); senão, arquivo.
    if (!out.has(e) || rankOf(eff) > rankOf(out.get(e).role)) {
      out.set(e, { email: e, role: eff, source: rankOf(envRole(e)) >= rankOf(role) ? 'env' : 'file' })
    }
  }
  return [...out.values()].sort((a, b) => rankOf(b.role) - rankOf(a.role) || a.email.localeCompare(b.email))
}

// Define o papel (admin/power_user) de um e-mail no arquivo. 'viewer' remove a
// entrada. Não mexe nas envs (bootstrap permanece). Retorna o papel efetivo.
export function setRole(email, role) {
  const e = String(email || '').trim().toLowerCase()
  if (!e || !e.includes('@')) throw new Error('E-mail inválido.')
  if (!ROLES.includes(role)) throw new Error(`Papel inválido: ${role}.`)
  const all = readRoles()
  if (role === 'viewer') delete all[e]
  else all[e] = role
  writeAll(all)
  return resolveRole(e)
}

export function deleteRole(email) {
  const e = String(email || '').trim().toLowerCase()
  const all = readRoles()
  if (!(e in all)) return false
  delete all[e]
  writeAll(all)
  return true
}
