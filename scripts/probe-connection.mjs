import { makePool } from './db.mjs'

// Equipamentos alocados por contrato (base da Connection Engine)
const EQUIP_FROM = `
from patrimony_packing_list_items plis
left join patrimony_packing_lists ppl on ppl.id = plis.patrimony_packing_list_id
left join assignments a on a.id = ppl.assignment_id
left join assignment_incidents ai on ai.assignment_id = a.id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join patrimonies p on p.id = plis.patrimony_id
where c.v_status <> 'Cancelado'
`
const pool = makePool()
try {
  const counts = await pool.query(`
    select
      count(*) total_items,
      count(distinct p.title) distinct_models,
      count(distinct c.contract_number) contracts
    ${EQUIP_FROM}`)
  console.log('COUNTS:', counts.rows[0])

  const top = await pool.query(`select coalesce(p.title,'(sem modelo)') v, count(*) n ${EQUIP_FROM} group by 1 order by n desc limit 25`)
  console.log('\nTOP MODELOS:'); top.rows.forEach((r) => console.log(`  ${String(r.n).padStart(7)}  ${r.v}`))

  const perContract = await pool.query(`
    select avg(cnt)::numeric(10,2) avg_items, max(cnt) max_items
    from (select c.contract_number, count(*) cnt ${EQUIP_FROM} group by c.contract_number) q`)
  console.log('\nITENS POR CONTRATO:', perContract.rows[0])

  const perContractDistinct = await pool.query(`
    select avg(cnt)::numeric(10,2) avg_models, max(cnt) max_models
    from (select c.contract_number, count(distinct p.title) cnt ${EQUIP_FROM} group by c.contract_number) q`)
  console.log('MODELOS DISTINTOS POR CONTRATO:', perContractDistinct.rows[0])
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
