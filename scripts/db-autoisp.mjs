// Conexão PostgreSQL (base AutoISP) — usada pelo ETL de quedas de PPPoE
// (onu_status_changes). Lê credenciais do .env (DB_AUTOISP_*); nunca imprime a senha.
import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

export function makeAutoIspPool() {
  const required = ['DB_AUTOISP_HOST', 'DB_AUTOISP_DATABASE', 'DB_AUTOISP_USER', 'DB_AUTOISP_PASSWORD']
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Variáveis ausentes no .env: ${missing.join(', ')}`)
  return new Pool({
    host: process.env.DB_AUTOISP_HOST,
    port: Number(process.env.DB_AUTOISP_PORT) || 5432,
    database: process.env.DB_AUTOISP_DATABASE,
    user: process.env.DB_AUTOISP_USER,
    password: process.env.DB_AUTOISP_PASSWORD,
    ssl: process.env.DB_AUTOISP_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  })
}
