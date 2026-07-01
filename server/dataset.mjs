// ─────────────────────────────────────────────────────────────────────────
// Materialização da base no backend. Carrega o snapshot completo (gerado pelo
// job noturno) em memória UMA vez e recarrega automaticamente quando o arquivo
// muda (compara mtime). É a fonte que os endpoints paginados/agregados por
// engine vão consultar — sem mandar a base inteira pro navegador.
//
//   SNAPSHOT_PATH  caminho do snapshot (ex.: /snapshot/realClients.data).
//                  Sem a env, cai em ./public/realClients.data (dev).
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, statSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH
  ? resolve(process.env.SNAPSHOT_PATH)
  : resolve(process.cwd(), 'public/realClients.data')

let cache = null       // objeto do snapshot já parseado
let cacheMtime = 0     // mtimeMs do arquivo carregado
let lastError = null

// Recarrega se o arquivo mudou (hot reload após o ETL noturno).
function ensureFresh() {
  if (!existsSync(SNAPSHOT_PATH)) { lastError = `snapshot ausente: ${SNAPSHOT_PATH}`; cache = null; return }
  let mtime
  try { mtime = statSync(SNAPSHOT_PATH).mtimeMs } catch (e) { lastError = e.message; return }
  if (cache && mtime === cacheMtime) return
  try {
    const buf = readFileSync(SNAPSHOT_PATH)
    let text
    try { text = gunzipSync(buf).toString('utf8') } catch { text = buf.toString('utf8') } // aceita gzip ou texto puro
    cache = JSON.parse(text)
    cacheMtime = mtime
    lastError = null
    console.log(`[dataset] carregado: ${cache?.clients?.length ?? 0} clientes (${cache?.meta?.coverage ?? '?'}) · ${SNAPSHOT_PATH}`)
  } catch (e) {
    lastError = e.message
  }
}

export function getDataset() { ensureFresh(); return cache }
export function getClients() { ensureFresh(); return cache?.clients ?? [] }
// Versão da base carregada (mtime do arquivo) — usada como chave de invalidação
// do cache de score: muda quando o ETL noturno grava um snapshot novo.
export function getVersion() { ensureFresh(); return cacheMtime }

export function getStatus() {
  ensureFresh()
  return {
    loaded: !!cache,
    path: SNAPSHOT_PATH,
    fileMtime: cacheMtime ? new Date(cacheMtime).toISOString() : null,
    generatedAt: cache?.meta?.generatedAt ?? null,
    coverage: cache?.meta?.coverage ?? null,
    clients: cache?.clients?.length ?? 0,
    totals: cache?.totals ?? null,
    error: lastError,
  }
}
