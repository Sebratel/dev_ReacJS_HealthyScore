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
// Cada registro leva, além do score: `v` com os VALORES de foto do enlace
// (potência óptica, porta LAN, RSSI do Wi-Fi, memória/temperatura do CPE) e
// `lk` dizendo se havia leitura de enlace. O score responde "quanto valia"; o
// `v` responde "por quê" — e é o único que não dá para reconstruir depois, já
// que o AutoISP guarda só a leitura mais recente e o vínculo com o cliente é
// desfeito quando o equipamento é recolhido.
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
//   HISTORY_MIN_DAYS              intervalo mínimo entre pontos (default 30)
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { scoreAllClients } from '../server/engines.mjs'
import { linkKeysOf } from '../src/features/connection-engine/connectionEngine.ts'
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

// ── Valores de FOTO congelados junto com o score ──
// O score responde "quanto o cliente valia naquele dia"; estes campos respondem
// "por quê" — e são os únicos que NÃO dá para reconstruir depois. O AutoISP
// guarda só a leitura mais recente: quando o cliente sai, o CPE para de
// informar, o equipamento é recolhido e o vínculo com o cliente é desfeito (76%
// dos CPEs parados já estão sem cliente). Sem congelar aqui, a pergunta "quem
// cancelou estava com o Wi-Fi ruim 60 dias antes?" fica sem resposta possível.
const byId = new Map([...active, ...cancelled].map((c) => [c.clientId, c]))
const linkValues = (c) => {
  if (!c) return null
  const v = {}
  if (c.connRxPower != null) v.rx = c.connRxPower          // potência óptica (dBm)
  if (c.connLanMbps != null) v.lan = c.connLanMbps         // porta LAN (Mbps)
  if (c.connWifiRssi != null) v.rssi = c.connWifiRssi      // Wi-Fi na casa, mediana (dBm)
  if (c.connWifiDevices != null) v.nap = c.connWifiDevices // aparelhos no Wi-Fi
  if (c.connCpeMemPct != null) v.mem = c.connCpeMemPct     // memória do CPE (%)
  if (c.connCpeTempC != null) v.tmp = c.connCpeTempC       // temperatura do CPE (°C)
  if (c.connOnuStatus) v.onu = c.connOnuStatus             // status da ONU na carga
  return Object.keys(v).length ? v : null
}

// ── Comparabilidade do score de Conexão (lk) ──
// O score de Conexão do CANCELADO não é comparável com o do ativo, porque os
// insumos da engine não chegam igual nos dois grupos. Medido no snapshot de
// 13/09/2026 (2 mil ativos × 38,7 mil cancelados):
//
//                        ativos   cancelados
//   equipamento alocado   98,9%      99,5%    ← igual, não distorce
//   quedas de PPPoE       99,2%      46,4%    ← some pela metade
//   potência óptica       95,1%       0,0%    ← só ativo tem
//   RSSI do Wi-Fi         17,3%       0,0%    ← só ativo tem
//
// Os sinais de enlace são aplicados no ETL via `byContract`, que é o índice dos
// ATIVOS; o cancelado recebe só quedas de PPPoE e infra. Como "sem dado não
// pontua", quem tem menos insumo perde menos ponto: o score médio de Conexão dá
// 70,8 nos ativos contra 93,2 nos cancelados — 22 pontos de diferença que são
// ausência de medição, não qualidade de conexão. Sem esse recorte, qualquer
// leitura de assertividade conclui que quem cancelou tinha conexão MELHOR.
//
// `lk` marca o fato observável (havia leitura de enlace?) e serve de divisor
// porque separa os dois mundos perfeitamente: 96% dos ativos têm, 0% dos
// cancelados. `linkKeysOf` é a mesma função que o motor usa para casar os
// índices — a definição de "tem leitura de enlace" mora num lugar só.
const hasLink = (c) => !!c && Object.values(linkKeysOf(c)).some(Boolean)

// Registro compacto: id, contrato, overall(o), classe(cls), cancelado(x),
// scores por engine(e), tinha leitura de enlace(lk) e valores congelados(v).
const ENGINE_ORDER = ['financial', 'commercial', 'connection', 'network', 'field', 'installation', 'relationship']
const pack = (s, x) => {
  const c = byId.get(s.clientId)
  const v = linkValues(c)
  const r = {
    id: s.clientId, ct: s.contractNumber, o: s.overall, cls: s.classification, x,
    e: ENGINE_ORDER.map((k) => (s.byEngine[k] ?? null)),
    lk: hasLink(c) ? 1 : 0,
  }
  if (v) r.v = v
  return r
}
const records = [...scoredActive.map((s) => pack(s, 0)), ...scoredCancelled.map((s) => pack(s, 1))]

const payload = {
  asOf,
  generatedAt: new Date().toISOString(),
  configVersion: CONFIG_VERSION,
  engineOrder: ENGINE_ORDER,
  coverage: snap.meta?.coverage ?? null,
  counts: {
    active: scoredActive.length, cancelled: scoredCancelled.length, total: records.length,
    // Quantos de cada grupo tinham leitura de enlace. É o tamanho do viés: se
    // withLink.cancelled for ~0 e withLink.active for alto, o score de Conexão
    // dos dois grupos não é comparável direto — ver `lk` e comparableByEngine.
    withLink: {
      active: records.filter((r) => !r.x && r.lk).length,
      cancelled: records.filter((r) => r.x && r.lk).length,
    },
  },
  clients: records,
}

mkdirSync(HISTORY_DIR, { recursive: true })
const out = join(HISTORY_DIR, `score-${asOf}.json.gz`)
const json = JSON.stringify(payload)
const gz = gzipSync(json, { level: 9 })
writeFileSync(out, gz)
console.log(`[score-history] OK — ${records.length} clientes (${scoredActive.length} ativos + ${scoredCancelled.length} cancelados) · asOf ${asOf} · JSON ${(json.length / 1048576).toFixed(1)} MB → gzip ${(gz.length / 1048576).toFixed(2)} MB → ${out}`)
