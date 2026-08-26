// ─────────────────────────────────────────────────────────────────────────
// Previsão de prazo de cancelamento (forward-looking) — determinístico.
//
// Ideia: da coorte de CANCELADOS sabemos quanto tempo cada um sobreviveu até
// cancelar (tenure = cancellationDate − contractDate) e a banda de health em que
// estava. Para um cliente ATIVO na mesma banda, com tenure atual T, estimamos a
// JANELA restante a partir de HOJE: entre os cancelados da banda que sobreviveram
// ao menos T dias, quanto tempo a mais eles duraram (mediana e faixa p25–p75).
//
// É uma FAIXA DE RISCO, não uma data garantida. A IA só narra este número.
// ─────────────────────────────────────────────────────────────────────────
import { scoreAllClients } from './engines.mjs'
import { getOfficialConfig } from './officialConfig.mjs'

const DAY = 86400000
const toTime = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? null : t }
// dias entre uma data ISO e um timestamp (bMs). null se a data for inválida.
const daysFrom = (iso, bMs) => { const a = toTime(iso); return a == null ? null : Math.floor((bMs - a) / DAY) }

// Percentil de um array JÁ ordenado asc (nearest-rank). null se vazio.
function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))))
  return sortedAsc[idx]
}
// Índice do 1º elemento >= x (lower bound) num array ordenado asc.
function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid } return lo }

// Bandas consideradas "em risco" (só essas entram na lista de previsão).
const AT_RISK = new Set(['critical', 'high_risk', 'attention'])
// Mínimo de cancelados-sobreviventes para confiar na janela condicional.
const MIN_SUFFIX = 8

// ── Núcleo PURO (testável sem banco) ───────────────────────────
// Recebe os coortes JÁ pontuados + mapas por id. Devolve a lista rankeada.
export function computeForecast({ scoredActive, scoredCancelled, activeById, cancById, nowMs, topN = 200, city, classification }) {
  // Tenures de cancelamento por banda (asc) a partir dos cancelados pontuados.
  const byBand = {}
  for (const s of scoredCancelled) {
    const c = cancById.get(s.clientId); if (!c) continue
    const tenure = c.cancellationDate && c.contractDate ? daysFrom(c.contractDate, toTime(c.cancellationDate)) : null
    if (tenure == null || tenure < 0) continue
    ;(byBand[s.classification] ??= []).push(tenure)
  }
  const bands = {}
  for (const [band, arr] of Object.entries(byBand)) {
    arr.sort((a, b) => a - b)
    bands[band] = { count: arr.length, p25: percentile(arr, 25), p50: percentile(arr, 50), p75: percentile(arr, 75) }
  }

  const rows = []
  for (const s of scoredActive) {
    if (!AT_RISK.has(s.classification)) continue
    if (classification && s.classification !== classification) continue
    const c = activeById.get(s.clientId); if (!c) continue
    if (city && c.city !== city) continue
    const tenure = c.contractDate ? daysFrom(c.contractDate, nowMs) : null
    if (tenure == null || tenure < 0) continue
    const arr = byBand[s.classification]; if (!arr || !arr.length) continue

    // Sobreviventes: cancelados da banda com tenure >= T (suffix do array asc).
    const suffix = arr.slice(lowerBound(arr, tenure))
    let median, p25, p75, sampleN
    if (suffix.length >= MIN_SUFFIX) {
      median = Math.max(0, percentile(suffix, 50) - tenure)
      p25 = Math.max(0, percentile(suffix, 25) - tenure)
      p75 = Math.max(0, percentile(suffix, 75) - tenure)
      sampleN = suffix.length
    } else {
      // Fallback incondicional: mediana da banda − T. Se já ultrapassou a
      // janela típica (mediana <= T), o sinal de TEMPO é fraco → não lista.
      const bm = bands[s.classification]?.p50
      if (bm == null || bm <= tenure) continue
      median = Math.max(0, bm - tenure)
      p25 = Math.max(0, (bands[s.classification].p25 ?? bm) - tenure)
      p75 = Math.max(0, (bands[s.classification].p75 ?? bm) - tenure)
      sampleN = arr.length
    }

    rows.push({
      customerId: s.clientId, customerName: c.name, contractNumber: c.contractNumber || '',
      city: c.city, plan: c.plan, monthlyValue: c.monthlyValue || 0,
      overallHealth: s.overall, classification: s.classification,
      tenureDays: tenure, windowMedianDays: median, windowP25Days: p25, windowP75Days: p75,
      sampleN, revenueRisk: ((100 - s.overall) / 100) * (c.monthlyValue || 0),
    })
  }
  // Urgência: menor janela primeiro; empate → pior health; empate → maior MRR.
  rows.sort((a, b) => a.windowMedianDays - b.windowMedianDays || a.overallHealth - b.overallHealth || b.monthlyValue - a.monthlyValue)
  return { rows: rows.slice(0, topN), total: rows.length, bands }
}

// ── Wiring: pontua os coortes e chama o núcleo ─────────────────
export function runChurnForecast(active, cancelled, { configs, thresholds, monthly = [], topN = 200, city, classification } = {}) {
  const official = getOfficialConfig()
  const cfgs = official?.configs ?? configs
  const thr = official?.thresholds ?? thresholds
  const scoredActive = scoreAllClients(active, { configs: cfgs, thresholds: thr, monthly })
  const scoredCancelled = scoreAllClients(cancelled, { configs: cfgs, thresholds: thr, monthly })
  const activeById = new Map(active.map((c) => [c.clientId, c]))
  const cancById = new Map(cancelled.map((c) => [c.clientId, c]))
  const nowMs = Date.now()
  const out = computeForecast({ scoredActive, scoredCancelled, activeById, cancById, nowMs, topN, city, classification })
  return { ...out, generatedAt: new Date(nowMs).toISOString() }
}
