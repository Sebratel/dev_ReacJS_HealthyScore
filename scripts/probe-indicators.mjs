import { makePool } from './db.mjs'

const FROM_DATE = '2026-01-01'

// 1) Formas de pagamento ativas (para config dinâmica)
const Q_PAYFORMS = `select title from payment_forms where active is true order by title`

// 2) Faturas — volume e distribuição late/on_time (definição do usuário)
const Q_INV = `
select
  count(*) rows_with_receipts,
  count(distinct frt.id) distinct_titles,
  count(distinct c.contract_number) contracts,
  count(*) filter (where frt2.client_paid_date is null) unpaid_rows,
  count(*) filter (where frt2.client_paid_date > frt.expiration_date) late_rows,
  count(*) filter (where frt2.client_paid_date is not null and frt2.client_paid_date <= frt.expiration_date) on_time_rows
from contracts c
left join financial_receivable_titles frt on frt.contract_id = c.id
left join financial_receipt_titles frt2 on frt2.financial_receivable_title_id = frt.id
left join financers_natures fn on fn.id = frt2.financer_nature_id
where c.v_status <> 'Cancelado'
  and frt.title like '%FAT%'
  and frt.deleted = 'False'
  and frt.renegotiated = 'False'
  and frt.bill_title_id is null
  and (fn.title is null or fn.title <> 'DF - TARIFA BAIXA DE TÍTULO')
  and date(frt.issue_date) >= '${FROM_DATE}'
`

// 3) Renegociações — títulos FAT marcados como renegotiated='True'
const Q_RENEG = `
select count(distinct frt.id) reneg_titles, count(distinct c.contract_number) contracts
from contracts c
left join financial_receivable_titles frt on frt.contract_id = c.id
where c.v_status <> 'Cancelado'
  and frt.title like '%FAT%'
  and frt.deleted = 'False'
  and frt.renegotiated = 'True'
  and date(frt.issue_date) >= '${FROM_DATE}'
`

// 4) Desbloqueios por confiança — eventos de contrato
const Q_TRUST = `
select count(*) events, count(distinct c.contract_number) contracts
from contracts c
left join contract_events ce on ce.contract_id = c.id
where c.v_status <> 'Cancelado'
  and ce.description in (
    'Desbloqueio Financeiro realizado pelo cliente através do atendimento telefônico.',
    'Desbloqueio Financeiro realizado pela tela de atendimento ao cliente.',
    'Desbloqueio Financeiro realizado pelo usuário através do Portal de Relacionamento.'
  )
  and date(ce."date") >= '${FROM_DATE}'
`

const pool = makePool()
try {
  const pf = await pool.query(Q_PAYFORMS)
  console.log('FORMAS DE PAGAMENTO ATIVAS:', pf.rows.map((r) => r.title))
  console.log('\nFATURAS:', (await pool.query(Q_INV)).rows[0])
  console.log('\nRENEGOCIAÇÕES:', (await pool.query(Q_RENEG)).rows[0])
  console.log('\nDESBLOQUEIOS CONFIANÇA:', (await pool.query(Q_TRUST)).rows[0])
} catch (e) {
  console.error('ERRO:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
