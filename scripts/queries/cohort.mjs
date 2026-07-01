// ─────────────────────────────────────────────────────────────────────────
// Coorte ao vivo (PostgreSQL ELLEVEN) para a tela de Pontuação Sugerida.
//
// Monta, para uma janela [from, to], os clientes de um coorte no MESMO shape
// que o ETL produz (RealClient), rodando queries GÊMEAS que só diferem em:
//   - ATIVOS:    c.v_status <> 'Cancelado'  (amostra aleatória, limit)
//   - CANCELADOS:c.v_status  = 'Cancelado'  (cancelados dentro de [from,to])
//
// Tudo é ancorado em `contracts` (NÃO usa authentication_contracts, que não
// existe para cancelados). Por isso a engine de REDE fica de fora aqui — sua
// infra depende de authentication_contracts; entra quando a query de histórico
// de rede dos cancelados chegar. Os campos de rede saem zerados no RealClient.
//
// Datas entram como parâmetros ($n), nunca interpoladas (à prova de injeção).
// ─────────────────────────────────────────────────────────────────────────

const CANCEL_IDS = '(1142,1131,1021,1143,1154)'
const TRUST_DESCRIPTIONS = [
  'Desbloqueio Financeiro realizado pelo cliente através do atendimento telefônico.',
  'Desbloqueio Financeiro realizado pela tela de atendimento ao cliente.',
  'Desbloqueio Financeiro realizado pelo usuário através do Portal de Relacionamento.',
]

// ─── Query-base (identidade + plano + endereço) ────────────────
// Colunas iguais às que o ETL consome. distinct on (c.id) escolhe UM service
// tag por contrato (o de maior valor), evitando duplicar por múltiplos tags.
const BASE_COLUMNS = `
  p.id client_id, p.name client_name, p.gender client_gender, p.birth_date client_birth,
  p2.name seller_name, p2.gender seller_gender, p2.birth_date seller_birth, p2.created seller_admitted,
  c.contract_number, c.created created_contract, c.cancellation_date,
  pf.title payment_form, sp.selling_price, sp.title plan_name,
  p.city, p.neighborhood
`
const BASE_JOINS = `
from contracts c
left join contract_service_tags cst on cst.contract_id = c.id
left join service_products sp on sp.id = cst.service_product_id
left join people p on p.id = c.client_id
left join people p2 on p2.id = c.seller_1_id
left join payment_forms pf on pf.id = c.payment_form_id
`

// ATIVOS: amostra aleatória de contratos ativos (limit $1). A janela [from,to]
// só se aplica aos SINAIS (faturas/protocolos), medidos igual aos cancelados.
const ACTIVE_BASE = `
with base as (
  select id from contracts where v_status <> 'Cancelado' order by random() limit $1
)
select distinct on (c.id) ${BASE_COLUMNS}
${BASE_JOINS}
join base b on b.id = c.id
order by c.id, sp.selling_price desc nulls last
`

// CANCELADOS: contratos cancelados dentro da janela (por cancellation_date).
const CANCELLED_BASE = `
select distinct on (c.id) ${BASE_COLUMNS}
${BASE_JOINS}
where c.v_status = 'Cancelado'
  and c.cancellation_date >= $1::date and c.cancellation_date < ($2::date + 1)
order by c.id, sp.selling_price desc nulls last
`

// ─── Sinais (parametrizados por lista de contratos + janela) ───
// cmp = '<>' (ativos) | '=' (cancelados). $1 = contract_numbers, $2 = from, $3 = to.
function signalQueries(cmp) {
  return {
    // Faturas — 4 estados (on_time/late/overdue/open) + guard de fn nulo
    inv: `
select contract_number,
  count(*) filter (where st = 'on_time') on_time_invoices,
  count(*) filter (where st = 'late')    late_invoices,
  count(*) filter (where st = 'overdue') overdue_invoices,
  count(*) total_invoices
from (
  select c.contract_number,
    case
      when frt2.client_paid_date is null and frt.expiration_date < now() then 'overdue'
      when frt2.client_paid_date is null then 'open'
      when frt2.client_paid_date > frt.expiration_date then 'late'
      else 'on_time'
    end st
  from contracts c
  join financial_receivable_titles frt on frt.contract_id = c.id
  left join financial_receipt_titles frt2 on frt2.financial_receivable_title_id = frt.id
  left join financers_natures fn on fn.id = frt2.financer_nature_id
  where c.v_status ${cmp} 'Cancelado'
    and frt.title like '%FAT%' and frt.deleted = 'False' and frt.renegotiated = 'False'
    and frt.bill_title_id is null
    and (fn.title is null or fn.title <> 'DF - TARIFA BAIXA DE TÍTULO')
    and date(frt.issue_date) >= $2::date and date(frt.issue_date) < ($3::date + 1)
    and c.contract_number::text = any($1::text[])
) q
group by contract_number`,

    reneg: `
select c.contract_number, count(distinct frt.id) renegotiations
from contracts c
join financial_receivable_titles frt on frt.contract_id = c.id
where c.v_status ${cmp} 'Cancelado'
  and frt.title like '%FAT%' and frt.deleted = 'False' and frt.renegotiated = 'True'
  and date(frt.issue_date) >= $2::date and date(frt.issue_date) < ($3::date + 1)
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,

    trust: `
select c.contract_number, count(*) trust_releases
from contracts c
join contract_events ce on ce.contract_id = c.id
where c.v_status ${cmp} 'Cancelado'
  and ce.description in (${TRUST_DESCRIPTIONS.map((d) => `'${d.replace(/'/g, "''")}'`).join(', ')})
  and date(ce."date") >= $2::date and date(ce."date") < ($3::date + 1)
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,

    // Conexão — modelos de equipamento (patrimonies). Sem janela (alocação).
    equip: `
select c.contract_number, array_remove(array_agg(distinct p.title), null) models
from patrimony_packing_list_items plis
left join patrimony_packing_lists ppl on ppl.id = plis.patrimony_packing_list_id
left join assignments a on a.id = ppl.assignment_id
left join assignment_incidents ai on ai.assignment_id = a.id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join patrimonies p on p.id = plis.patrimony_id
where c.v_status ${cmp} 'Cancelado' and p.title is not null
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,

    // Campo (manutenção)
    fieldProt: `
select contract_number,
  count(*) protocol_count,
  count(*) filter (where late) sla_late_count,
  round(avg(sla_days) filter (where sla_days is not null)::numeric, 2) avg_sla_days
from (
  select a.id pid, c.contract_number,
    (max(a.conclusion_date) > max(ai.responsible_final_date))
      or (max(a.conclusion_date) is null and max(ai.responsible_final_date) < now()) late,
    case when max(a.conclusion_date) is not null
      then extract(epoch from (max(a.conclusion_date) - max(a.created))) / 86400.0 end sla_days
  from assignment_incidents ai
  left join assignments a on a.id = ai.assignment_id
  left join incident_types it on it.id = ai.incident_type_id
  left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
  left join contracts c on c.id = cst.contract_id
  left join catalog_services cs on cs.id = ai.catalog_service_id
  where (it.active is true or cs.title in ('Equipe reparo','Equipe tecnologia'))
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status ${cmp} 'Cancelado'
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number`,

    fieldSched: `
select c.contract_number,
  count(distinct sds.id) schedule_count,
  array_remove(array_agg(distinct p2.name), null) technicians
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join catalog_services cs on cs.id = ai.catalog_service_id
left join service_desk_slots sds on sds.pre_reserved_assignment_id = a.id
left join people p2 on p2.id = sds.resource_id
where (it.active is true or cs.title in ('Equipe reparo','Equipe tecnologia'))
  and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status ${cmp} 'Cancelado'
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,

    fieldReasons: `
select contract_number, array_remove(array_agg(distinct cat), null) reasons
from (
  select c.contract_number, unnest(array[ssc1.title, ssc2.title, ssc3.title, ssc4.title]) cat
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
  where (it.active is true or cs.title in ('Equipe reparo','Equipe tecnologia'))
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status ${cmp} 'Cancelado'
    and c.contract_number::text = any($1::text[])
) q
where cat is not null and cat <> ''
group by contract_number`,

    // Instalação (ATV)
    instProt: `
select contract_number,
  count(*) protocol_count,
  count(*) filter (where late) sla_late_count,
  round(avg(sla_days) filter (where sla_days is not null)::numeric, 2) avg_sla_days,
  round(avg(s2a_days) filter (where s2a_days is not null)::numeric, 2) sale_to_schedule_days
from (
  select a.id pid, c.contract_number,
    (max(a.conclusion_date) > max(ai.responsible_final_date))
      or (max(a.conclusion_date) is null and max(ai.responsible_final_date) < now()) late,
    case when max(a.conclusion_date) is not null
      then extract(epoch from (max(a.conclusion_date) - max(a.created))) / 86400.0 end sla_days,
    case when min(sds.begin_date) is not null
      then extract(epoch from (min(sds.begin_date) - max(c.created))) / 86400.0 end s2a_days
  from assignment_incidents ai
  left join assignments a on a.id = ai.assignment_id
  left join incident_types it on it.id = ai.incident_type_id
  left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
  left join contracts c on c.id = cst.contract_id
  left join service_desk_slots sds on sds.pre_reserved_assignment_id = a.id
  where it.active is true and it.code like 'ATV%'
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status ${cmp} 'Cancelado'
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number`,

    instSched: `
select c.contract_number,
  count(distinct sds.id) schedule_count,
  array_remove(array_agg(distinct p2.name), null) technicians
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join service_desk_slots sds on sds.pre_reserved_assignment_id = a.id
left join people p2 on p2.id = sds.resource_id
where it.active is true and it.code like 'ATV%'
  and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status ${cmp} 'Cancelado'
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,

    // Relacionamento (não-ATV/MNT) + ameaças de cancelamento
    relProt: `
select contract_number,
  count(*) protocol_count,
  round(avg(rec_days)::numeric, 1) recurrence_days,
  round(avg(overage_h)::numeric, 2) avg_overage_hours,
  count(*) filter (where is_threat) cancel_threats
from (
  select a.id pid, c.contract_number,
    extract(epoch from (max(a.created) - max(c.created))) / 86400.0 rec_days,
    greatest(0, extract(epoch from (max(a.conclusion_date) - max(ai.responsible_final_date))) / 3600.0) overage_h,
    bool_or(it.id in ${CANCEL_IDS}) is_threat
  from assignment_incidents ai
  left join assignments a on a.id = ai.assignment_id
  left join incident_types it on it.id = ai.incident_type_id
  left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
  left join contracts c on c.id = cst.contract_id
  where it.active is true and not (it.code like 'ATV%' or it.code like 'MNT%')
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status ${cmp} 'Cancelado'
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number`,

    relDim: `
select c.contract_number,
  array_remove(array_agg(distinct it.title), null) protocol_types,
  array_remove(array_agg(distinct p2.name), null) attendant_names
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join people p2 on p2.id = a.responsible_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
where it.active is true and not (it.code like 'ATV%' or it.code like 'MNT%')
  and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status ${cmp} 'Cancelado'
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,
  }
}

// ─── Helpers de mapeamento (mesmos defaults do ETL) ────────────
const toDate = (x) => (x ? new Date(x).toISOString().slice(0, 10) : null)
const arr = (x) => (Array.isArray(x) ? x.filter(Boolean).map((v) => String(v).trim()) : [])
const num = (x) => (x != null ? Number(x) : 0)

function baseRow(r) {
  return {
    clientId: String(r.client_id),
    name: r.client_name?.trim() || 'Cliente sem nome',
    clientGender: r.client_gender != null ? String(r.client_gender) : '(sem gênero)',
    clientBirth: toDate(r.client_birth),
    seller: r.seller_name?.trim() || '(sem vendedor)',
    sellerGender: r.seller_gender != null ? String(r.seller_gender) : '(sem gênero)',
    sellerBirth: toDate(r.seller_birth),
    sellerAdmitted: toDate(r.seller_admitted),
    contractNumber: r.contract_number != null ? String(r.contract_number) : '',
    contractDate: toDate(r.created_contract),
    cancellationDate: toDate(r.cancellation_date),
    plan: r.plan_name?.trim() || 'Sem plano',
    monthlyValue: Number(r.selling_price) || 0,
    paymentForm: r.payment_form?.trim() || 'Não informado',
    city: r.city?.trim() || 'Não informado',
    neighborhood: r.neighborhood?.trim() || '(s/ bairro)',
    // sinais (preenchidos abaixo)
    onTimeInvoices: 0, lateInvoices: 0, overdueInvoices: 0, totalInvoices: 0,
    renegotiations: 0, trustReleases: 0,
    equipment: [],
    protocolCount: 0, scheduleCount: 0, slaLateCount: 0, avgSlaDays: 0, reasons: [], technicians: [],
    installProtocols: 0, installScheduleCount: 0, installSlaLateCount: 0, installAvgSlaDays: 0,
    installSaleToScheduleDays: 0, installTechnicians: [],
    relProtocolCount: 0, relRecurrenceDays: 0, relAvgOverageHours: 0, relCancelThreats: 0,
    relTypes: [], relAttendants: [],
    // Rede — segurada (sem authentication_contracts p/ cancelados)
    netSite: '', netConcentrator: '', netAccessPoint: '', netSplitter: '', netSplitterCode: '',
    netSlot: '', netPon: '', netMassiveCount: 0, netAvgOfflineMin: 0, netAvgOverageMin: 0,
  }
}

// Roda uma query resiliente: falha de UMA não derruba as demais (SQL não testado
// contra o banco daqui — degradar o indicador é melhor que 500 na tela toda).
async function safeQuery(pool, sql, params, label, warnings) {
  try {
    const r = await pool.query(sql, params)
    return r.rows
  } catch (e) {
    warnings.push(`${label}: ${e.message}`)
    return []
  }
}

// ─── Builder principal ─────────────────────────────────────────
export async function buildCohort(pool, { cancelled, from, to, sampleLimit = 15000 }) {
  const cmp = cancelled ? '=' : '<>'
  const warnings = []

  const baseSql = cancelled ? CANCELLED_BASE : ACTIVE_BASE
  const baseParams = cancelled ? [from, to] : [sampleLimit]
  const base = await pool.query(baseSql, baseParams)

  const byContract = new Map()
  for (const r of base.rows) {
    if (!r.contract_number) continue
    const c = baseRow(r)
    if (!byContract.has(c.contractNumber)) byContract.set(c.contractNumber, c)
  }
  const contractNumbers = [...byContract.keys()]
  if (!contractNumbers.length) return { clients: [], warnings }

  const Q = signalQueries(cmp)
  const P = [contractNumbers, from, to]
  const [inv, reneg, trust, equip, fprot, fsched, freasons, iprot, isched, rprot, rdim] = await Promise.all([
    safeQuery(pool, Q.inv, P, 'inv', warnings),
    safeQuery(pool, Q.reneg, P, 'reneg', warnings),
    safeQuery(pool, Q.trust, P, 'trust', warnings),
    safeQuery(pool, Q.equip, [contractNumbers], 'equip', warnings),
    safeQuery(pool, Q.fieldProt, P, 'fieldProt', warnings),
    safeQuery(pool, Q.fieldSched, P, 'fieldSched', warnings),
    safeQuery(pool, Q.fieldReasons, P, 'fieldReasons', warnings),
    safeQuery(pool, Q.instProt, P, 'instProt', warnings),
    safeQuery(pool, Q.instSched, P, 'instSched', warnings),
    safeQuery(pool, Q.relProt, P, 'relProt', warnings),
    safeQuery(pool, Q.relDim, P, 'relDim', warnings),
  ])

  const get = (r) => byContract.get(String(r.contract_number))
  for (const r of inv) { const c = get(r); if (!c) continue; c.onTimeInvoices = num(r.on_time_invoices); c.lateInvoices = num(r.late_invoices); c.overdueInvoices = num(r.overdue_invoices); c.totalInvoices = num(r.total_invoices) }
  for (const r of reneg) { const c = get(r); if (c) c.renegotiations = num(r.renegotiations) }
  for (const r of trust) { const c = get(r); if (c) c.trustReleases = num(r.trust_releases) }
  for (const r of equip) { const c = get(r); if (c) c.equipment = arr(r.models) }
  for (const r of fprot) { const c = get(r); if (!c) continue; c.protocolCount = num(r.protocol_count); c.slaLateCount = num(r.sla_late_count); c.avgSlaDays = num(r.avg_sla_days) }
  for (const r of fsched) { const c = get(r); if (!c) continue; c.scheduleCount = num(r.schedule_count); c.technicians = arr(r.technicians) }
  for (const r of freasons) { const c = get(r); if (c) c.reasons = arr(r.reasons) }
  for (const r of iprot) { const c = get(r); if (!c) continue; c.installProtocols = num(r.protocol_count); c.installSlaLateCount = num(r.sla_late_count); c.installAvgSlaDays = num(r.avg_sla_days); c.installSaleToScheduleDays = num(r.sale_to_schedule_days) }
  for (const r of isched) { const c = get(r); if (!c) continue; c.installScheduleCount = num(r.schedule_count); c.installTechnicians = arr(r.technicians) }
  for (const r of rprot) { const c = get(r); if (!c) continue; c.relProtocolCount = num(r.protocol_count); c.relRecurrenceDays = num(r.recurrence_days); c.relAvgOverageHours = num(r.avg_overage_hours); c.relCancelThreats = num(r.cancel_threats) }
  for (const r of rdim) { const c = get(r); if (!c) continue; c.relTypes = arr(r.protocol_types); c.relAttendants = arr(r.attendant_names) }

  return { clients: [...byContract.values()], warnings }
}
