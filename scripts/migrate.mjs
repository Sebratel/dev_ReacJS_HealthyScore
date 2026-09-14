// ─────────────────────────────────────────────────────────────────────────
// Runner de migrations do Health Score (MariaDB).
//
// Aplica, em ordem numérica, os arquivos de server/migrations/NNN-*.sql que
// ainda não constam em `schema_migrations`. Cria a base se ela não existir —
// assim `npm run migrate` funciona num servidor limpo, sem passo manual.
//
// Cada arquivo roda dentro de UMA transação junto com o registro em
// schema_migrations. Vale a ressalva do MariaDB: DDL faz commit implícito, ou
// seja, um arquivo com vários CREATE TABLE que falhe no meio deixa as tabelas
// anteriores criadas. Por isso cada migration é escrita para ser reexecutável
// (IF NOT EXISTS) e o registro só entra no fim.
//
//   node scripts/migrate.mjs           aplica as pendentes
//   node scripts/migrate.mjs --status  só lista o que falta
// ─────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appDbConfig, APP_DATABASE } from '../server/db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, '../server/migrations')
const STATUS_ONLY = process.argv.includes('--status')

// Divide o arquivo em statements. O MariaDB não aceita vários comandos num
// execute(), então separamos por ';' fora de string/comentário.
function splitStatements(sql) {
  const out = []
  let buf = ''
  let inLine = false, inBlock = false, quote = null
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1]
    if (inLine) { if (c === '\n') { inLine = false; buf += c } continue }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++ } continue }
    if (quote) { buf += c; if (c === '\\') { buf += next ?? ''; i++ } else if (c === quote) quote = null; continue }
    if (c === '-' && next === '-') { inLine = true; i++; continue }
    if (c === '/' && next === '*') { inBlock = true; i++; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; buf += c; continue }
    if (c === ';') { if (buf.trim()) out.push(buf.trim()); buf = ''; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function listMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return []
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}-.+\.sql$/.test(f))
    .sort()
}

export async function runMigrations({ statusOnly = false, log = console.log } = {}) {
  const cfg = appDbConfig()

  // 1) Garante a base. Conexão sem `database` — é a única forma de criá-la.
  const root = await mysql.createConnection({ ...cfg, multipleStatements: false })
  await root.query(
    `create database if not exists \`${APP_DATABASE}\`
     character set utf8mb4 collate utf8mb4_unicode_ci`,
  )
  await root.end()

  const conn = await mysql.createConnection({ ...cfg, database: APP_DATABASE, dateStrings: true })
  await conn.query(`
    create table if not exists schema_migrations (
      version varchar(255) not null primary key,
      applied_at datetime not null default current_timestamp
    ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci
  `)

  const [applied] = await conn.query('select version from schema_migrations')
  const done = new Set(applied.map((r) => r.version))
  const all = listMigrations()
  const pending = all.filter((f) => !done.has(f))

  log(`[migrate] base ${APP_DATABASE} · ${all.length} migration(s), ${done.size} aplicada(s), ${pending.length} pendente(s)`)
  if (statusOnly || !pending.length) {
    for (const f of pending) log(`  pendente: ${f}`)
    await conn.end()
    return { aplicadas: 0, pendentes: pending }
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const statements = splitStatements(sql)
    log(`[migrate] aplicando ${file} (${statements.length} statement(s))…`)
    for (const st of statements) {
      try {
        await conn.query(st)
      } catch (e) {
        // Lança em vez de encerrar o processo: quando a API chama isto no
        // boot, derrubar o processo tiraria do ar as telas que não dependem
        // deste banco (dashboard, engines, assertividade).
        await conn.end()
        throw new Error(`migration ${file} falhou (${e.message}). Statement: ${st.slice(0, 200)}`)
      }
    }
    await conn.execute('insert into schema_migrations (version) values (?)', [file])
    log(`[migrate] ok ${file}`)
  }

  await conn.end()
  log('[migrate] concluído.')
  return { aplicadas: pending.length, pendentes: [] }
}

// Executado direto pela CLI (npm run migrate) — importado pela API, não.
if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  runMigrations({ statusOnly: STATUS_ONLY }).catch((e) => {
    console.error(`[migrate] erro: ${e.message}`)
    process.exit(1)
  })
}
