// Teste de conectividade: valida acesso e mostra host/db (sem senha) + 2 linhas.
import { makePool } from './db.mjs'

const SAMPLE = `
select
  p.id client_id, p.name client_name, ac.user,
  c.id contract_id, c.contract_number, c.description contract_name, c.created created_contract,
  cst.service_tag, sp.title plan_name, sp.selling_price, cs.title service_catalogs,
  ac.city, ac.neighborhood, ac.state, p.tx_id cpf_cnpj, p.phone, p.email, ac.lat, ac.lng
from authentication_contracts ac
left join contracts c on c.id = ac.contract_id
left join contract_service_tags cst on cst.id = ac.service_tag_id
left join service_products sp on sp.id = ac.service_product_id
left join contract_service_tags_catalog_services cst2 on cst2.contract_service_tag_id = cst.id
left join catalog_services cs on cs.id = cst2.catalog_service_id
left join people p on p.id = c.client_id
where cst2.deleted is not true
order by p.name asc
limit 2
`

const pool = makePool()
console.log(`Conectando em ${process.env.DB_ELLEVEN_HOST}:${process.env.DB_ELLEVEN_PORT || 5432}/${process.env.DB_ELLEVEN_DATABASE} como ${process.env.DB_ELLEVEN_USER}…`)
try {
  const { rows } = await pool.query(SAMPLE)
  console.log(`OK — ${rows.length} linha(s):`)
  console.log(JSON.stringify(rows, null, 2))
} catch (e) {
  console.error('ERRO:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
