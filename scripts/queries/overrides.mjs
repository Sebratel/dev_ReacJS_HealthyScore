// ─────────────────────────────────────────────────────────────────────────
// Persistência dos overrides de query (edições feitas pela tela). É um simples
// arquivo JSON no servidor, compartilhado entre o backend (que grava) e o ETL
// (que lê). Caminho configurável por QUERY_OVERRIDES_PATH.
//
// Formato:  { [id]: { sql: string, updatedAt: ISO, updatedBy: email } }
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getQueryDef } from './registry.mjs'
import { checkReadOnly } from './guard.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Default: <repo>/data/query-overrides.json. No container/servidor, aponte
// QUERY_OVERRIDES_PATH para o volume compartilhado com o ETL.
export const OVERRIDES_PATH = process.env.QUERY_OVERRIDES_PATH
  ? resolve(process.env.QUERY_OVERRIDES_PATH)
  : resolve(__dirname, '../../data/query-overrides.json')

// Lê o arquivo de overrides. Tolerante: arquivo ausente/ inválido → {}.
export function readOverrides() {
  try {
    if (!existsSync(OVERRIDES_PATH)) return {}
    const raw = readFileSync(OVERRIDES_PATH, 'utf8').trim()
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch (e) {
    console.warn(`[overrides] não foi possível ler ${OVERRIDES_PATH}: ${e.message} — usando defaults.`)
    return {}
  }
}

function writeAll(all) {
  mkdirSync(dirname(OVERRIDES_PATH), { recursive: true })
  writeFileSync(OVERRIDES_PATH, JSON.stringify(all, null, 2) + '\n', 'utf8')
}

// Grava (ou substitui) o override de uma query. Valida que o id existe e que o
// SQL é somente-leitura. Retorna a entrada gravada.
export function writeOverride(id, sql, updatedBy = 'desconhecido') {
  if (!getQueryDef(id)) throw new Error(`Query desconhecida: ${id}`)
  const check = checkReadOnly(sql)
  if (!check.ok) throw new Error(check.reason)
  const all = readOverrides()
  const entry = { sql, updatedAt: new Date().toISOString(), updatedBy }
  all[id] = entry
  writeAll(all)
  return entry
}

// Remove o override de uma query (volta ao default). Retorna true se removeu.
export function deleteOverride(id) {
  const all = readOverrides()
  if (!(id in all)) return false
  delete all[id]
  writeAll(all)
  return true
}
