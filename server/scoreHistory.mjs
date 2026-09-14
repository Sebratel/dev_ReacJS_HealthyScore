// ─────────────────────────────────────────────────────────────────────────
// Leitor do histórico de Health Score (série temporal por cliente).
// Lê os pontos gerados por scripts/score-history.mjs (<HISTORY_DIR>/score-*.json.gz),
// monta um índice clientId → [pontos] em memória e o reconstrói quando os
// arquivos mudam (assinatura = nomes + mtimes). Volume de dados é pequeno
// (1 ponto/semana), então o índice completo cabe folgado na memória.
//
//   HISTORY_DIR  default: <dir do SNAPSHOT_PATH>/history
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve, dirname, join } from 'node:path'

const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH
  ? resolve(process.env.SNAPSHOT_PATH)
  : resolve(process.cwd(), 'public/realClients.data')
const HISTORY_DIR = process.env.HISTORY_DIR
  ? resolve(process.env.HISTORY_DIR)
  : join(dirname(SNAPSHOT_PATH), 'history')

let index = null          // Map clientId -> [{ date, overall, classification, cancelled, byEngine }]
let engineOrder = []      // ordem das engines no vetor `e`
let dates = []            // datas dos pontos carregados (asc)
let signature = ''        // assinatura dos arquivos carregados
let lastError = null

function currentSignature() {
  if (!existsSync(HISTORY_DIR)) return ''
  return readdirSync(HISTORY_DIR)
    .filter((f) => /^score-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f))
    .sort()
    .map((f) => { try { return `${f}:${statSync(join(HISTORY_DIR, f)).mtimeMs}` } catch { return f } })
    .join('|')
}

function ensureFresh() {
  const sig = currentSignature()
  if (index && sig === signature) return
  signature = sig
  index = new Map()
  dates = []
  engineOrder = []
  lastError = null
  if (!existsSync(HISTORY_DIR)) return
  const files = readdirSync(HISTORY_DIR).filter((f) => /^score-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort()
  for (const f of files) {
    try {
      const buf = readFileSync(join(HISTORY_DIR, f))
      const payload = JSON.parse(gunzipSync(buf).toString('utf8'))
      const date = payload.asOf
      if (payload.engineOrder?.length) engineOrder = payload.engineOrder
      dates.push(date)
      for (const r of payload.clients || []) {
        const byEngine = {}
        if (Array.isArray(r.e) && engineOrder.length) engineOrder.forEach((k, i) => { if (r.e[i] != null) byEngine[k] = r.e[i] })
        const point = { date, overall: r.o, classification: r.cls, cancelled: !!r.x, byEngine }
        const key = String(r.id)
        const arr = index.get(key)
        if (arr) arr.push(point); else index.set(key, [point])
      }
    } catch (e) { lastError = `${f}: ${e.message}` }
  }
  // Ordena cada série por data (asc).
  for (const arr of index.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
  console.log(`[score-history] índice: ${index.size} clientes · ${dates.length} pontos (${dates[0] ?? '—'}..${dates[dates.length - 1] ?? '—'})`)
}

export function getClientHistory(clientId) {
  ensureFresh()
  return index?.get(String(clientId)) || []
}

// Índice inteiro (clientId → série) e datas disponíveis. Usado pelo cálculo de
// assertividade, que precisa varrer a base toda numa data passada em vez de
// consultar cliente a cliente.
export function getHistoryIndex() {
  ensureFresh()
  return { index: index ?? new Map(), dates: [...dates] }
}

export function getScoreHistoryStatus() {
  ensureFresh()
  return {
    loaded: !!index,
    dir: HISTORY_DIR,
    points: dates.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    clients: index?.size ?? 0,
    engineOrder,
    error: lastError,
  }
}
