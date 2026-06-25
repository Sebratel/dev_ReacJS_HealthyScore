// ETL: lê clientes ativos + sinais financeiros REAIS da base ELLEVEN (PostgreSQL)
// e gera src/data/realClients.json. NENHUM dado mockado.
//   - amostra de N clientes (identidade real)
//   - por contrato (contract_number): faturas no prazo / atrasadas / em aberto,
//     renegociações e desbloqueios por confiança
//   - formas de pagamento ativas (para config dinâmica)
//   - série mensal real de adimplência + totais reais (clientes, contratos, MRR)
// Uso: node scripts/fetch-clients.mjs [sampleSize=2000]
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { makePool } from './db.mjs'
import { makeMariaPool } from './db-maria.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../src/data/realClients.json')
const SAMPLE_SIZE = Number(process.argv[2]) || 2000
const FROM_DATE = '2026-01-01'

// ─── Base (clientes/contratos ativos) ──────────────────────────
const BASE_FROM = `
from authentication_contracts ac
left join contracts c on c.id = ac.contract_id
left join contract_service_tags cst on cst.id = ac.service_tag_id
left join service_products sp on sp.id = ac.service_product_id
left join contract_service_tags_catalog_services cst2 on cst2.contract_service_tag_id = cst.id
left join catalog_services cs on cs.id = cst2.catalog_service_id
left join payment_forms pf on pf.id = c.payment_form_id
left join people p on p.id = c.client_id
left join people p2 on p2.id = c.seller_1_id
where cst2.deleted is not true
`

const Q_TOTALS = `
select count(distinct p.id) clients, count(distinct c.id) contracts,
       coalesce(sum(sp.selling_price::numeric),0) mrr
${BASE_FROM}
`

const Q_BY_CITY = `
select ac.city, count(distinct c.id) contracts, coalesce(sum(sp.selling_price::numeric),0) mrr
${BASE_FROM}
group by ac.city order by contracts desc limit 30
`

const Q_PAYFORMS = `select title from payment_forms where active is true order by title`

const Q_SAMPLE = `
select
  p.id client_id, p.name client_name, p.gender client_gender, p.birth_date client_birth,
  p2.name seller_name, p2.gender seller_gender, p2.birth_date seller_birth, p2.created seller_admitted,
  c.contract_number, c.created created_contract,
  pf.title payment_form,
  sp.title plan_name, sp.selling_price,
  ac.city, ac.neighborhood, ac.street, ac.street_number, ac.state,
  p.tx_id cpf_cnpj, p.phone, p.email, ac.lat, ac.lng
${BASE_FROM}
order by random()
limit $1
`

// Listas distinct para o config comercial (base inteira, com contagem)
const Q_COMM_SELLERS = `select coalesce(p2.name,'(sem vendedor)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`
const Q_COMM_PLANS   = `select coalesce(sp.title,'(sem plano)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`
const Q_COMM_VALUES  = `select coalesce(sp.selling_price::numeric,0) v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`
const Q_COMM_CITIES  = `select coalesce(ac.city,'(s/ cidade)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`
const Q_COMM_HOODS   = `select coalesce(ac.neighborhood,'(s/ bairro)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`
const Q_COMM_CGENDER = `select coalesce(p.gender::text,'(sem gênero)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`
const Q_COMM_SGENDER = `select coalesce(p2.gender::text,'(sem gênero)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`

// ─── Connection Engine — equipamentos alocados ────────────────
const EQUIP_FROM = `
from patrimony_packing_list_items plis
left join patrimony_packing_lists ppl on ppl.id = plis.patrimony_packing_list_id
left join assignments a on a.id = ppl.assignment_id
left join assignment_incidents ai on ai.assignment_id = a.id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join patrimonies p on p.id = plis.patrimony_id
where c.v_status <> 'Cancelado' and p.title is not null
`
// Modelos distintos por contrato (filtrado à amostra)
const Q_CONN_AGG = `
select c.contract_number, array_agg(distinct p.title) models
${EQUIP_FROM} and c.contract_number::text = any($1::text[])
group by c.contract_number
`
// Lista de modelos distintos (base inteira) para config
const Q_CONN_MODELS = `select p.title v, count(*) n ${EQUIP_FROM} group by p.title order by n desc`

// ─── Field Engine — protocolos de manutenção ──────────────────
// FROM/JOINs base (sem WHERE) + cláusula WHERE separada (joins extras entram ANTES do where)
const FIELD_FROM = `
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join catalog_services cs on cs.id = ai.catalog_service_id
`
const FIELD_CAT_JOIN = `
left join solicitation_category_matrices scm on scm.id = ai.solicitation_category_matrix_id
left join solicitation_service_categories ssc1 on ssc1.id = scm.service_category_id_1
left join solicitation_service_categories ssc2 on ssc2.id = scm.service_category_id_2
left join solicitation_service_categories ssc3 on ssc3.id = scm.service_category_id_3
left join solicitation_service_categories ssc4 on ssc4.id = scm.service_category_id_4
`
const FIELD_SCHED_JOIN = `
left join service_desk_slots sds on sds.pre_reserved_assignment_id = a.id
left join people p2 on p2.id = sds.resource_id
`
const FIELD_WHERE = `
where (it.active is true or cs.title in ('Equipe reparo','Equipe tecnologia'))
  and a.created >= '${FROM_DATE}'
  and c.v_status <> 'Cancelado'
`

// Protocolos / SLA por contrato (nível protocolo, filtrado à amostra)
const Q_FIELD_PROT = `
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
  ${FIELD_FROM} ${FIELD_WHERE}
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number
`

// Agendamentos + técnicos por contrato
const Q_FIELD_SCHED = `
select c.contract_number,
  count(distinct sds.id) schedule_count,
  array_remove(array_agg(distinct p2.name), null) technicians
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${FIELD_WHERE}
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`

// Motivos (categorias 1-4) por contrato
const Q_FIELD_REASONS = `
select contract_number, array_remove(array_agg(distinct cat), null) reasons
from (
  select c.contract_number, unnest(array[ssc1.title, ssc2.title, ssc3.title, ssc4.title]) cat
  ${FIELD_FROM} ${FIELD_CAT_JOIN} ${FIELD_WHERE}
    and c.contract_number::text = any($1::text[])
) q
where cat is not null and cat <> ''
group by contract_number
`

// Listas distintas (base inteira) para config
const Q_FIELD_REASON_LIST = `
select cat v, count(distinct pid) n from (
  select a.id pid, unnest(array[ssc1.title, ssc2.title, ssc3.title, ssc4.title]) cat
  ${FIELD_FROM} ${FIELD_CAT_JOIN} ${FIELD_WHERE}
) q where cat is not null and cat <> '' group by cat order by n desc
`
const Q_FIELD_TECH_LIST = `
select p2.name v, count(distinct a.id) n
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${FIELD_WHERE} and p2.id is not null
group by p2.name order by n desc
`

// ─── Installation Engine — protocolos de instalação (ATV) ─────
// Mesma estrutura da field, filtro it.code like 'ATV%'. contract_created = data da venda.
const INST_WHERE = `
where it.active is true and it.code like 'ATV%'
  and a.created >= '${FROM_DATE}'
  and c.v_status <> 'Cancelado'
`
// Protocolo / SLA / venda→agenda por contrato (nível protocolo + sds p/ 1ª agenda)
const Q_INST_PROT = `
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
  ${FIELD_FROM} ${FIELD_SCHED_JOIN} ${INST_WHERE}
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number
`
// Agendamentos + técnicos por contrato
const Q_INST_SCHED = `
select c.contract_number,
  count(distinct sds.id) schedule_count,
  array_remove(array_agg(distinct p2.name), null) technicians
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${INST_WHERE}
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`
const Q_INST_TECH_LIST = `
select p2.name v, count(distinct a.id) n
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${INST_WHERE} and p2.id is not null
group by p2.name order by n desc
`

// ─── Relationship Engine — protocolos de relacionamento ───────
const REL_FROM = `
from assignment_incidents ai
left join assignments a on a.id = ai.assignment_id
left join incident_types it on it.id = ai.incident_type_id
left join people p2 on p2.id = a.responsible_id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
`
const REL_WHERE = `
where it.active is true
  and not (it.code like 'ATV%' or it.code like 'MNT%')
  and a.created >= '${FROM_DATE}' and c.v_status <> 'Cancelado'
`
const CANCEL_IDS = '(1142,1131,1021,1143,1154)'

// Protocolo / recorrência / atraso SLA / ameaças por contrato (nível protocolo)
const Q_REL_PROT = `
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
  ${REL_FROM} ${REL_WHERE}
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number
`
// Tipos de protocolo + atendentes por contrato
const Q_REL_DIM = `
select c.contract_number,
  array_remove(array_agg(distinct it.title), null) protocol_types,
  array_remove(array_agg(distinct p2.name), null) attendant_names
${REL_FROM} ${REL_WHERE}
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`
// Listas distintas (base inteira) para config
const Q_REL_TYPE_LIST = `select it.title v, count(distinct a.id) n ${REL_FROM} ${REL_WHERE} and it.title is not null group by it.title order by n desc`
const Q_REL_ATT_LIST = `select p2.name v, count(distinct a.id) n ${REL_FROM} ${REL_WHERE} and p2.id is not null group by p2.name order by n desc`

// ─── Network Engine — massivas (MariaDB) × infra (PostgreSQL) ──
// Agregado de massivas por splitter_code (MariaDB)
const Q_MARIA_SPLITTER = `
select mhs.splitter_code,
  count(*) massive_count,
  round(avg(timestampdiff(minute, coalesce(mh.event_identified_at, mh.opened_at), mh.closed_at)), 2) avg_offline_min,
  round(avg(case when mh.closed_at > mh.expected_close_at then timestampdiff(minute, mh.expected_close_at, mh.closed_at) end), 2) avg_overage_min
from DB_Massives.massiva_history mh
left join DB_Massives.massiva_history_splitters mhs on mhs.massiva_history_id = mh.id
where mhs.splitter_code is not null and mh.closed_at is not null
group by mhs.splitter_code
`
// Infra dos clientes da amostra que estão em splitters afetados (PostgreSQL)
const Q_NET_INFRA = `
select p.id::text client_id, as3.code splitter_code,
  as2.title site, ac2.title concentrator, aap.title access_point, as3.title splitter,
  ac.slot_olt slot, ac.port_olt pon
from authentication_contracts ac
left join authentication_concentrators ac2 on ac2.id = ac.authentication_concentrator_id
left join authentication_access_points aap on aap.id = ac.authentication_access_point_id
left join contracts c on c.id = ac.contract_id
left join authentication_sites as2 on as2.id = ac2.authentication_site_id
left join authentication_splitter_ports asp on asp.authentication_contract_id = ac.id
left join authentication_splitters as3 on as3.id = asp.authentication_splitter_id
left join people p on p.id = c.client_id
where p.id::text = any($1::text[]) and as3.code = any($2::text[])
`

// Status de cada fatura (definição refinada da regra do usuário):
//   on_time = paga até o vencimento | late = paga após o vencimento
//   overdue = sem pagamento e já vencida | open = sem pagamento e a vencer
const INV_STATUS = `
  case
    when frt2.client_paid_date is null and frt.expiration_date < now() then 'overdue'
    when frt2.client_paid_date is null then 'open'
    when frt2.client_paid_date > frt.expiration_date then 'late'
    else 'on_time'
  end
`
const INV_BASE = (extraWhere) => `
  from contracts c
  join financial_receivable_titles frt on frt.contract_id = c.id
  left join financial_receipt_titles frt2 on frt2.financial_receivable_title_id = frt.id
  left join financers_natures fn on fn.id = frt2.financer_nature_id
  where c.v_status <> 'Cancelado'
    and frt.title like '%FAT%'
    and frt.deleted = 'False'
    and frt.renegotiated = 'False'
    and frt.bill_title_id is null
    and (fn.title is null or fn.title <> 'DF - TARIFA BAIXA DE TÍTULO')
    and date(frt.issue_date) >= '${FROM_DATE}'
    ${extraWhere}
`

// Faturas por contrato (filtrado à amostra)
const Q_INV_AGG = `
select contract_number,
  count(*) filter (where st = 'on_time') on_time_invoices,
  count(*) filter (where st = 'late')    late_invoices,
  count(*) filter (where st = 'overdue') overdue_invoices,
  count(*) total_invoices
from (
  select c.contract_number, ${INV_STATUS} st
  ${INV_BASE('and c.contract_number::text = any($1::text[])')}
) q
group by contract_number
`

// Renegociações por contrato (títulos FAT renegotiated=True)
const Q_RENEG_AGG = `
select c.contract_number, count(distinct frt.id) renegotiations
from contracts c
join financial_receivable_titles frt on frt.contract_id = c.id
where c.v_status <> 'Cancelado'
  and frt.title like '%FAT%' and frt.deleted = 'False' and frt.renegotiated = 'True'
  and date(frt.issue_date) >= '${FROM_DATE}'
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`

// Desbloqueios por confiança por contrato
const Q_TRUST_AGG = `
select c.contract_number, count(*) trust_releases
from contracts c
join contract_events ce on ce.contract_id = c.id
where c.v_status <> 'Cancelado'
  and ce.description in (
    'Desbloqueio Financeiro realizado pelo cliente através do atendimento telefônico.',
    'Desbloqueio Financeiro realizado pela tela de atendimento ao cliente.',
    'Desbloqueio Financeiro realizado pelo usuário através do Portal de Relacionamento.'
  )
  and date(ce."date") >= '${FROM_DATE}'
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`

const pool = makePool()
console.log(`Conectado em ${process.env.DB_ELLEVEN_HOST}/${process.env.DB_ELLEVEN_DATABASE}. Coletando…`)

// Série mensal real de adimplência (base inteira)
const Q_MONTHLY_OK = `
select ym,
  count(*) filter (where st = 'on_time') on_time,
  count(*) filter (where st = 'late')    late,
  count(*) filter (where st = 'overdue') overdue
from (
  select to_char(date_trunc('month', frt.issue_date), 'YYYY-MM') ym, ${INV_STATUS} st
  ${INV_BASE('')}
) q
group by ym order by ym
`

try {
  const [totals, byCity, payforms, sample, commSellers, commPlans, commValues, commCities, commHoods, commCGender, commSGender, connModels, fieldReasonList, fieldTechList, instTechList, relTypeList, relAttList] = await Promise.all([
    pool.query(Q_TOTALS),
    pool.query(Q_BY_CITY),
    pool.query(Q_PAYFORMS),
    pool.query(Q_SAMPLE, [Math.ceil(SAMPLE_SIZE * 1.25)]),
    pool.query(Q_COMM_SELLERS),
    pool.query(Q_COMM_PLANS),
    pool.query(Q_COMM_VALUES),
    pool.query(Q_COMM_CITIES),
    pool.query(Q_COMM_HOODS),
    pool.query(Q_COMM_CGENDER),
    pool.query(Q_COMM_SGENDER),
    pool.query(Q_CONN_MODELS),
    pool.query(Q_FIELD_REASON_LIST),
    pool.query(Q_FIELD_TECH_LIST),
    pool.query(Q_INST_TECH_LIST),
    pool.query(Q_REL_TYPE_LIST),
    pool.query(Q_REL_ATT_LIST),
  ])

  const t = totals.rows[0]
  console.log(`Totais: ${t.clients} clientes, ${t.contracts} contratos, MRR R$ ${Number(t.mrr).toLocaleString('pt-BR')}`)

  // Dedupe por cliente (mantém 1 contrato por cliente), soma MRR dos contratos
  const byClient = new Map()
  for (const r of sample.rows) {
    const price = Number(r.selling_price) || 0
    if (byClient.has(r.client_id)) continue // mantém o contrato primário (1º)
    const toDate = (x) => (x ? new Date(x).toISOString().slice(0, 10) : null)
    byClient.set(r.client_id, {
      clientId: String(r.client_id),
      name: r.client_name?.trim() || 'Cliente sem nome',
      clientGender: r.client_gender != null ? String(r.client_gender) : '(sem gênero)',
      clientBirth: toDate(r.client_birth),
      seller: r.seller_name?.trim() || '(sem vendedor)',
      sellerGender: r.seller_gender != null ? String(r.seller_gender) : '(sem gênero)',
      sellerBirth: toDate(r.seller_birth),
      sellerAdmitted: toDate(r.seller_admitted),
      contractNumber: r.contract_number != null ? String(r.contract_number) : '',
      contractDate: r.created_contract ? new Date(r.created_contract).toISOString().slice(0, 10) : null,
      plan: r.plan_name?.trim() || 'Sem plano',
      monthlyValue: price,
      paymentForm: r.payment_form?.trim() || 'Não informado',
      city: r.city?.trim() || 'Não informado',
      neighborhood: r.neighborhood?.trim() || '(s/ bairro)',
      state: r.state?.trim() || '',
      cpfCnpj: r.cpf_cnpj ?? '',
      phone: r.phone ?? '',
      email: r.email ?? '',
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      // sinais reais (preenchidos abaixo)
      onTimeInvoices: 0, lateInvoices: 0, overdueInvoices: 0, totalInvoices: 0,
      renegotiations: 0, trustReleases: 0,
      equipment: [],
      protocolCount: 0, scheduleCount: 0, slaLateCount: 0, avgSlaDays: 0,
      reasons: [], technicians: [],
      installProtocols: 0, installScheduleCount: 0, installSlaLateCount: 0,
      installAvgSlaDays: 0, installSaleToScheduleDays: 0, installTechnicians: [],
      relProtocolCount: 0, relRecurrenceDays: 0, relAvgOverageHours: 0,
      relCancelThreats: 0, relTypes: [], relAttendants: [],
      netSite: '', netConcentrator: '', netAccessPoint: '', netSplitter: '', netSplitterCode: '',
      netSlot: '', netPon: '', netMassiveCount: 0, netAvgOfflineMin: 0, netAvgOverageMin: 0,
    })
  }
  const clients = Array.from(byClient.values()).slice(0, SAMPLE_SIZE)
  const byContract = new Map(clients.filter((c) => c.contractNumber).map((c) => [c.contractNumber, c]))
  const byClientId = new Map(clients.map((c) => [c.clientId, c]))
  const contractNumbers = Array.from(byContract.keys())
  const clientIds = clients.map((c) => c.clientId)
  console.log(`Amostra: ${clients.length} clientes, ${contractNumbers.length} contratos. Buscando sinais financeiros…`)

  // MariaDB — massivas por splitter_code (cross-DB)
  const maria = await makeMariaPool()
  const massiveBySplitter = new Map()
  try {
    const [rows] = await maria.query(Q_MARIA_SPLITTER)
    for (const r of rows) {
      massiveBySplitter.set(String(r.splitter_code), {
        count: Number(r.massive_count),
        offline: r.avg_offline_min != null ? Number(r.avg_offline_min) : 0,
        overage: r.avg_overage_min != null ? Number(r.avg_overage_min) : 0,
      })
    }
  } finally { await maria.end() }
  const massiveCodes = Array.from(massiveBySplitter.keys())
  const totalMassives = Array.from(massiveBySplitter.values()).reduce((a, v) => a + v.count, 0)
  console.log(`Massivas (MariaDB): ${totalMassives} em ${massiveCodes.length} splitters.`)

  const [inv, reneg, trust, monthly, equip, fieldProt, fieldSched, fieldReasons, instProt, instSched, relProt, relDim, netInfra] = await Promise.all([
    pool.query(Q_INV_AGG, [contractNumbers]),
    pool.query(Q_RENEG_AGG, [contractNumbers]),
    pool.query(Q_TRUST_AGG, [contractNumbers]),
    pool.query(Q_MONTHLY_OK),
    pool.query(Q_CONN_AGG, [contractNumbers]),
    pool.query(Q_FIELD_PROT, [contractNumbers]),
    pool.query(Q_FIELD_SCHED, [contractNumbers]),
    pool.query(Q_FIELD_REASONS, [contractNumbers]),
    pool.query(Q_INST_PROT, [contractNumbers]),
    pool.query(Q_INST_SCHED, [contractNumbers]),
    pool.query(Q_REL_PROT, [contractNumbers]),
    pool.query(Q_REL_DIM, [contractNumbers]),
    pool.query(Q_NET_INFRA, [clientIds, massiveCodes]),
  ])

  // Network — junta infra (PG) × massivas (Maria) por splitter_code, agrega por cliente
  const netAcc = new Map()
  for (const r of netInfra.rows) {
    const c = byClientId.get(String(r.client_id)); if (!c) continue
    const code = String(r.splitter_code)
    const agg = massiveBySplitter.get(code); if (!agg) continue
    let a = netAcc.get(c.clientId)
    if (!a) {
      a = { codes: new Set(), countSum: 0, offlineW: 0, overageSum: 0, overageN: 0 }
      netAcc.set(c.clientId, a)
      c.netSite = r.site?.trim() || ''
      c.netConcentrator = r.concentrator?.trim() || ''
      c.netAccessPoint = r.access_point?.trim() || ''
      c.netSplitter = r.splitter?.trim() || ''
      c.netSplitterCode = code
      c.netSlot = r.slot != null ? String(r.slot) : ''
      c.netPon = r.pon != null ? String(r.pon) : ''
    }
    if (a.codes.has(code)) continue
    a.codes.add(code)
    a.countSum += agg.count
    a.offlineW += agg.offline * agg.count
    if (agg.overage > 0) { a.overageSum += agg.overage; a.overageN++ }
  }
  for (const [clientId, a] of netAcc) {
    const c = byClientId.get(clientId); if (!c) continue
    c.netMassiveCount = a.countSum
    c.netAvgOfflineMin = a.countSum > 0 ? Math.round(a.offlineW / a.countSum) : 0
    c.netAvgOverageMin = a.overageN > 0 ? Math.round(a.overageSum / a.overageN) : 0
  }
  console.log(`Network: ${netAcc.size}/${clients.length} clientes em splitters afetados.`)

  for (const r of equip.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.equipment = (r.models || []).filter(Boolean).map((m) => String(m).trim())
  }
  for (const r of fieldProt.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.protocolCount = Number(r.protocol_count)
    c.slaLateCount = Number(r.sla_late_count)
    c.avgSlaDays = r.avg_sla_days != null ? Number(r.avg_sla_days) : 0
  }
  for (const r of fieldSched.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.scheduleCount = Number(r.schedule_count)
    c.technicians = (r.technicians || []).filter(Boolean).map((t) => String(t).trim())
  }
  for (const r of fieldReasons.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.reasons = (r.reasons || []).filter(Boolean).map((x) => String(x).trim())
  }
  for (const r of instProt.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.installProtocols = Number(r.protocol_count)
    c.installSlaLateCount = Number(r.sla_late_count)
    c.installAvgSlaDays = r.avg_sla_days != null ? Number(r.avg_sla_days) : 0
    c.installSaleToScheduleDays = r.sale_to_schedule_days != null ? Number(r.sale_to_schedule_days) : 0
  }
  for (const r of instSched.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.installScheduleCount = Number(r.schedule_count)
    c.installTechnicians = (r.technicians || []).filter(Boolean).map((t) => String(t).trim())
  }
  for (const r of relProt.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.relProtocolCount = Number(r.protocol_count)
    c.relRecurrenceDays = r.recurrence_days != null ? Number(r.recurrence_days) : 0
    c.relAvgOverageHours = r.avg_overage_hours != null ? Number(r.avg_overage_hours) : 0
    c.relCancelThreats = Number(r.cancel_threats)
  }
  for (const r of relDim.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.relTypes = (r.protocol_types || []).filter(Boolean).map((x) => String(x).trim())
    c.relAttendants = (r.attendant_names || []).filter(Boolean).map((x) => String(x).trim())
  }

  for (const r of inv.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.onTimeInvoices = Number(r.on_time_invoices)
    c.lateInvoices = Number(r.late_invoices)
    c.overdueInvoices = Number(r.overdue_invoices)
    c.totalInvoices = Number(r.total_invoices)
  }
  for (const r of reneg.rows) { const c = byContract.get(String(r.contract_number)); if (c) c.renegotiations = Number(r.renegotiations) }
  for (const r of trust.rows) { const c = byContract.get(String(r.contract_number)); if (c) c.trustReleases = Number(r.trust_releases) }

  const withInv = clients.filter((c) => c.totalInvoices > 0).length
  console.log(`Sinais aplicados: ${withInv}/${clients.length} clientes com faturas no período.`)

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'ELLEVEN / PostgreSQL — dados reais (sem mock)',
      fromDate: FROM_DATE,
      sampleSize: clients.length,
    },
    totals: { clients: Number(t.clients), contracts: Number(t.contracts), mrr: Number(t.mrr) },
    paymentForms: payforms.rows.map((r) => r.title?.trim()).filter(Boolean),
    byCity: byCity.rows.map((r) => ({ city: r.city?.trim() || 'Não informado', contracts: Number(r.contracts), mrr: Number(r.mrr) })),
    monthly: monthly.rows.map((r) => ({ month: r.ym, onTime: Number(r.on_time), late: Number(r.late), overdue: Number(r.overdue) })),
    // Listas distinct para o config comercial ({ value, count })
    commercial: {
      sellers:       commSellers.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
      plans:         commPlans.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
      values:        commValues.rows.map((r) => ({ value: Number(r.v), count: Number(r.n) })),
      cities:        commCities.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
      neighborhoods: commHoods.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
      clientGenders: commCGender.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
      sellerGenders: commSGender.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
    },
    // Connection Engine — modelos de equipamento distintos
    connection: {
      models: connModels.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
    },
    // Field Engine — listas distintas (motivos / técnicos)
    field: {
      reasons: fieldReasonList.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
      technicians: fieldTechList.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
    },
    // Installation Engine — técnicos distintos
    installation: {
      technicians: instTechList.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
    },
    // Relationship Engine — tipos de protocolo / atendentes distintos
    relationship: {
      types: relTypeList.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
      attendants: relAttList.rows.map((r) => ({ value: String(r.v).trim(), count: Number(r.n) })),
    },
    // Network Engine — totais de massivas (MariaDB)
    network: {
      totalMassives,
      splittersAffected: massiveCodes.length,
    },
    clients,
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(payload, null, 0))
  console.log(`OK — ${clients.length} clientes gravados em ${OUT}`)
} catch (e) {
  console.error('ERRO:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
