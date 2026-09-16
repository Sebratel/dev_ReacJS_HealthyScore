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

// ─── Merge por setor ───────────────────────────────────────────
// O front manda SEMPRE as 7 engines (é o estado inteiro do store), mas um power
// user setorial só pode mexer nas suas. Aqui a config que chega é filtrada
// contra o escopo:
//   • engine no escopo      → entra inteira (pesos, índices, nomes).
//   • engine fora do escopo → preserva os PESOS oficiais e aceita só os NOMES
//     (label/description) dos itens que já existem — renomear indicador não é
//     restrito por setor, mexer na pontuação é.
//   • engine ainda sem oficial → entra como veio (é o default do código; não há
//     peso publicado a proteger).
// Índice que não existe na oficial não é criado por quem está fora do escopo —
// criar índice é definir pontuação, e isso pertence ao dono do setor.
function mergeNamesOnly(official, incoming) {
  if (!official || typeof official !== 'object') return official
  if (!incoming || typeof incoming !== 'object' || !incoming.indicators) return official
  const indicators = {}
  for (const [key, cur] of Object.entries(official.indicators || {})) {
    const inc = incoming.indicators[key]
    if (!inc || typeof inc !== 'object') { indicators[key] = cur; continue }
    const next = { ...cur }
    if (typeof inc.label === 'string') next.label = inc.label
    if (typeof inc.description === 'string') next.description = inc.description
    if (Array.isArray(cur.indices)) {
      const byKey = new Map((Array.isArray(inc.indices) ? inc.indices : []).map((i) => [i?.key, i]))
      next.indices = cur.indices.map((idx) => {
        const incIdx = byKey.get(idx?.key)
        return incIdx && typeof incIdx.label === 'string' ? { ...idx, label: incIdx.label } : idx
      })
    }
    indicators[key] = next
  }
  return { ...official, indicators }
}

// Aplica `incoming` sobre a config oficial respeitando o escopo do autor.
// `canEdit(engineKey)` decide, engine a engine. Devolve o objeto a gravar e o
// que foi de fato aceito (para o log e para a resposta da API).
export function mergeConfigsWithScope(incoming, canEdit) {
  if (!incoming || typeof incoming !== 'object') throw new Error('Campo "configs" (objeto) é obrigatório.')
  const official = getOfficialConfig()?.configs || {}
  const configs = { ...official }
  const applied = []
  const namesOnly = []
  for (const [engine, cfg] of Object.entries(incoming)) {
    if (!cfg || typeof cfg !== 'object') continue
    if (canEdit(engine) || !official[engine]) {
      configs[engine] = cfg
      applied.push(engine)
    } else {
      configs[engine] = mergeNamesOnly(official[engine], cfg)
      namesOnly.push(engine)
    }
  }
  return { configs, applied, namesOnly }
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
