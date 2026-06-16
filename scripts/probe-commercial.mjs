import { makePool } from './db.mjs'

const FROM = `
from authentication_contracts ac
left join contracts c on c.id = ac.contract_id
left join contract_service_tags cst on cst.id = ac.service_tag_id
left join service_products sp on sp.id = ac.service_product_id
left join contract_service_tags_catalog_services cst2 on cst2.contract_service_tag_id = cst.id
left join people p2 on p2.id = c.seller_1_id
where cst2.deleted is not true
`
const pool = makePool()
try {
  const counts = await pool.query(`
    select
      count(distinct p2.id) as sellers,
      count(distinct sp.title) as plans,
      count(distinct sp.selling_price) as prices,
      count(distinct ac.city) as cities,
      count(distinct ac.neighborhood) as neighborhoods
    ${FROM}
  `)
  console.log('DISTINCT COUNTS:', counts.rows[0])

  const topSellers = await pool.query(`
    select p2.name seller, count(distinct c.id) contracts
    ${FROM} group by p2.name order by contracts desc nulls last limit 15
  `)
  console.log('\nTOP VENDEDORES:'); topSellers.rows.forEach((r) => console.log(`  ${String(r.contracts).padStart(6)}  ${r.seller ?? '(sem vendedor)'}`))

  const prices = await pool.query(`
    select sp.selling_price::numeric price, count(distinct c.id) contracts
    ${FROM} group by sp.selling_price order by contracts desc limit 15
  `)
  console.log('\nTOP VALORES:'); prices.rows.forEach((r) => console.log(`  ${String(r.contracts).padStart(6)}  R$ ${r.price}`))

  const cities = await pool.query(`
    select ac.city, count(distinct c.id) contracts
    ${FROM} group by ac.city order by contracts desc limit 15
  `)
  console.log('\nCIDADES:'); cities.rows.forEach((r) => console.log(`  ${String(r.contracts).padStart(6)}  ${r.city ?? '(s/ cidade)'}`))
} catch (e) {
  console.error('ERRO:', e.message); process.exitCode = 1
} finally { await pool.end() }
