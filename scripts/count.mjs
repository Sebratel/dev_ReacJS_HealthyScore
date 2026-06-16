import { makePool } from './db.mjs'

const Q = `
select count(*) total, count(distinct p.id) clientes, count(distinct c.id) contratos
from authentication_contracts ac
left join contracts c on c.id = ac.contract_id
left join contract_service_tags cst on cst.id = ac.service_tag_id
left join contract_service_tags_catalog_services cst2 on cst2.contract_service_tag_id = cst.id
left join people p on p.id = c.client_id
where cst2.deleted is not true
`
const pool = makePool()
try {
  const { rows } = await pool.query(Q)
  console.log(rows[0])
} catch (e) {
  console.error('ERRO:', e.message); process.exitCode = 1
} finally { await pool.end() }
