// ─────────────────────────────────────────────────────────────────────────
// Coorte mensal — runner (toca os bancos, pontua, grava o artefato).
//
// Para cada mês M:
//   1. reconstrói a base ATIVA no último dia de M (ELLEVEN, por contrato)
//   2. pontua com as MESMAS engines do app e a config oficial
//   3. observa quem cancelou no mês seguinte (janela FECHADA, comparável)
//   4. junta o total de conexões provisionadas (MariaDB) como denominador
//
// Roda sob tsx (as engines são .ts):
//   npm run cohort:mensal -- --de 2026-01 --ate 2026-08
//
// Opções:
//   --de / --ate     faixa de meses (default: últimos 6 fechados)
//   --limite N       amostra aleatória de N contratos por mês (teste rápido)
//   --janela N       dias de histórico de sinal por mês (default 180)
//   --saida CAMINHO  default: public/monthly-cohort.json
// ─────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { makePool } from './db.mjs'
import { makeMariaPool } from './db-maria.mjs'
import { buildAsOfCohort, SIGNAL_WINDOW_DAYS } from './queries/asOfCohort.mjs'
import { getEffectiveSql } from './queries/index.mjs'
import { scoreAllClients } from '../server/engines.mjs'
import { fimDoMes, mesesEntre, pontoMensal, resumirSerie } from '../server/monthlyCohort.mjs'
import { DEFAULT_FINANCIAL_CONFIG } from '../src/features/financial-engine/financialConfig.ts'
import { DEFAULT_COMMERCIAL_CONFIG } from '../src/features/commercial-engine/commercialConfig.ts'
import { DEFAULT_CONNECTION_CONFIG } from '../src/features/connection-engine/connectionConfig.ts'
import { DEFAULT_NETWORK_CONFIG } from '../src/features/network-engine/networkConfig.ts'
import { DEFAULT_FIELD_CONFIG } from '../src/features/field-engine/fieldConfig.ts'
import { DEFAULT_INSTALLATION_CONFIG } from '../src/features/installation-engine/installationConfig.ts'
import { DEFAULT_RELATIONSHIP_CONFIG } from '../src/features/relationship-engine/relationshipConfig.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Mesma config oficial do score-history — comparar exige a MESMA régua.
const CONFIG_VERSION = 'official-v1'
const OFFICIAL_CONFIGS = {
  financial: DEFAULT_FINANCIAL_CONFIG,
  commercial: DEFAULT_COMMERCIAL_CONFIG,
  connection: DEFAULT_CONNECTION_CONFIG,
  network: DEFAULT_NETWORK_CONFIG,
  field: DEFAULT_FIELD_CONFIG,
  installation: DEFAULT_INSTALLATION_CONFIG,
  relationship: DEFAULT_RELATIONSHIP_CONFIG,
}

const arg = (nome, fallback = null) => {
  const i = process.argv.indexOf(nome)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

// Default: os 6 últimos meses FECHADOS. O mês corrente fica de fora — sua
// janela de desfecho ainda não existe, e incluí-lo só cria um ponto que
// parece ótimo porque ninguém teve tempo de cancelar.
function mesesPadrao() {
  const hoje = new Date()
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 2, 1))
  const ini = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - 5, 1))
  const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return { de: ym(ini), ate: ym(fim) }
}

const padrao = mesesPadrao()
const DE = arg('--de', padrao.de)
const ATE = arg('--ate', padrao.ate)
const LIMITE = Number(arg('--limite', '0')) || 0
const SAIDA = resolve(arg('--saida', resolve(__dirname, '../public/monthly-cohort.json')))
const JANELA_DIAS = Number(arg('--janela', String(SIGNAL_WINDOW_DAYS))) || SIGNAL_WINDOW_DAYS

// Amostra aleatória sem reposição (Fisher-Yates parcial sobre uma cópia).
function amostra(arr, n) {
  if (n >= arr.length) return arr
  const copia = arr.slice()
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copia.length - i))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia.slice(0, n)
}

const proximoMes = (ym) => {
  let [a, m] = ym.split('-').map(Number)
  m++
  if (m > 12) { m = 1; a++ }
  return `${a}-${String(m).padStart(2, '0')}`
}

const pool = makePool()
let mariaPool = null

// ─── Conexões provisionadas por mês (MariaDB) ──────────────────
// Denominador operacional. Se a base não responder, seguimos sem ela: a
// coorte inteira não pode depender de um número de contexto.
const conexoesPorMes = new Map()
try {
  mariaPool = await makeMariaPool()
  const [rows] = await mariaPool.query(getEffectiveSql('Q_MARIA_CONEXOES_MES'))
  for (const r of rows) {
    const dia = String(r.dia).slice(0, 10)
    conexoesPorMes.set(dia.slice(0, 7), Number(r.conexoes))
  }
  console.log(`[mensal] conexões: ${conexoesPorMes.size} meses (${[...conexoesPorMes.keys()].join(', ')})`)
} catch (e) {
  console.warn(`[mensal] sem conexões do MariaDB (${e.message}) — seguindo só com contratos.`)
}

const meses = mesesEntre(DE, ATE)
console.log(`[mensal] processando ${meses.length} mês(es): ${meses.join(', ')}`)
if (LIMITE) console.log(`[mensal] LIMITE=${LIMITE} contratos/mês — resultado é amostra, não a base.`)

const pontos = []
const avisos = []

for (const mes of meses) {
  const corte = fimDoMes(mes)
  const janela = proximoMes(mes)
  const t0 = Date.now()

  const { clients, warnings, janela: janelaSinal } = await buildAsOfCohort(pool, { asOf: corte, janelaDias: JANELA_DIAS })
  if (warnings.length) avisos.push(...warnings.map((w) => `${mes}: ${w}`))
  // Amostra ALEATÓRIA, nunca as primeiras N. A base vem ordenada por id, então
  // fatiar o começo entrega os contratos mais antigos — que têm muito menos
  // sinal recente (15,7% com fatura contra 75,3% da base) e fazem o teste
  // mentir na direção otimista.
  const base = LIMITE ? amostra(clients, LIMITE) : clients
  if (!base.length) {
    console.log(`[mensal] ${mes}: base vazia — pulando.`)
    continue
  }

  const scored = scoreAllClients(base, { configs: OFFICIAL_CONFIGS, monthly: [] })

  // Desfecho: cancelamentos do mês SEGUINTE, por contrato.
  const { rows: cancelRows } = await pool.query(
    getEffectiveSql('Q_ASOF_CANCEL_MES', { cancelled: 'all' }),
    [fimDoMes(janela).slice(0, 8) + '01', fimDoMes(janela)]
  )
  const cancelDepois = new Map()
  for (const r of cancelRows) {
    if (!r.contract_number) continue
    cancelDepois.set(String(r.contract_number), {
      cancellationDate: r.cancellation_date ? String(r.cancellation_date).slice(0, 10) : null,
      code: r.cancellation_code || null,
      mrr: Number(r.selling_price) || 0,
    })
  }

  const ponto = pontoMensal({
    mes,
    scored,
    cancelDepois,
    conexoes: conexoesPorMes.get(mes) ?? null,
    janelaDesfecho: janela,
  })
  // Cobertura de engine: quantas das 7 realmente pontuaram. Conexão e Rede não
  // reconstroem para o passado, então o número naturalmente fica abaixo de 7 —
  // registrar isso evita que alguém compare este score com o de hoje sem saber.
  const somaEngines = scored.reduce((a, s) => a + (s.enginesPresent || 0), 0)
  ponto.enginesMedia = scored.length ? Number((somaEngines / scored.length).toFixed(2)) : null
  ponto.janelaSinal = janelaSinal
  pontos.push(ponto)

  console.log(
    `[mensal] ${mes}: ${ponto.contratosAtivos} avaliáveis (+${ponto.semSinalSuficiente} sem sinal) · ` +
    `${ponto.conexoes ?? '—'} conexões · ${ponto.cancelamentos} saíram em ${janela} (${ponto.taxaCancelamento}%) · ` +
    `recall ${ponto.recall ?? '—'}% · engines ${ponto.enginesMedia} · ${((Date.now() - t0) / 1000).toFixed(1)}s`
  )
}

const { resumo } = resumirSerie(pontos)
const payload = {
  geradoEm: new Date().toISOString(),
  configVersion: CONFIG_VERSION,
  de: DE,
  ate: ATE,
  amostra: LIMITE || null,
  janelaSinalDias: JANELA_DIAS,
  // Dito no artefato, não só no README: quem ler o JSON precisa saber que o
  // score retroativo não tem as engines de estado atual.
  enginesIndisponiveisNoPassado: ['connection', 'network'],
  pontos,
  resumo,
  avisos,
}

mkdirSync(dirname(SAIDA), { recursive: true })
writeFileSync(SAIDA, JSON.stringify(payload, null, 2))
console.log(`\n[mensal] gravado: ${SAIDA}`)
if (resumo) {
  console.log(`[mensal] ${resumo.meses} meses · taxa média ${resumo.taxaMedia}% · recall médio ${resumo.recallMedio}% · separação ${resumo.separacao}x`)
}
if (avisos.length) console.log(`[mensal] ${avisos.length} aviso(s): ${avisos.slice(0, 5).join(' | ')}`)

await pool.end()
if (mariaPool) await mariaPool.end()
