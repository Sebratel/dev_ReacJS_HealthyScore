// ─────────────────────────────────────────────────────────────────────────
// Registro central das queries de PRODUÇÃO do ETL (fetch-clients.mjs).
// Fonte ÚNICA de verdade: tanto o ETL quanto o backend (server/index.mjs)
// importam daqui. Os SQL aqui são os DEFAULTS; edições do usuário ficam em
// overrides (scripts/queries/overrides.mjs) e têm precedência em tempo de ETL.
//
// IMPORTANTE — paridade: os textos abaixo reproduzem EXATAMENTE os antigos
// `const Q_*` de fetch-clients.mjs (mesmos fragmentos, mesma composição), de
// modo que, sem nenhum override, o ETL roda idêntico ao comportamento original.
// Validado por scripts/queries/check-parity.mjs.
//
// Único token dinâmico: {{sampleClause}} (só na Q_SAMPLE) — resolvido em
// renderTemplate() conforme a execução seja amostra ou base completa. Os
// parâmetros posicionais ($1, $2) continuam literais (o ETL os passa).
// ─────────────────────────────────────────────────────────────────────────

// Data de corte do período analisado. Alterar aqui propaga para todas as
// queries que usam o filtro (default). Edições por query via override.
export const FROM_DATE = '2026-01-01'

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

// ─── Field Engine — protocolos de manutenção ──────────────────
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

// ─── Installation Engine — protocolos de instalação (ATV) ─────
const INST_WHERE = `
where it.active is true and it.code like 'ATV%'
  and a.created >= '${FROM_DATE}'
  and c.v_status <> 'Cancelado'
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

// ─── Financeiro — status de cada fatura ────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// Catálogo — uma entrada por query, na mesma ordem em que aparecem no ETL.
// `id` casa com o antigo nome da constante (ex.: 'Q_TOTALS').
// `engine` agrupa no catálogo; `db` indica o banco; `params` documenta os
// placeholders posicionais para a UI.
// ─────────────────────────────────────────────────────────────────────────
export const QUERIES = [
  // ── Base / Totais ──────────────────────────────────────────
  {
    id: 'Q_TOTALS', engine: 'base', db: 'postgres',
    title: 'Totais gerais',
    description: 'Contagem de clientes, contratos e MRR da base ativa.',
    params: [],
    sql: `
select count(distinct p.id) clients, count(distinct c.id) contracts,
       coalesce(sum(sp.selling_price::numeric),0) mrr
${BASE_FROM}
`,
  },
  {
    id: 'Q_BY_CITY', engine: 'base', db: 'postgres',
    title: 'Contratos e MRR por cidade',
    description: 'Top 30 cidades por número de contratos.',
    params: [],
    sql: `
select ac.city, count(distinct c.id) contracts, coalesce(sum(sp.selling_price::numeric),0) mrr
${BASE_FROM}
group by ac.city order by contracts desc limit 30
`,
  },
  {
    id: 'Q_PAYFORMS', engine: 'base', db: 'postgres',
    title: 'Formas de pagamento ativas',
    description: 'Lista de formas de pagamento ativas (para config dinâmica).',
    params: [],
    sql: `select title from payment_forms where active is true order by title`,
  },
  {
    id: 'Q_SAMPLE', engine: 'base', db: 'postgres',
    title: 'Amostra de clientes (identidade real)',
    description:
      'Seleção de clientes/contratos da base. Em modo amostra usa `order by random() limit $1`; em base completa, sem limite. O token {{sampleClause}} é resolvido pelo ETL conforme a execução.',
    params: ['$1 = tamanho da amostra (apenas no modo amostra)'],
    sql: `
select
  p.id client_id, p.name client_name, p.gender client_gender, p.birth_date client_birth,
  p2.name seller_name, p2.gender seller_gender, p2.birth_date seller_birth, p2.created seller_admitted,
  c.contract_number, c.created created_contract,
  pf.title payment_form,
  sp.title plan_name, sp.selling_price,
  ac.city, ac.neighborhood, ac.street, ac.street_number, ac.state,
  p.tx_id cpf_cnpj, p.phone, p.email, ac.lat, ac.lng
${BASE_FROM}
{{sampleClause}}
`,
  },
  {
    id: 'Q_MONTHLY_OK', engine: 'base', db: 'postgres',
    title: 'Série mensal de adimplência',
    description: 'Faturas por mês (on_time / late / overdue) da base inteira.',
    params: [],
    sql: `
select ym,
  count(*) filter (where st = 'on_time') on_time,
  count(*) filter (where st = 'late')    late,
  count(*) filter (where st = 'overdue') overdue
from (
  select to_char(date_trunc('month', frt.issue_date), 'YYYY-MM') ym, ${INV_STATUS} st
  ${INV_BASE('')}
) q
group by ym order by ym
`,
  },

  // ── Comercial — listas distintas (base inteira) ────────────
  {
    id: 'Q_COMM_SELLERS', engine: 'comercial', db: 'postgres',
    title: 'Vendedores (distintos + contagem)',
    description: 'Vendedores distintos com nº de contratos, para o config comercial.',
    params: [],
    sql: `select coalesce(p2.name,'(sem vendedor)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`,
  },
  {
    id: 'Q_COMM_PLANS', engine: 'comercial', db: 'postgres',
    title: 'Planos (distintos + contagem)',
    description: 'Planos distintos com nº de contratos.',
    params: [],
    sql: `select coalesce(sp.title,'(sem plano)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`,
  },
  {
    id: 'Q_COMM_VALUES', engine: 'comercial', db: 'postgres',
    title: 'Valores de mensalidade (distintos + contagem)',
    description: 'Valores de venda distintos com nº de contratos.',
    params: [],
    sql: `select coalesce(sp.selling_price::numeric,0) v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`,
  },
  {
    id: 'Q_COMM_CITIES', engine: 'comercial', db: 'postgres',
    title: 'Cidades (distintas + contagem)',
    description: 'Cidades distintas com nº de contratos.',
    params: [],
    sql: `select coalesce(ac.city,'(s/ cidade)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`,
  },
  {
    id: 'Q_COMM_HOODS', engine: 'comercial', db: 'postgres',
    title: 'Bairros (distintos + contagem)',
    description: 'Bairros distintos com nº de contratos.',
    params: [],
    sql: `select coalesce(ac.neighborhood,'(s/ bairro)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`,
  },
  {
    id: 'Q_COMM_CGENDER', engine: 'comercial', db: 'postgres',
    title: 'Gênero do cliente (distinto + contagem)',
    description: 'Gêneros de cliente distintos com nº de contratos.',
    params: [],
    sql: `select coalesce(p.gender::text,'(sem gênero)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`,
  },
  {
    id: 'Q_COMM_SGENDER', engine: 'comercial', db: 'postgres',
    title: 'Gênero do vendedor (distinto + contagem)',
    description: 'Gêneros de vendedor distintos com nº de contratos.',
    params: [],
    sql: `select coalesce(p2.gender::text,'(sem gênero)') v, count(distinct c.id) n ${BASE_FROM} group by 1 order by n desc`,
  },

  // ── Connection Engine ──────────────────────────────────────
  {
    id: 'Q_CONN_AGG', engine: 'conexao', db: 'postgres',
    title: 'Modelos de equipamento por contrato',
    description: 'Modelos distintos alocados por contrato (filtrado à amostra).',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
select c.contract_number, array_agg(distinct p.title) models
${EQUIP_FROM} and c.contract_number::text = any($1::text[])
group by c.contract_number
`,
  },
  {
    id: 'Q_CONN_MODELS', engine: 'conexao', db: 'postgres',
    title: 'Modelos de equipamento (distintos)',
    description: 'Lista de modelos distintos (base inteira) para config.',
    params: [],
    sql: `select p.title v, count(*) n ${EQUIP_FROM} group by p.title order by n desc`,
  },

  // ── Field Engine — manutenção ──────────────────────────────
  {
    id: 'Q_FIELD_PROT', engine: 'field', db: 'postgres',
    title: 'Protocolos / SLA de manutenção por contrato',
    description: 'Contagem de protocolos, atrasos de SLA e SLA médio (nível protocolo).',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
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
`,
  },
  {
    id: 'Q_FIELD_SCHED', engine: 'field', db: 'postgres',
    title: 'Agendamentos e técnicos de manutenção por contrato',
    description: 'Nº de agendamentos e técnicos por contrato.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
select c.contract_number,
  count(distinct sds.id) schedule_count,
  array_remove(array_agg(distinct p2.name), null) technicians
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${FIELD_WHERE}
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`,
  },
  {
    id: 'Q_FIELD_REASONS', engine: 'field', db: 'postgres',
    title: 'Motivos de manutenção por contrato',
    description: 'Categorias (1-4) distintas por contrato.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
select contract_number, array_remove(array_agg(distinct cat), null) reasons
from (
  select c.contract_number, unnest(array[ssc1.title, ssc2.title, ssc3.title, ssc4.title]) cat
  ${FIELD_FROM} ${FIELD_CAT_JOIN} ${FIELD_WHERE}
    and c.contract_number::text = any($1::text[])
) q
where cat is not null and cat <> ''
group by contract_number
`,
  },
  {
    id: 'Q_FIELD_REASON_LIST', engine: 'field', db: 'postgres',
    title: 'Motivos de manutenção (distintos)',
    description: 'Lista distinta de motivos (base inteira) para config.',
    params: [],
    sql: `
select cat v, count(distinct pid) n from (
  select a.id pid, unnest(array[ssc1.title, ssc2.title, ssc3.title, ssc4.title]) cat
  ${FIELD_FROM} ${FIELD_CAT_JOIN} ${FIELD_WHERE}
) q where cat is not null and cat <> '' group by cat order by n desc
`,
  },
  {
    id: 'Q_FIELD_TECH_LIST', engine: 'field', db: 'postgres',
    title: 'Técnicos de manutenção (distintos)',
    description: 'Lista distinta de técnicos (base inteira) para config.',
    params: [],
    sql: `
select p2.name v, count(distinct a.id) n
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${FIELD_WHERE} and p2.id is not null
group by p2.name order by n desc
`,
  },

  // ── Installation Engine — instalação (ATV) ─────────────────
  {
    id: 'Q_INST_PROT', engine: 'instalacao', db: 'postgres',
    title: 'Protocolos / SLA de instalação por contrato',
    description: 'Protocolos, atraso de SLA, SLA médio e venda→agenda (nível protocolo).',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
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
`,
  },
  {
    id: 'Q_INST_SCHED', engine: 'instalacao', db: 'postgres',
    title: 'Agendamentos e técnicos de instalação por contrato',
    description: 'Nº de agendamentos e técnicos de instalação por contrato.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
select c.contract_number,
  count(distinct sds.id) schedule_count,
  array_remove(array_agg(distinct p2.name), null) technicians
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${INST_WHERE}
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`,
  },
  {
    id: 'Q_INST_TECH_LIST', engine: 'instalacao', db: 'postgres',
    title: 'Técnicos de instalação (distintos)',
    description: 'Lista distinta de técnicos de instalação (base inteira).',
    params: [],
    sql: `
select p2.name v, count(distinct a.id) n
${FIELD_FROM} ${FIELD_SCHED_JOIN} ${INST_WHERE} and p2.id is not null
group by p2.name order by n desc
`,
  },

  // ── Relationship Engine — relacionamento ───────────────────
  {
    id: 'Q_REL_PROT', engine: 'relacionamento', db: 'postgres',
    title: 'Protocolos de relacionamento por contrato',
    description: 'Protocolos, recorrência, atraso de SLA e ameaças de cancelamento.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
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
`,
  },
  {
    id: 'Q_REL_DIM', engine: 'relacionamento', db: 'postgres',
    title: 'Tipos de protocolo e atendentes por contrato',
    description: 'Tipos de protocolo e nomes de atendentes distintos por contrato.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
select c.contract_number,
  array_remove(array_agg(distinct it.title), null) protocol_types,
  array_remove(array_agg(distinct p2.name), null) attendant_names
${REL_FROM} ${REL_WHERE}
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`,
  },
  {
    id: 'Q_REL_TYPE_LIST', engine: 'relacionamento', db: 'postgres',
    title: 'Tipos de protocolo (distintos)',
    description: 'Lista distinta de tipos de protocolo (base inteira).',
    params: [],
    sql: `select it.title v, count(distinct a.id) n ${REL_FROM} ${REL_WHERE} and it.title is not null group by it.title order by n desc`,
  },
  {
    id: 'Q_REL_ATT_LIST', engine: 'relacionamento', db: 'postgres',
    title: 'Atendentes (distintos)',
    description: 'Lista distinta de atendentes (base inteira).',
    params: [],
    sql: `select p2.name v, count(distinct a.id) n ${REL_FROM} ${REL_WHERE} and p2.id is not null group by p2.name order by n desc`,
  },

  // ── Network Engine — massivas (MariaDB) × infra (PostgreSQL) ─
  {
    id: 'Q_MARIA_SPLITTER', engine: 'rede', db: 'mariadb',
    title: 'Massivas por splitter (MariaDB)',
    description: 'Agregado de massivas por splitter_code: contagem, offline médio e estouro.',
    params: [],
    sql: `
select mhs.splitter_code,
  count(*) massive_count,
  round(avg(timestampdiff(minute, coalesce(mh.event_identified_at, mh.opened_at), mh.closed_at)), 2) avg_offline_min,
  round(avg(case when mh.closed_at > mh.expected_close_at then timestampdiff(minute, mh.expected_close_at, mh.closed_at) end), 2) avg_overage_min
from DB_Massives.massiva_history mh
left join DB_Massives.massiva_history_splitters mhs on mhs.massiva_history_id = mh.id
where mhs.splitter_code is not null and mh.closed_at is not null
group by mhs.splitter_code
`,
  },
  {
    id: 'Q_NET_INFRA', engine: 'rede', db: 'postgres',
    title: 'Infra de rede dos clientes (PostgreSQL)',
    description: 'Site/concentrador/AP/splitter/slot/pon dos clientes (TODA a base passada, não só splitters com massiva). O cruzamento com massivas é feito no ETL por splitter_code.',
    params: ['$1 = client_ids (text[])'],
    sql: `
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
where p.id::text = any($1::text[])
`,
  },
  {
    id: 'Q_NET_INFRA_CANCELLED', engine: 'rede', db: 'postgres',
    title: 'Infra de rede dos cancelados (histórico)',
    description:
      'Site/concentrador/AP/splitter/slot/pon dos contratos CANCELADOS via authentication_contract_connection_occurrences (histórico que sobrevive ao cancelamento, ao contrário de authentication_contracts). Cobre TODOS os cancelados passados; o cruzamento com massivas é feito no ETL por splitter_code.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
select c.contract_number, as3.code splitter_code,
  as2.title site, ac2.title concentrator, aap.title access_point, as3.title splitter,
  (t.authentication_data::jsonb->>'slot_olt') slot, (t.authentication_data::jsonb->>'port_olt') pon
from authentication_contract_connection_occurrences t
left join authentication_concentrators ac2 on ac2.id = t.authentication_concentrator_id
left join authentication_access_points aap on aap.id = t.authentication_access_point_id
left join contracts c on c.id = t.contract_id
left join authentication_sites as2 on as2.id = ac2.authentication_site_id
left join authentication_splitter_ports asp on asp.authentication_contract_id = t.contract_id
left join authentication_splitters as3 on as3.id = asp.authentication_splitter_id
where c.contract_number::text = any($1::text[])
`,
  },

  // ── Financeiro — faturas / renegociações / desbloqueios ────
  {
    id: 'Q_INV_AGG', engine: 'financeiro', db: 'postgres',
    title: 'Faturas por contrato',
    description: 'Faturas on_time / late / overdue e total por contrato (filtrado à amostra).',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
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
`,
  },
  {
    id: 'Q_RENEG_AGG', engine: 'financeiro', db: 'postgres',
    title: 'Renegociações por contrato',
    description: 'Títulos FAT renegotiated=True por contrato.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
select c.contract_number, count(distinct frt.id) renegotiations
from contracts c
join financial_receivable_titles frt on frt.contract_id = c.id
where c.v_status <> 'Cancelado'
  and frt.title like '%FAT%' and frt.deleted = 'False' and frt.renegotiated = 'True'
  and date(frt.issue_date) >= '${FROM_DATE}'
  and c.contract_number::text = any($1::text[])
group by c.contract_number
`,
  },
  {
    id: 'Q_TRUST_AGG', engine: 'financeiro', db: 'postgres',
    title: 'Desbloqueios por confiança por contrato',
    description: 'Eventos de desbloqueio financeiro por confiança por contrato.',
    params: ['$1 = contract_numbers (text[])'],
    sql: `
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
`,
  },

  // ── Conexão — quedas de PPPoE (status da ONU, banco AutoISP) ─
  {
    id: 'Q_AUTOISP_ONU_STATUS', engine: 'conexao', db: 'autoisp',
    title: 'Quedas de PPPoE — mudanças de status da ONU (AutoISP)',
    description:
      'Mudanças de status da ONU (up / OK / warning / critical / power_fail / loss_signal) agregadas por contrato + status desde a data de corte. Roda no banco AutoISP (DB_AUTOISP_*); o cruzamento com a base é feito no ETL por contract_id/client_id.',
    params: ['$1 = data inicial (FROM_DATE)'],
    sql: `
select c.contract_id::text contract_id, s.subsc_id::text client_id,
  osc.new_status, count(*) qty
from contracts c
left join subscribers s on s.subsc_id = c.subscriber_id
join contracted_services cs on cs.contract_id = c.contract_id
join gpon_clients gc on gc.contracted_service_id = cs.id
join onu_status_changes osc on osc.gpon_client_id = gc.id
where osc.new_status_timestamp >= $1
group by c.contract_id, s.subsc_id, osc.new_status
`,
  },
]

// Rótulos amigáveis dos grupos (ordem de exibição no catálogo).
export const ENGINE_LABELS = {
  base: 'Base / Totais',
  comercial: 'Comercial',
  conexao: 'Conexão (equipamentos)',
  field: 'Manutenção (Field)',
  instalacao: 'Instalação',
  relacionamento: 'Relacionamento',
  rede: 'Rede / Massivas',
  financeiro: 'Financeiro',
}

const BY_ID = new Map(QUERIES.map((q) => [q.id, q]))

export function getQueryDef(id) {
  return BY_ID.get(id) || null
}

export function listQueries() {
  return QUERIES.map((q) => ({ ...q }))
}

// Resolve o(s) token(s) dinâmico(s) de um SQL conforme o contexto de execução.
// Hoje só existe {{sampleClause}} (usado na Q_SAMPLE): em base completa não
// adiciona nada; em amostra adiciona `order by random()` + `limit $1`.
export function renderTemplate(sql, { full = false } = {}) {
  const sampleClause = full ? '' : 'order by random()\nlimit $1'
  return sql.replace(/\{\{sampleClause\}\}/g, sampleClause)
}

// SQL default já renderizado para o contexto dado (sem overrides).
export function getDefaultSql(id, ctx = {}) {
  const def = BY_ID.get(id)
  if (!def) throw new Error(`Query desconhecida: ${id}`)
  return renderTemplate(def.sql, ctx)
}
