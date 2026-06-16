import { makePool } from './db.mjs'

const FROM = `
from authentication_contracts ac
left join contracts c on c.id = ac.contract_id
left join contract_service_tags cst on cst.id = ac.service_tag_id
left join contract_service_tags_catalog_services cst2 on cst2.contract_service_tag_id = cst.id
left join people p on p.id = c.client_id
left join people p2 on p2.id = c.seller_1_id
where cst2.deleted is not true
`
const pool = makePool()
try {
  const cg = await pool.query(`select coalesce(p.gender::text,'(null)') g, count(distinct c.id) n ${FROM} group by 1 order by n desc limit 10`)
  console.log('GÊNERO CLIENTE:'); cg.rows.forEach((r) => console.log(`  ${String(r.n).padStart(7)}  ${r.g}`))

  const sg = await pool.query(`select coalesce(p2.gender::text,'(null)') g, count(distinct c.id) n ${FROM} group by 1 order by n desc limit 10`)
  console.log('\nGÊNERO VENDEDOR:'); sg.rows.forEach((r) => console.log(`  ${String(r.n).padStart(7)}  ${r.g}`))

  const nulls = await pool.query(`
    select
      count(*) filter (where p.birth_date is null) client_birth_null,
      count(*) filter (where p2.birth_date is null) seller_birth_null,
      count(*) filter (where p2.created is null) seller_admitted_null,
      count(*) total
    ${FROM}`)
  console.log('\nNULOS:', nulls.rows[0])

  const samp = await pool.query(`
    select p.birth_date client_birth, p2.birth_date seller_birth, p2.created seller_admitted
    ${FROM} and p.birth_date is not null and p2.birth_date is not null limit 3`)
  console.log('\nAMOSTRA DATAS:', samp.rows)
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
