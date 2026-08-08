// ─────────────────────────────────────────────────────────────────────────
// Config OFICIAL (pesos dos indicadores + limiares do Health Score), única e
// no servidor — a fonte de verdade do scoring. Substitui o "cada usuário tem a
// sua no localStorage": todos leem a mesma, e só admin (pesos) / power_user
// (limiares) gravam. Persistida em JSON no volume, ao lado dos overrides.
//
//   { configs: { financial, commercial, ... }, thresholds: {...},
//     updatedAt, updatedBy: { configs, thresholds } }
//
// Migração suave: enquanto o arquivo não existir, getOfficialConfig() devolve
// null e o backend cai na config que o cliente manda (comportamento atual) —
// nada quebra no deploy. Quando um admin grava, passa a ser autoritativa.
//
//   OFFICIAL_CONFIG_PATH  caminho do JSON (default data/official-config.json).
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const OFFICIAL_CONFIG_PATH = process.env.OFFICIAL_CONFIG_PATH
  ? resolve(process.env.OFFICIAL_CONFIG_PATH)
  : resolve(__dirname, '../data/official-config.json')

// Objeto oficial completo, ou null se ainda não gravado / inválido.
export function getOfficialConfig() {
  try {
    if (!existsSync(OFFICIAL_CONFIG_PATH)) return null
    const raw = readFileSync(OFFICIAL_CONFIG_PATH, 'utf8').trim()
    if (!raw) return null
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : null
  } catch (e) {
    console.warn(`[official-config] não foi possível ler ${OFFICIAL_CONFIG_PATH}: ${e.message}`)
    return null
  }
}

function writeAll(obj) {
  mkdirSync(dirname(OFFICIAL_CONFIG_PATH), { recursive: true })
  writeFileSync(OFFICIAL_CONFIG_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

// Grava os PESOS (configs por engine). Preserva thresholds já existentes.
export function setOfficialConfigs(configs, updatedBy = 'desconhecido') {
  if (!configs || typeof configs !== 'object') throw new Error('Campo "configs" (objeto) é obrigatório.')
  const cur = getOfficialConfig() || {}
  const next = {
    ...cur,
    configs,
    updatedAt: new Date().toISOString(),
    updatedBy: { ...(cur.updatedBy || {}), configs: updatedBy },
  }
  writeAll(next)
  return next
}

// Grava os LIMIARES. Preserva os pesos já existentes.
export function setOfficialThresholds(thresholds, updatedBy = 'desconhecido') {
  if (!thresholds || typeof thresholds !== 'object') throw new Error('Campo "thresholds" (objeto) é obrigatório.')
  const cur = getOfficialConfig() || {}
  const next = {
    ...cur,
    thresholds,
    updatedAt: new Date().toISOString(),
    updatedBy: { ...(cur.updatedBy || {}), thresholds: updatedBy },
  }
  writeAll(next)
  return next
}
