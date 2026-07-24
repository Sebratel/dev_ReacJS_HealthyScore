// ─────────────────────────────────────────────────────────────────────────
// Histórico de Health Score — append-only, "config oficial" congelada.
//
// Lê o snapshot materializado (o mesmo que a api consome), pontua a base ATIVA
// e os CANCELADOS com a config DEFAULT de cada engine (a "oficial", não a
// per-usuário do navegador) e ANEXA um ponto por data num arquivo gzip no
// volume, ao lado do snapshot:
//
//   <HISTORY_DIR>/score-YYYY-MM-DD.json.gz
//
// Cadência: por padrão só grava se o ponto mais recente tiver ≥ HISTORY_MIN_DAYS
// dias (30 = mensal · 7 = semanal · 1 = diário). Idempotente: rodar 2x no mesmo
// dia sobrescreve o arquivo do dia. Use --force para ignorar a trava.
// Aumentar a frequência depois é seguro (só acrescenta pontos daqui pra frente);
// o passado NÃO pode ser adensado retroativamente.
//
// Roda sob tsx (importa as engines .ts):  node --import tsx scripts/score-history.mjs
//
//   SNAPSHOT_OUT / SNAPSHOT_PATH  caminho do snapshot (arg posicional tem prioridade)
//   HISTORY_DIR                   destino (default: <dir do snapshot>/history)
//   HISTORY_MIN_DAYS              intervalo mínimo entre pontos (default 7)
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { scoreAllClients } from '../server/engines.mjs'
import { DEFAULT_FINANCIAL_CONFIG } from '../src/features/financial-engine/financialConfig.ts'
import { DEFAULT_COMMERCIAL_CONFIG } from '../src/features/commercial-engine/commercialConfig.ts'
import { DEFAULT_CONNECTION_CONFIG } from '../src/features/connection-engine/connectionConfig.ts'
import { DEFAULT_NETWORK_CONFIG } from '../src/features/network-engine/networkConfig.ts'
import { DEFAULT_FIELD_CONFIG } from '../src/features/field-engine/fieldConfig.ts'
import { DEFAULT_INSTALLATION_CONFIG } from '../src/features/installation-engine/installationConfig.ts'
import { DEFAULT_RELATIONSHIP_CONFIG } from '../src/features/relationship-engine/relationshipConfig.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FORCE = process.argv.includes('--force')
const CONFIG_VERSION = 'official-v1'

// Config OFICIAL — os defaults de cada engine. Se um dia mudarem os pesos, suba
// o CONFIG_VERSION para a timeline sinalizar a quebra de comparabilidade.
const OFFICIAL_CONFIGS = {
  financial: DEFAULT_FINANCIAL_CONFIG,
  commercial: DEFAULT_COMMERCIAL_CONFIG,
  connection: DEFAULT_CONNECTION_CONFIG,
  network: DEFAULT_NETWORK_CONFIG,
  field: DEFAULT_FIELD_CONFIG,
  installation: DEFAULT_INSTALLATION_CONFIG,
  relationship: DEFAULT_RELATIONSHIP_CONFIG,
}

const SNAP = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'))
  || process.env.SNAPSHOT_OUT || process.env.SNAPSHOT_PATH
  || resolve(__dirname, '../public/realClients.data')
const SNAPSHOT = resolve(SNAP)
const HISTORY_DIR = process.env.HISTORY_DIR ? resolve(process.env.HISTORY_DIR) : join(dirname(SNAPSHOT), 'history')
const MIN_DAYS = Number(process.env.HISTORY_MIN_DAYS ?? 30)

function loadSnapshot(path) {
  const buf = readFileSync(path)
  let text
  try { text = gunzipSync(buf).toString('utf8') } catch { text = buf.toString('utf8') }
  return JSON.parse(text)
}

// Data do ponto mais recente já gravado (por nome de arquivo), ou null.
function newestPointDate() {
  if (!existsSync(HISTORY_DIR)) return null
  const dates = readdirSync(HISTORY_DIR)
    .map((f) => /^score-(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(f)?.[1])
    .filter(Boolean)
    .sort()
  return dates.length ? dates[dates.length - 1] : null
}

function daysBetween(aIso, bIso) {
  return Math.round((new Date(bIso + 'T00:00:00Z') - new Date(aIso + 'T00:00:00Z')) / 86400000)
}

if (!existsSync(SNAPSHOT)) {
  console.error(`[score-history] snapshot ausente: ${SNAPSHOT}`)
  process.exit(1)
}

const snap = loadSnapshot(SNAPSHOT)
const asOf = (snap.meta?.generatedAt ? new Date(snap.meta.generatedAt) : new Date()).toISOString().slice(0, 10)

// Trava de cadência (semanal por padrão) — a não ser --force.
const newest = newestPointDate()
if (!FORCE && newest && daysBetween(newest, asOf) < MIN_DAYS) {
  console.log(`[score-history] último ponto em ${newest} (< ${MIN_DAYS} dias de ${asOf}) — pulando. Use --force para gravar.`)
  process.exit(0)
}

const active = snap.clients || []
const cancelled = snap.cancelledClients || []
const monthly = snap.monthly || []

const scoredActive = scoreAllClients(active, { configs: OFFICIAL_CONFIGS, monthly })
const scoredCancelled = scoreAllClients(cancelled, { configs: OFFICIAL_CONFIGS, monthly })

// Registro compacto: id, contrato, overall(o), classe(cls), cancelado(x), scores por engine(e).
const ENGINE_ORDER = ['financial', 'commercial', 'connection', 'network', 'field', 'installation', 'relationship']
const pack = (s, x) => ({
  id: s.clientId, ct: s.contractNumber, o: s.overall, cls: s.classification, x,
  e: ENGINE_ORDER.map((k) => (s.byEngine[k] ?? null)),
})
const records = [...scoredActive.map((s) => pack(s, 0)), ...scoredCancelled.map((s) => pack(s, 1))]

const payload = {
  asOf,
  generatedAt: new Date().toISOString(),
  configVersion: CONFIG_VERSION,
  engineOrder: ENGINE_ORDER,
  coverage: snap.meta?.coverage ?? null,
  counts: { active: scoredActive.length, cancelled: scoredCancelled.length, total: records.length },
  clients: records,
}

mkdirSync(HISTORY_DIR, { recursive: true })
const out = join(HISTORY_DIR, `score-${asOf}.json.gz`)
const json = JSON.stringify(payload)
const gz = gzipSync(json, { level: 9 })
writeFileSync(out, gz)
console.log(`[score-history] OK — ${records.length} clientes (${scoredActive.length} ativos + ${scoredCancelled.length} cancelados) · asOf ${asOf} · JSON ${(json.length / 1048576).toFixed(1)} MB → gzip ${(gz.length / 1048576).toFixed(2)} MB → ${out}`)
