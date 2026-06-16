import { makePool } from './db.mjs'

// Procura tabelas/colunas candidatas a "meio de pagamento real" (boleto/pix/cartão)
const Q_COLS = `
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    column_name ~* 'payment|pagamento|cobranca|cobrança|billing|boleto|pix|card|cartao|cartão|gateway|charge|fatura|invoice'
    or table_name ~* 'payment|pagamento|cobranca|billing|boleto|pix|card|cartao|gateway|charge|fatura|invoice'
  )
order by table_name, column_name
limit 200
`
const pool = makePool()
try {
  const { rows } = await pool.query(Q_COLS)
  let last = ''
  for (const r of rows) {
    if (r.table_name !== last) { console.log(`\n[${r.table_name}]`); last = r.table_name }
    console.log(`   ${r.column_name}  (${r.data_type})`)
  }
  console.log(`\nTotal: ${rows.length} colunas`)
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
