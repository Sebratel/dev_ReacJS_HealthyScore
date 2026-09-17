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

// Engines cujo score só é comparável entre populações quando o cliente tinha
// leitura de enlace. Hoje só Conexão, e a razão é a disponibilidade desigual
// dos insumos: o ativo tem potência óptica em 95% dos casos e o cancelado em
// 0%; quedas de PPPoE chegam a 99% dos ativos e 46% dos cancelados. Como "sem
// dado não pontua", quem tem menos insumo perde menos ponto — o score médio de
// Conexão sai 70,8 nos ativos contra 93,2 nos cancelados, 22 pontos de pura
// ausência de medição. Sem esse recorte, comparar as duas populações conclui
// que quem cancelou tinha conexão melhor.
// `hasLink` é o divisor porque separa os dois mundos com precisão (96% dos
// ativos, 0% dos cancelados), não porque o enlace sozinho explique a diferença.
const ENGINES_QUE_EXIGEM_ENLACE = ['connection']

export function comparableOf(byEngine, hasLink) {
  if (hasLink) return byEngine
  // hasLink null = ponto antigo, sem o campo: não dá para afirmar que é
  // comparável, então o score restrito é omitido do mesmo jeito.
  const out = { ...byEngine }
  for (const k of ENGINES_QUE_EXIGEM_ENLACE) delete out[k]
  return out
}

let index = null          // Map clientId -> [{ date, overall, classification, cancelled, byEngine, comparableByEngine, hasLink, values }]
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
        // `hasLink` diz se havia leitura de enlace (óptica/LAN/CPE/Wi-Fi) na
        // data. Pontos gravados antes desse campo existir não têm `lk`: aí
        // `hasLink` fica null (desconhecido), que é diferente de false.
        const hasLink = r.lk == null ? null : !!r.lk
        const point = {
          date, overall: r.o, classification: r.cls, cancelled: !!r.x, byEngine,
          hasLink,
          values: r.v ?? null,
          // Mesma régua para os dois lados: o score de Conexão só entra aqui
          // quando o cliente TINHA leitura de enlace. Os sinais de enlace
          // existem só para ativos (o cancelado não recebe nenhum no ETL), e
          // como "sem dado não pontua", quem não tem sai com o score inflado
          // por ausência. Quem for comparar quem saiu com quem ficou usa este
          // campo e não precisa conhecer a armadilha.
          comparableByEngine: comparableOf(byEngine, hasLink),
        }
        // Indexa pelo id E pelo número do contrato. A identidade do sistema
        // mudou de PESSOA para CONTRATO: sem a segunda chave, todo ponto
        // gravado antes da virada ficaria órfão e a linha do tempo apareceria
        // vazia. O passado não dá para regravar, então o índice aceita os dois.
        for (const key of new Set([String(r.id), r.ct != null ? String(r.ct) : ''])) {
          if (!key) continue
          const arr = index.get(key)
          if (arr) arr.push(point); else index.set(key, [point])
        }
      }
    } catch (e) { lastError = `${f}: ${e.message}` }
  }
  // Ordena cada série por data (asc).
  for (const arr of index.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
  console.log(`[score-history] índice: ${index.size} chaves · ${dates.length} pontos (${dates[0] ?? '—'}..${dates[dates.length - 1] ?? '—'})`)
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
    // Quem consome a série para comparar populações precisa saber que o score
    // de Conexão exige o recorte por `hasLink` — ver comparableByEngine.
    enginesQueExigemEnlace: ENGINES_QUE_EXIGEM_ENLACE,
    error: lastError,
  }
}
