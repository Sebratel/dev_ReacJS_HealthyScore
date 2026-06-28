import { makePool } from './db.mjs'

const FROM = `
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join service_desk_slots sds on sds.pre_reserved_assignment_id = a.id
left join people p2 on p2.id = sds.resource_id
where it.active is true and it.code like 'ATV%'
  and a.created >= '2026-01-01' and c.v_status <> 'Cancelado'
`
const pool = makePool()
try {
  const counts = await pool.query(`
    select count(*) total_rows, count(distinct a.id) protocols, count(distinct c.contract_number) contracts,
           count(distinct p2.id) technicians, count(distinct sds.id) schedule_slots
    ${FROM}`)
  console.log('COUNTS:', counts.rows[0])

  // venda -> agenda (primeira agenda por protocolo - data de criação do contrato)
  const s2a = await pool.query(`
    select
      round(avg(days)::numeric,2) avg_days, round(min(days)::numeric,2) min_days, round(max(days)::numeric,2) max_days,
      count(*) protocols_with_sched
    from (
      select a.id, extract(epoch from (min(sds.begin_date) - max(c.created)))/86400.0 days
      ${FROM} and sds.begin_date is not null
      group by a.id
    ) q`)
  console.log('VENDA→AGENDA (dias):', s2a.rows[0])

  const sla = await pool.query(`
    select
      count(distinct a.id) filter (where a.conclusion_date is not null) concluded,
      count(distinct a.id) filter (where a.conclusion_date > ai.responsible_final_date) late_concluded,
      round(avg(extract(epoch from (a.conclusion_date - a.created))/86400.0)::numeric,2) avg_days
    ${FROM}`)
  console.log('SLA:', sla.rows[0])

  const techs = await pool.query(`select p2.name v, count(distinct a.id) n ${FROM} and p2.id is not null group by p2.name order by n desc limit 10`)
  console.log('\nTOP TÉCNICOS:'); techs.rows.forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.v}`))
  const techTotal = await pool.query(`select count(distinct p2.id) n ${FROM} and p2.id is not null`)
  console.log('  TOTAL técnicos:', techTotal.rows[0].n)
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
