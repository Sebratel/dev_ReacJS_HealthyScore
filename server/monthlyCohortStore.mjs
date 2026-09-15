// ─────────────────────────────────────────────────────────────────────────
// Leitor do artefato da coorte mensal (gerado por scripts/monthly-cohort.mjs).
//
// O cálculo varre a base inteira e leva ~1 min por mês, então NÃO roda por
// requisição: o job grava o JSON no volume e a API só serve o que está lá.
// Recarrega sozinho quando o arquivo muda (mtime).
//
//   MONTHLY_COHORT_PATH  default: <dir do SNAPSHOT_PATH>/monthly-cohort.json
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'

const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH
  ? resolve(process.env.SNAPSHOT_PATH)
  : resolve(process.cwd(), 'public/realClients.data')
const ARQUIVO = process.env.MONTHLY_COHORT_PATH
  ? resolve(process.env.MONTHLY_COHORT_PATH)
  : join(dirname(SNAPSHOT_PATH), 'monthly-cohort.json')

let cache = null
let cacheMtime = 0

export function getMonthlyCohort() {
  if (!existsSync(ARQUIVO)) {
    return {
      disponivel: false,
      motivo: 'A coorte mensal ainda não foi calculada. Ela roda no dia 1º junto com o ETL; para gerar agora: npm run cohort:mensal -- --mes-atual',
      caminho: ARQUIVO,
    }
  }
  try {
    const mtime = statSync(ARQUIVO).mtimeMs
    if (!cache || mtime !== cacheMtime) {
      cache = JSON.parse(readFileSync(ARQUIVO, 'utf8'))
      cacheMtime = mtime
    }
  } catch (e) {
    return { disponivel: false, motivo: `Artefato da coorte ilegível: ${e.message}`, caminho: ARQUIVO }
  }

  const pontos = Array.isArray(cache?.pontos) ? cache.pontos : []
  if (!pontos.length) {
    return { disponivel: false, motivo: 'Artefato da coorte sem nenhum mês calculado.', caminho: ARQUIVO }
  }

  // O mês EM CURSO é a leitura principal da tela; os fechados formam o
  // histórico. Separar aqui evita que cada consumidor refaça esse filtro e
  // acabe misturando mês aberto com mês fechado numa média só.
  const atual = pontos.find((p) => p.parcial) ?? null
  const fechados = pontos.filter((p) => !p.parcial)

  return {
    disponivel: true,
    geradoEm: cache.geradoEm ?? null,
    configVersion: cache.configVersion ?? null,
    enginesIndisponiveisNoPassado: cache.enginesIndisponiveisNoPassado ?? [],
    atual,
    fechados,
    resumo: cache.resumo ?? null,
    avisos: Array.isArray(cache.avisos) ? cache.avisos : [],
  }
}

export function getMonthlyCohortVersion() {
  try {
    return existsSync(ARQUIVO) ? String(statSync(ARQUIVO).mtimeMs) : '0'
  } catch {
    return '0'
  }
}
