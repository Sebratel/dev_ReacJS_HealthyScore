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
  const [totals, byCity, payforms, sample, commSellers, commPlans, commValues, commCities, commHoods, commCGender, commSGender, connModels] = await Promise.all([
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
    })
  }
  const clients = Array.from(byClient.values()).slice(0, SAMPLE_SIZE)
  const byContract = new Map(clients.filter((c) => c.contractNumber).map((c) => [c.contractNumber, c]))
  const contractNumbers = Array.from(byContract.keys())
  console.log(`Amostra: ${clients.length} clientes, ${contractNumbers.length} contratos. Buscando sinais financeiros…`)

  const [inv, reneg, trust, monthly, equip] = await Promise.all([
    pool.query(Q_INV_AGG, [contractNumbers]),
    pool.query(Q_RENEG_AGG, [contractNumbers]),
    pool.query(Q_TRUST_AGG, [contractNumbers]),
    pool.query(Q_MONTHLY_OK),
    pool.query(Q_CONN_AGG, [contractNumbers]),
  ])

  for (const r of equip.rows) {
    const c = byContract.get(String(r.contract_number)); if (!c) continue
    c.equipment = (r.models || []).filter(Boolean).map((m) => String(m).trim())
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
