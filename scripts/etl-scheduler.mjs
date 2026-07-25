// ─────────────────────────────────────────────────────────────────────────
// Agendador do ETL — roda `fetch-clients.mjs full` 1x por dia de madrugada,
// gravando o snapshot completo no volume compartilhado (SNAPSHOT_OUT). Sobe
// como o serviço `etl` da stack (docker-compose). Sem dependências externas.
//
//   ETL_HOUR          hora do dia p/ rodar (0-23, default 3)
//   SNAPSHOT_OUT      caminho de saída do snapshot (ex.: /snapshot/realClients.data)
//   ETL_RUN_ON_START  'true' força uma execução ao subir (além do bootstrap)
//
// Bootstrap: se o snapshot ainda não existe no volume, gera na hora (assim a
// stack recém-subida já tem dados sem esperar a madrugada).
// ─────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ETL = resolve(__dirname, 'fetch-clients.mjs')
const SCORER = resolve(__dirname, 'score-history.mjs')
const OUT = process.env.SNAPSHOT_OUT ? resolve(process.env.SNAPSHOT_OUT) : resolve(__dirname, '../public/realClients.data')
const HOUR = Math.min(23, Math.max(0, Number(process.env.ETL_HOUR ?? 3)))
// Histórico de score ligado por padrão; desligue com SCORE_HISTORY=off.
const SCORE_HISTORY = (process.env.SCORE_HISTORY ?? 'on').toLowerCase() !== 'off'

// Anexa um ponto ao histórico de score (roda sob tsx — importa as engines .ts).
// A própria trava de cadência (HISTORY_MIN_DAYS) decide se grava ou pula.
function runScoreHistory() {
  if (!SCORE_HISTORY) return
  console.log('[etl] pontuando histórico de score…')
  const child = spawn(process.execPath, ['--import', 'tsx', SCORER], { stdio: 'inherit', env: process.env })
  child.on('exit', (code) => console.log(`[etl] score-history finalizado (code ${code})`))
  child.on('error', (e) => console.error(`[etl] score-history falhou ao iniciar: ${e.message}`))
}

let running = false
function runETL(reason) {
  if (running) { console.log('[etl] já em execução — ignorando gatilho.'); return }
  running = true
  console.log(`[etl] iniciando ETL completo (${reason}) → ${OUT}`)
  const child = spawn(process.execPath, [ETL, 'full'], { stdio: 'inherit', env: process.env })
  child.on('exit', (code) => {
    running = false
    console.log(`[etl] finalizado (code ${code}) em ${new Date().toISOString()}`)
    if (code === 0) runScoreHistory() // só pontua se o ETL gravou o snapshot novo
  })
  child.on('error', (e) => { running = false; console.error(`[etl] falha ao iniciar: ${e.message}`) })
}

function msUntilHour(hour) {
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

function scheduleNightly() {
  const ms = msUntilHour(HOUR)
  console.log(`[etl] próxima execução agendada em ~${Math.round(ms / 3600000)}h (${String(HOUR).padStart(2, '0')}:00 local)`)
  setTimeout(() => { runETL('agendamento noturno'); scheduleNightly() }, ms)
}

if (!existsSync(OUT)) runETL('bootstrap — snapshot ausente no volume')
else if (process.env.ETL_RUN_ON_START === 'true') runETL('ETL_RUN_ON_START=true')
else console.log(`[etl] snapshot existente: ${OUT} (sem execução imediata)`)

scheduleNightly()
console.log(`[etl] scheduler ativo · hora=${HOUR}`)
