// ─────────────────────────────────────────────────────────────────────────
// Job de reavaliação de impacto dos Planos de Ação.
//
// Roda logo depois do ETL (o "depois" só existe quando o snapshot é novo) e
// também pode ser chamado à mão. Sai com código 0 mesmo quando não há nada a
// fazer ou quando o módulo não está configurado neste ambiente — o ETL não
// deve falhar por causa disso.
//
//   node --import tsx scripts/evaluate-outcomes.mjs [--dias 30]
//
// Roda sob tsx porque a cadeia de imports chega nas engines .ts.
// ─────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { runOutcomeEvaluation, DEFAULT_PRAZO_DIAS } from '../server/actionPlans/outcomes.mjs'
import { closePool } from '../server/db.mjs'

const argIdx = process.argv.indexOf('--dias')
const dias = argIdx > -1 ? Number(process.argv[argIdx + 1]) : DEFAULT_PRAZO_DIAS

try {
  const out = await runOutcomeEvaluation({ prazoDias: Number.isFinite(dias) ? dias : DEFAULT_PRAZO_DIAS })
  if (!out.total) console.log('[outcomes] nenhuma tarefa vencida para reavaliar.')
  else console.log(`[outcomes] ${out.avaliadas} avaliada(s), ${out.semDados} sem dados, de ${out.total} · régua ${out.configVersao}`)
} catch (e) {
  // Ambiente sem banco, sem snapshot ou sem config oficial: registrar e sair
  // limpo. É estado esperado em dev, não erro do ciclo do ETL.
  console.warn(`[outcomes] não executado: ${e.message}`)
} finally {
  await closePool().catch(() => {})
}
