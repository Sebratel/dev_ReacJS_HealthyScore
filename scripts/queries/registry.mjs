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
-- "Forma de pagamento" migrou de payment_forms para contract_types (c.contract_type_id).
-- Alias pf mantido para nao mexer no resto (Q_SAMPLE usa pf.title payment_form).
left join contract_types pf on pf.id = c.contract_type_id
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

// ─── Coorte (Cancelados) — base compartilhada pelas queries gêmeas ─────
// Espelha cohort.mjs. As colunas/joins são iguais para ativos e cancelados;
// só o filtro de v_status muda ({{statusCmp}}). "Forma de pagamento" já usa
// contract_types (migração de payment_forms).
const COHORT_BASE_COLUMNS = `
  p.id client_id, p.name client_name, p.gender client_gender, p.birth_date client_birth,
  p2.name seller_name, p2.gender seller_gender, p2.birth_date seller_birth, p2.created seller_admitted,
  c.contract_number, c.created created_contract, c.cancellation_date, c.cancellation_motive,
  pf.title payment_form, sp.selling_price, sp.title plan_name,
  p.city, p.neighborhood
`
const COHORT_BASE_JOINS = `
from contracts c
left join contract_service_tags cst on cst.contract_id = c.id
left join service_products sp on sp.id = cst.service_product_id
left join people p on p.id = c.client_id
left join people p2 on p2.id = c.seller_1_id
left join contract_types pf on pf.id = c.contract_type_id
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
    title: 'Formas de pagamento (tipo de contrato)',
    description: 'Lista distinta de "forma de pagamento" = tipo de contrato (contract_types) em uso na base ativa, para a config dinâmica do indicador.',
    params: [],
    sql: `select distinct pf.title title ${BASE_FROM} and pf.title is not null order by pf.title`,
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

  // ── Conexão — qualidade do enlace (AutoISP) ───────────────────
  // As três queries abaixo são PASSADAS ÚNICAS sobre a base inteira, sem filtro
  // por contrato. Não é descuido: medimos as duas formas contra o banco real e
  // filtrar por `contract_id = any($1)` obriga o planner a varrer contracts +
  // contracted_services a cada execução e sai ~5x MAIS CARO (11,8s para 2 mil
  // contratos contra 2,3s para os 84 mil). O casamento com a base é feito no
  // ETL, em memória, por contract_number.
  //
  // Também estão SEPARADAS de propósito. Juntar o óptico com a velocidade da
  // porta numa query só faz o Postgres destoastar o jsonb `ethernet` das 215
  // mil linhas de onu_statuses (a tabela tem 1,7 GB por causa dele) e a
  // consulta estoura 10 min. Separadas, o filtro `jsonb_typeof = 'array'` corta
  // para as ~87 mil que têm dado real e a mesma coisa sai em 1,5s.
  {
    id: 'Q_AUTOISP_ONU_HEALTH', engine: 'conexao', db: 'autoisp',
    title: 'Qualidade do enlace óptico — sinal, distância e temperatura (AutoISP)',
    description:
      'Foto ATUAL do enlace de cada contrato: potência óptica recebida (dBm), potência transmitida, status corrente da ONU, distância da fibra em metros e temperatura óptica. Uma linha por contrato. Passada única sobre onu_statuses + onu_infos (sem filtro por contrato — ver comentário acima).',
    params: [],
    sql: `
select cs.contract_id::text contract_id,
  os.calculated_rx_power, os.tx_power, os.calculated_status,
  oi.distance, oi.optical_temperature
from onu_statuses os
join gpon_clients gc on gc.id = os.gpon_client_id
join contracted_services cs on cs.id = gc.contracted_service_id
left join onu_infos oi on oi.gpon_client_id = gc.id
where cs.contract_id is not null
`,
  },

  {
    id: 'Q_AUTOISP_ONU_LAN', engine: 'conexao', db: 'autoisp',
    title: 'Velocidade negociada da porta LAN da ONU (AutoISP)',
    description:
      'Maior velocidade negociada (Mbps) entre as portas ethernet da ONU que estão com link ativo. Serve para achar o cliente de plano alto ligado numa porta de 100 ou 10 Mbps — que nunca vai ver a velocidade que assina. Lê o jsonb `ethernet` de onu_statuses, restrito às linhas em que ele é um array de verdade.',
    params: [],
    sql: `
select cs.contract_id::text contract_id,
  (select max(nullif(regexp_replace(p->>'negotiated_speed','[^0-9]','','g'),'')::int)
     from jsonb_array_elements(os.ethernet) p where p->>'link' = 'up') lan_mbps
from onu_statuses os
join gpon_clients gc on gc.id = os.gpon_client_id
join contracted_services cs on cs.id = gc.contracted_service_id
where cs.contract_id is not null and jsonb_typeof(os.ethernet) = 'array'
`,
  },

  {
    id: 'Q_AUTOISP_CPE', engine: 'conexao', db: 'autoisp',
    title: 'Equipamento do cliente — modelo e firmware via TR-069 (AutoISP)',
    description:
      'Modelo e firmware do CPE reportados por TR-069. O modelo é o que define a geração do Wi-Fi (ax / ac / n) — o ETL faz esse de-para. Usa só COLUNAS de acs_clients: a mesma informação existe no jsonb de acs_device_statuses, mas lê-lo custa mais de 10 min contra 2,3s aqui.',
    params: [],
    sql: `
select cs.contract_id::text contract_id,
  ac.router_model_name, ac.firmware_version
from acs_clients ac
join gpon_clients gc on gc.id = ac.gpon_client_id
join contracted_services cs on cs.id = gc.contracted_service_id
where cs.contract_id is not null
`,
  },

  // ── Retiradas de equipamento — protocolos de retirada (motoboys) ─
  // Uma linha por PROTOCOLO. Cada relato (report) que casa com os filtros é uma
  // "visita"; o desfecho (retirado × não retirado) e o motoboy vêm do relato
  // MAIS RECENTE (order by beginning_date desc). is_cancelled cruza o contrato
  // com c.v_status para a comparação cancelado × ativo. Base-wide (não filtra à
  // amostra) — o ETL apenas rola isto em KPIs/gráficos, como as massivas.
  {
    id: 'Q_WD_PROT', engine: 'retiradas', db: 'postgres',
    title: 'Retiradas de equipamento por protocolo',
    description:
      'Protocolos de retirada de equipamento: desfecho (retirado × não retirado), nº de visitas, motoboy responsável e se o contrato está cancelado ou ativo. Um registro por protocolo, desfecho do relato mais recente.',
    params: [],
    sql: `
select protocol, contract_number, is_cancelled, retrieved, technician, visits, outcome_date
from (
  -- Janelas sobre os relatos JÁ deduplicados (count(distinct) em window não é
  -- suportado no PG). visits = nº de relatos do protocolo; rn=1 = mais recente.
  select d.*,
    count(*) over (partition by d.protocol) visits,
    row_number() over (partition by d.protocol order by d.beginning_date desc nulls last, d.report_id desc) rn
  from (
    select distinct
      ai.protocol,
      r.id report_id,
      c.contract_number,
      (c.v_status = 'Cancelado') is_cancelled,
      (r.description like '%foi retirado com sucesso%') retrieved,
      vu.name technician,
      r.beginning_date,
      date(r.final_date) outcome_date
    from assignment_incidents ai
    left join reports r on r.assignment_id = ai.assignment_id
    left join assignments a on a.id = ai.assignment_id
    left join incident_types it on it.id = ai.incident_type_id
    left join v_users vu on vu.id = r.created_by
    left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
    left join contracts c on c.id = cst.contract_id
    where (r.description like '%Quando o equipamento NÃO foi retirado.%'
        or r.description like '%Quando o equipamento foi retirado com sucesso%')
      and r.title not like 'Relato offline - Atendimento Solicitação'
      and (vu.name is null or vu.name not like 'LOURDES BARBOSA RAICHEL')
      and it.id in (1064, 245, 1090, 1155, 1009)
      and r.description not like '% não visitado%'
      and date(r.final_date) >= '${FROM_DATE}'
  ) d
) q
where rn = 1
`,
  },

  // ── Cancelados (coorte) — queries GÊMEAS ativos × cancelados ────────
  // Rodam para os DOIS coortes; só o filtro de status muda via {{statusCmp}}
  // ('=' cancelados | '<>' ativos). Consumidas por scripts/queries/cohort.mjs
  // (buildCohort) — fonte única, editáveis pela tela como as demais.
  {
    id: 'Q_COH_ACTIVE_BASE', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — base de ATIVOS (amostra)',
    description: 'Identidade/plano/endereço de uma amostra aleatória de contratos ativos. $1 = tamanho da amostra.',
    params: ['$1 = sampleLimit'],
    sql: `
with base as (
  select id from contracts where v_status <> 'Cancelado' order by random() limit $1
)
select distinct on (c.id) ${COHORT_BASE_COLUMNS}
${COHORT_BASE_JOINS}
join base b on b.id = c.id
order by c.id, sp.selling_price desc nulls last
`,
  },
  {
    id: 'Q_COH_CANCELLED_BASE', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — base de CANCELADOS (janela)',
    description: 'Identidade/plano/endereço dos contratos cancelados na janela. $1 = from, $2 = to (datas).',
    params: ['$1 = from', '$2 = to'],
    sql: `
select distinct on (c.id) ${COHORT_BASE_COLUMNS}
${COHORT_BASE_JOINS}
where c.v_status = 'Cancelado'
  and c.cancellation_date >= $1::date and c.cancellation_date < ($2::date + 1)
order by c.id, sp.selling_price desc nulls last
`,
  },
  {
    id: 'Q_COH_INV', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — faturas (on_time/late/overdue) por contrato',
    description: 'Estados das faturas por contrato. $1 = contract_numbers, $2 = from, $3 = to. {{statusCmp}} = filtro de v_status.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
    sql: `
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
  where c.v_status {{statusCmp}} 'Cancelado'
    and frt.title like '%FAT%' and frt.deleted = 'False' and frt.renegotiated = 'False'
    and frt.bill_title_id is null
    and (fn.title is null or fn.title <> 'DF - TARIFA BAIXA DE TÍTULO')
    and date(frt.issue_date) >= $2::date and date(frt.issue_date) < ($3::date + 1)
    and c.contract_number::text = any($1::text[])
) q
group by contract_number`,
  },
  {
    id: 'Q_COH_RENEG', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — renegociações por contrato',
    description: 'Títulos FAT renegotiated=True. $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
    sql: `
select c.contract_number, count(distinct frt.id) renegotiations
from contracts c
join financial_receivable_titles frt on frt.contract_id = c.id
where c.v_status {{statusCmp}} 'Cancelado'
  and frt.title like '%FAT%' and frt.deleted = 'False' and frt.renegotiated = 'True'
  and date(frt.issue_date) >= $2::date and date(frt.issue_date) < ($3::date + 1)
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,
  },
  {
    id: 'Q_COH_TRUST', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — desbloqueios por confiança por contrato',
    description: 'Eventos de desbloqueio financeiro por confiança. $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
    sql: `
select c.contract_number, count(*) trust_releases
from contracts c
join contract_events ce on ce.contract_id = c.id
where c.v_status {{statusCmp}} 'Cancelado'
  and ce.description in (
    'Desbloqueio Financeiro realizado pelo cliente através do atendimento telefônico.',
    'Desbloqueio Financeiro realizado pela tela de atendimento ao cliente.',
    'Desbloqueio Financeiro realizado pelo usuário através do Portal de Relacionamento.'
  )
  and date(ce."date") >= $2::date and date(ce."date") < ($3::date + 1)
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,
  },
  {
    id: 'Q_COH_EQUIP', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — modelos de equipamento por contrato',
    description: 'Modelos alocados (patrimonies). Sem janela (alocação). $1 = contract_numbers.',
    params: ['$1 = contract_numbers'],
    sql: `
select c.contract_number, array_remove(array_agg(distinct p.title), null) models
from patrimony_packing_list_items plis
left join patrimony_packing_lists ppl on ppl.id = plis.patrimony_packing_list_id
left join assignments a on a.id = ppl.assignment_id
left join assignment_incidents ai on ai.assignment_id = a.id
left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
left join contracts c on c.id = cst.contract_id
left join patrimonies p on p.id = plis.patrimony_id
where c.v_status {{statusCmp}} 'Cancelado' and p.title is not null
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,
  },
  {
    id: 'Q_COH_FIELD_PROT', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — protocolos/SLA de manutenção por contrato',
    description: 'Protocolos, atraso de SLA e SLA médio (manutenção). $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
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
  from assignment_incidents ai
  left join assignments a on a.id = ai.assignment_id
  left join incident_types it on it.id = ai.incident_type_id
  left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
  left join contracts c on c.id = cst.contract_id
  left join catalog_services cs on cs.id = ai.catalog_service_id
  where (it.active is true or cs.title in ('Equipe reparo','Equipe tecnologia'))
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status {{statusCmp}} 'Cancelado'
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number`,
  },
  {
    id: 'Q_COH_FIELD_SCHED', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — agendamentos/técnicos de manutenção por contrato',
    description: 'Nº de agendamentos e técnicos (manutenção). $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
    sql: `
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
  and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status {{statusCmp}} 'Cancelado'
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,
  },
  {
    id: 'Q_COH_FIELD_REASONS', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — motivos de manutenção por contrato',
    description: 'Categorias (1-4) distintas por contrato. $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
    sql: `
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
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status {{statusCmp}} 'Cancelado'
    and c.contract_number::text = any($1::text[])
) q
where cat is not null and cat <> ''
group by contract_number`,
  },
  {
    id: 'Q_COH_INST_PROT', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — protocolos/SLA de instalação por contrato',
    description: 'Protocolos, SLA e venda→agenda (instalação ATV). $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
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
  from assignment_incidents ai
  left join assignments a on a.id = ai.assignment_id
  left join incident_types it on it.id = ai.incident_type_id
  left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
  left join contracts c on c.id = cst.contract_id
  left join service_desk_slots sds on sds.pre_reserved_assignment_id = a.id
  where it.active is true and it.code like 'ATV%'
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status {{statusCmp}} 'Cancelado'
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number`,
  },
  {
    id: 'Q_COH_INST_SCHED', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — agendamentos/técnicos de instalação por contrato',
    description: 'Nº de agendamentos e técnicos (instalação ATV). $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
    sql: `
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
  and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status {{statusCmp}} 'Cancelado'
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,
  },
  {
    id: 'Q_COH_REL_PROT', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — protocolos de relacionamento por contrato',
    description: 'Protocolos, recorrência, excedente de SLA e ameaças de cancelamento. $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
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
  from assignment_incidents ai
  left join assignments a on a.id = ai.assignment_id
  left join incident_types it on it.id = ai.incident_type_id
  left join contract_service_tags cst on cst.id = ai.contract_service_tag_id
  left join contracts c on c.id = cst.contract_id
  where it.active is true and not (it.code like 'ATV%' or it.code like 'MNT%')
    and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status {{statusCmp}} 'Cancelado'
    and c.contract_number::text = any($1::text[])
  group by a.id, c.contract_number
) q
group by contract_number`,
  },
  {
    id: 'Q_COH_REL_DIM', engine: 'cancelados', db: 'postgres',
    title: 'Coorte — tipos de protocolo/atendentes por contrato',
    description: 'Tipos de protocolo e atendentes distintos por contrato (relacionamento). $1 = contract_numbers, $2 = from, $3 = to.',
    params: ['$1 = contract_numbers', '$2 = from', '$3 = to'],
    sql: `
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
  and a.created >= $2::date and a.created < ($3::date + 1) and c.v_status {{statusCmp}} 'Cancelado'
  and c.contract_number::text = any($1::text[])
group by c.contract_number`,
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
  retiradas: 'Retiradas de Equipamento',
  cancelados: 'Cancelados (coorte ativos × cancelados)',
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
export function renderTemplate(sql, { full = false, cancelled = false } = {}) {
  const sampleClause = full ? '' : 'order by random()\nlimit $1'
  // {{statusCmp}} — usado pelas queries GÊMEAS da coorte (engine 'cancelados'):
  // '=' para cancelados, '<>' para ativos. Default '<>' quando não informado
  // (o ETL principal não usa essas queries; cohort.mjs sempre passa o contexto).
  const statusCmp = cancelled ? '=' : '<>'
  return sql
    .replace(/\{\{sampleClause\}\}/g, sampleClause)
    .replace(/\{\{statusCmp\}\}/g, statusCmp)
}

// SQL default já renderizado para o contexto dado (sem overrides).
export function getDefaultSql(id, ctx = {}) {
  const def = BY_ID.get(id)
  if (!def) throw new Error(`Query desconhecida: ${id}`)
  return renderTemplate(def.sql, ctx)
}
