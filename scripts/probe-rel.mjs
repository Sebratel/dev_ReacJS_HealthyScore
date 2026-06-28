import { makePool } from './db.mjs'

const FROM = `
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join people p2 on p2.id = a.responsible_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
where it.active is true
  and not (it.code like 'ATV%' or it.code like 'MNT%')
  and a.created >= '2026-01-01' and c.v_status <> 'Cancelado'
`
const pool = makePool()
try {
  const counts = await pool.query(`
    select count(*) total_rows, count(distinct a.id) protocols, count(distinct c.contract_number) contracts,
      count(distinct it.title) protocol_types, count(distinct p2.id) attendants,
      count(distinct a.id) filter (where it.id in (1142,1131,1021,1143,1154)) cancel_threats
    ${FROM}`)
  console.log('COUNTS:', counts.rows[0])

  // recorrência venda -> abertura (dias)
  const rec = await pool.query(`
    select round(avg(days)::numeric,1) avg_days, round(min(days)::numeric,1) min_days, round(max(days)::numeric,1) max_days
    from (select a.id, extract(epoch from (max(a.created) - max(c.created)))/86400.0 days ${FROM} group by a.id) q`)
  console.log('RECORRÊNCIA venda→abertura (dias):', rec.rows[0])

  // SLA overage (conclusion - final_deadline) em horas, quando atrasado
  const sla = await pool.query(`
    select
      count(distinct a.id) filter (where a.conclusion_date > ai.responsible_final_date) late,
      round(avg(extract(epoch from (a.conclusion_date - ai.responsible_final_date))/3600.0) filter (where a.conclusion_date > ai.responsible_final_date)::numeric,2) avg_late_hours
    ${FROM}`)
  console.log('SLA overage:', sla.rows[0])

  const types = await pool.query(`select it.title v, count(distinct a.id) n ${FROM} group by it.title order by n desc limit 15`)
  console.log('\nTIPOS DE PROTOCOLO (top):'); types.rows.forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.v}`))
  const typesTotal = await pool.query(`select count(distinct it.title) n ${FROM}`)
  console.log('  TOTAL tipos:', typesTotal.rows[0].n)

  const att = await pool.query(`select p2.name v, count(distinct a.id) n ${FROM} and p2.id is not null group by p2.name order by n desc limit 10`)
  console.log('\nATENDENTES (top):'); att.rows.forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.v}`))
  const attTotal = await pool.query(`select count(distinct p2.id) n ${FROM} and p2.id is not null`)
  console.log('  TOTAL atendentes:', attTotal.rows[0].n)
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
