// ─────────────────────────────────────────────────────────────────────────
// Agendador do ETL — roda `fetch-clients.mjs full` 1x por dia de madrugada,
// gravando o snapshot completo no volume compartilhado (SNAPSHOT_OUT). Sobe
// como o serviço `etl` da stack (docker-compose). Sem dependências externas.
//
//   ETL_HOUR          hora do dia p/ rodar (0-23, default 3)
//   SNAPSHOT_OUT      caminho de saída do snapshot (ex.: /snapshot/realClients.data)
//   ETL_RUN_ON_START  'true' força uma execução ao subir (além do bootstrap)
//   MONTHLY_COHORT       'off' desliga a coorte mensal
//   MONTHLY_COHORT_DAY   dia do mês em que ela roda (default 1)
//   MONTHLY_COHORT_FORCE 'true' roda fora do dia marcado (teste)
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
const OUTCOMES_JOB = resolve(__dirname, 'evaluate-outcomes.mjs')
const COORTE_JOB = resolve(__dirname, 'monthly-cohort.mjs')
const OUT = process.env.SNAPSHOT_OUT ? resolve(process.env.SNAPSHOT_OUT) : resolve(__dirname, '../public/realClients.data')
const HOUR = Math.min(23, Math.max(0, Number(process.env.ETL_HOUR ?? 3)))
// Histórico de score ligado por padrão; desligue com SCORE_HISTORY=off.
const SCORE_HISTORY = (process.env.SCORE_HISTORY ?? 'on').toLowerCase() !== 'off'
// Reavaliação de impacto dos Planos de Ação; desligue com ACTION_PLAN_OUTCOMES=off.
const OUTCOMES = (process.env.ACTION_PLAN_OUTCOMES ?? 'on').toLowerCase() !== 'off'
// Coorte mensal (indicador do mês anterior); desligue com MONTHLY_COHORT=off.
const COORTE_MENSAL = (process.env.MONTHLY_COHORT ?? 'on').toLowerCase() !== 'off'
// Dia do mês em que publica. 1 = no primeiro dia, olhando o mês que fechou.
const COORTE_DIA = Math.min(28, Math.max(1, Number(process.env.MONTHLY_COHORT_DAY ?? 1)))
// Para testar fora do dia 1º sem esperar o mês virar.
const COORTE_FORCAR = process.env.MONTHLY_COHORT_FORCE === 'true'

// Anexa um ponto ao histórico de score (roda sob tsx — importa as engines .ts).
// A própria trava de cadência (HISTORY_MIN_DAYS) decide se grava ou pula.
function runScoreHistory() {
  // Desligar um passo não pode desligar os seguintes: cada guarda segue a
  // cadeia em vez de voltar. Com `return` seco, SCORE_HISTORY=off levava junto
  // a reavaliação de planos e a coorte mensal, sem nenhum aviso.
  if (!SCORE_HISTORY) return runOutcomes()
  console.log('[etl] pontuando histórico de score…')
  const child = spawn(process.execPath, ['--import', 'tsx', SCORER], { stdio: 'inherit', env: process.env })
  child.on('exit', (code) => { console.log(`[etl] score-history finalizado (code ${code})`); runOutcomes() })
  child.on('error', (e) => { console.error(`[etl] score-history falhou ao iniciar: ${e.message}`); runOutcomes() })
}

// Reavaliação de impacto dos Planos de Ação. Roda DEPOIS do ETL de propósito:
// o score "depois" só é novo quando o snapshot é novo. Falha aqui não derruba
// o ciclo do ETL — o módulo pode nem estar configurado neste ambiente.
function runOutcomes() {
  if (!OUTCOMES) return runCoorteMensal()
  console.log('[etl] reavaliando impacto dos planos de ação…')
  const child = spawn(process.execPath, ['--import', 'tsx', OUTCOMES_JOB], { stdio: 'inherit', env: process.env })
  child.on('exit', (code) => { console.log(`[etl] reavaliação finalizada (code ${code})`); runCoorteMensal() })
  child.on('error', (e) => { console.error(`[etl] reavaliação falhou ao iniciar: ${e.message}`); runCoorteMensal() })
}

// Coorte mensal — SÓ no dia 1º, publicando o indicador do mês que acabou.
// Em 01/09 sai "o indicador de agosto": os cancelamentos de agosto medidos
// contra a nota congelada em 31/07. A nota precisa ser anterior às saídas,
// senão usaria dados criados pelo próprio cancelamento.
//
// Roda por último no ciclo porque é a parte mais cara (~1 min por mês, varre a
// base inteira) e porque nada depende dela. Falhar aqui não pode derrubar o
// resto do ETL — o artefato anterior continua servindo a tela.
function runCoorteMensal() {
  if (!COORTE_MENSAL) return
  const hoje = new Date()
  if (hoje.getDate() !== COORTE_DIA && !COORTE_FORCAR) {
    console.log(`[etl] coorte mensal: hoje é dia ${hoje.getDate()}, roda no dia ${COORTE_DIA} — pulando.`)
    return
  }
  console.log('[etl] calculando a coorte mensal do mês anterior…')
  const child = spawn(process.execPath, ['--import', 'tsx', COORTE_JOB, '--mes-anterior'], { stdio: 'inherit', env: process.env })
  child.on('exit', (code) => console.log(`[etl] coorte mensal finalizada (code ${code})`))
  child.on('error', (e) => console.error(`[etl] coorte mensal falhou ao iniciar: ${e.message}`))
}

let running = false
function runETL(reason) {
  if (running) { console.log('[etl] já em execução — ignorando gatilho.'); return }
  running = true
  console.log(`[etl] iniciando ETL completo (${reason}) → ${OUT}`)
  // Sob tsx como os demais jobs: o ETL importa a classificação de faixas da
  // engine (.ts) para os cortes não viverem em dois lugares.
  const child = spawn(process.execPath, ['--import', 'tsx', ETL, 'full'], { stdio: 'inherit', env: process.env })
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
