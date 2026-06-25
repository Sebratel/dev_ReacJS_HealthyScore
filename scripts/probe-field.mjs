import { makePool } from './db.mjs'

// Núcleo de joins para protocolos de manutenção (campo)
const FIELD_FROM = `
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join catalog_services cs on cs.id = ai.catalog_service_id
left join solicitation_category_matrices scm on scm.id = ai.solicitation_category_matrix_id
left join solicitation_service_categories ssc1 on ssc1.id = scm.service_category_id_1
left join solicitation_service_categories ssc2 on ssc2.id = scm.service_category_id_2
left join solicitation_service_categories ssc3 on ssc3.id = scm.service_category_id_3
left join solicitation_service_categories ssc4 on ssc4.id = scm.service_category_id_4
left join service_desk_slots sds on sds.pre_reserved_assignment_id = a.id
left join people p2 on p2.id = sds.resource_id
where (it.active is true or cs.title in ('Equipe reparo','Equipe tecnologia'))
  and a.created >= '2026-01-01'
  and c.v_status <> 'Cancelado'
`
const pool = makePool()
try {
  const counts = await pool.query(`
    select
      count(*) total_rows,
      count(distinct a.id) protocols,
      count(distinct c.contract_number) contracts,
      count(distinct p2.id) technicians,
      count(distinct sds.id) schedule_slots
    ${FIELD_FROM}`)
  console.log('COUNTS:', counts.rows[0])

  // protocolos por contrato
  const perC = await pool.query(`
    select avg(cnt)::numeric(10,2) avg_protocols, max(cnt) max_protocols
    from (select c.contract_number, count(distinct a.id) cnt ${FIELD_FROM} group by c.contract_number) q`)
  console.log('PROTOCOLOS/CONTRATO:', perC.rows[0])

  // SLA: concluídos, atrasados, duração média (dias)
  const sla = await pool.query(`
    select
      count(distinct a.id) filter (where a.conclusion_date is not null) concluded,
      count(distinct a.id) filter (where a.conclusion_date is not null and a.conclusion_date > ai.responsible_final_date) late_concluded,
      count(distinct a.id) filter (where a.conclusion_date is null and ai.responsible_final_date < now()) open_overdue,
      avg(extract(epoch from (a.conclusion_date - a.created))/86400.0) filter (where a.conclusion_date is not null)::numeric(10,2) avg_days
    ${FIELD_FROM}`)
  console.log('SLA:', sla.rows[0])

  // motivos (union das 4 categorias)
  const reasons = await pool.query(`
    select cat v, count(distinct a.id) n from (
      select a.id, unnest(array[ssc1.title, ssc2.title, ssc3.title, ssc4.title]) cat ${FIELD_FROM}
    ) q where cat is not null and cat <> '' group by cat order by n desc limit 20`)
  console.log('\nMOTIVOS (categorias) — distintos no top 20:')
  reasons.rows.forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.v}`))
  const reasonsTotal = await pool.query(`
    select count(distinct cat) n from (
      select unnest(array[ssc1.title, ssc2.title, ssc3.title, ssc4.title]) cat ${FIELD_FROM}
    ) q where cat is not null and cat <> ''`)
  console.log('  TOTAL distinct motivos:', reasonsTotal.rows[0].n)

  const techs = await pool.query(`select p2.name v, count(distinct a.id) n ${FIELD_FROM} and p2.id is not null group by p2.name order by n desc limit 12`)
  console.log('\nTOP TÉCNICOS:'); techs.rows.forEach((r) => console.log(`  ${String(r.n).padStart(6)}  ${r.v}`))
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
