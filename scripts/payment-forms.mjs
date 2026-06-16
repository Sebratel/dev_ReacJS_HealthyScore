import { makePool } from './db.mjs'

const Q = `
select pf.title payment_form, count(distinct c.id) contracts
from authentication_contracts ac
left join contracts c on c.id = ac.contract_id
left join contract_service_tags cst on cst.id = ac.service_tag_id
left join contract_service_tags_catalog_services cst2 on cst2.contract_service_tag_id = cst.id
left join payment_forms pf on pf.id = c.payment_form_id
left join people p on p.id = c.client_id
where cst2.deleted is not true
group by pf.title
order by contracts desc
`
const pool = makePool()
try {
  const { rows } = await pool.query(Q)
  for (const r of rows) console.log(`${String(r.contracts).padStart(7)}  ${r.payment_form ?? '(null)'}`)
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
