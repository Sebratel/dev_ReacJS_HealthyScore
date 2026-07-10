// ─────────────────────────────────────────────────────────────────────────
// Verificação de PARIDADE: garante que o SQL gerado pelo registro novo é
// equivalente ao SQL original (committed) de fetch-clients.mjs — ou seja, sem
// nenhum override o ETL roda idêntico ao comportamento anterior.
//
// Estratégia (independente): extrai do git a versão original do ETL, executa
// APENAS as definições de query (com o banco "stubado") e compara com o que o
// registro renderiza, normalizando espaços em branco (irrelevantes p/ o SQL).
// Também valida que todo SQL default passa no guard somente-leitura.
//
// Uso:  node scripts/queries/check-parity.mjs
// ─────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { QUERIES, getDefaultSql } from './registry.mjs'
import { checkReadOnly } from './guard.mjs'

const IDS = QUERIES.map((q) => q.id)
const norm = (s) => s.replace(/\s+/g, ' ').trim()

// Extrai os SQL originais do git, rodando só as definições (sem DB nem ETL).
function loadOriginalSql(argv2) {
  const original = execSync('git show HEAD:scripts/fetch-clients.mjs', { encoding: 'utf8' })
  // Pega tudo ANTES do bloco de execução `try {`.
  let head = original.split('\ntry {')[0]
  // URL real do diretório scripts/ — o módulo extraído roda de um tmpdir, então
  // os imports relativos do ETL precisam ser reapontados para cá.
  const scriptsDir = new URL('..', import.meta.url).href
  head = head
    .replace(/import \{ makePool \} from '\.\/db\.mjs'\n?/, '')
    .replace(/import \{ makeMariaPool \} from '\.\/db-maria\.mjs'\n?/, '')
    .replace(/import \{ makeAutoIspPool \} from '\.\/db-autoisp\.mjs'\n?/, '')
    .replace(/const pool = makePool\(\)/, 'const pool = null')
    .replace(/from '\.\//g, `from '${scriptsDir}`)
  // Define process.argv ANTES do código (controla FULL/amostra).
  const preamble = `process.argv = ['node', 'etl'${argv2 ? `, ${JSON.stringify(argv2)}` : ''}]\n`
  // Exporta só as queries que EXISTEM no ETL do HEAD — queries recém-adicionadas
  // ao registro (ainda sem uso committed) são puladas na paridade.
  const definedIds = IDS.filter((id) => new RegExp(`\\b${id}\\b`).test(head))
  const exportLine = `\nexport { ${definedIds.join(', ')} }\n`
  const dir = mkdtempSync(join(tmpdir(), 'qparity-'))
  const file = join(dir, `orig-${argv2 || 'sample'}.mjs`)
  writeFileSync(file, preamble + head + exportLine, 'utf8')
  return import(pathToFileURL(file).href)
}

let failures = 0
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`) }

// 1) Paridade em modo AMOSTRA (full=false) para todas as queries.
const origSample = await loadOriginalSql(null)
for (const id of IDS) {
  if (origSample[id] === undefined) {
    console.log(`  • ${id}: sem original no HEAD (query nova) — paridade pulada; validada só no guard.`)
    continue
  }
  const a = norm(getDefaultSql(id, { full: false }))
  const b = norm(origSample[id])
  if (a !== b) {
    fail(`${id}: SQL difere do original (amostra)`)
    console.error(`     registro: ${a.slice(0, 120)}…`)
    console.error(`     original: ${b.slice(0, 120)}…`)
  }
}

// 2) Paridade da Q_SAMPLE em modo BASE COMPLETA (full=true).
const origFull = await loadOriginalSql('full')
{
  const a = norm(getDefaultSql('Q_SAMPLE', { full: true }))
  const b = norm(origFull['Q_SAMPLE'])
  if (a !== b) fail('Q_SAMPLE: SQL difere do original (base completa)')
}

// 3) Guard: todo SQL default deve passar como somente-leitura.
for (const id of IDS) {
  const check = checkReadOnly(getDefaultSql(id, { full: false }))
  if (!check.ok) fail(`${id}: guard rejeitou o SQL default — ${check.reason}`)
}

if (failures) {
  console.error(`\n✗ Paridade FALHOU em ${failures} verificação(ões).`)
  process.exit(1)
} else {
  console.log(`✓ Paridade OK — ${IDS.length} queries idênticas ao original e aprovadas no guard.`)
}
