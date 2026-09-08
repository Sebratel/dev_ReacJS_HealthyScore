// ─────────────────────────────────────────────────────────────────────────
// Coorte ao vivo (PostgreSQL ELLEVEN) para a tela de Pontuação Sugerida.
//
// Monta, para uma janela [from, to], os clientes de um coorte no MESMO shape
// que o ETL produz (RealClient), rodando queries GÊMEAS que só diferem no
// filtro de v_status ({{statusCmp}}: '=' cancelados | '<>' ativos):
//   - ATIVOS:    c.v_status <> 'Cancelado'  (amostra aleatória, limit)
//   - CANCELADOS:c.v_status  = 'Cancelado'  (cancelados dentro de [from,to])
//
// As queries agora vivem no CATÁLOGO central (scripts/queries/registry.mjs,
// engine 'cancelados', ids Q_COH_*) — visíveis e EDITÁVEIS pela tela de
// Configurações, como todas as outras. Aqui só resolvemos o SQL efetivo
// (override ?? default) via getEffectiveSql(id, { cancelled }) e orquestramos.
//
// Tudo é ancorado em `contracts` (NÃO usa authentication_contracts, que não
// existe para cancelados). Por isso a engine de REDE fica de fora aqui — sua
// infra depende de authentication_contracts. Os campos de rede saem zerados.
//
// Datas entram como parâmetros ($n), nunca interpoladas (à prova de injeção).
// ─────────────────────────────────────────────────────────────────────────
import { getEffectiveSql } from './index.mjs'

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
    cancellationMotive: r.cancellation_motive != null && String(r.cancellation_motive).trim() ? String(r.cancellation_motive).trim() : null,
    // Código do último evento de cancelamento — classificação estruturada do
    // motivo, preferida ao texto livre acima (ver cancellationMotive.ts).
    cancellationCode: r.cancellation_code != null && String(r.cancellation_code).trim() ? String(r.cancellation_code).trim() : null,
    plan: r.plan_name?.trim() || 'Sem plano',
    monthlyValue: Number(r.selling_price) || 0,
    paymentForm: r.payment_form?.trim() || 'Não informado',
    city: r.city?.trim() || 'Não informado',
    neighborhood: r.neighborhood?.trim() || '(s/ bairro)',
    // sinais (preenchidos abaixo)
    onTimeInvoices: 0, lateInvoices: 0, overdueInvoices: 0, totalInvoices: 0,
    renegotiations: 0, trustReleases: 0,
    equipment: [],
    onuStatusCounts: {},
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
  const warnings = []
  // SQL efetivo (override ?? default) resolvido para o coorte. {{statusCmp}} vira
  // '=' (cancelados) ou '<>' (ativos) conforme `cancelled`.
  const q = (id) => getEffectiveSql(id, { cancelled })

  const baseSql = q(cancelled ? 'Q_COH_CANCELLED_BASE' : 'Q_COH_ACTIVE_BASE')
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

  const P = [contractNumbers, from, to]
  const [inv, reneg, trust, equip, fprot, fsched, freasons, iprot, isched, rprot, rdim] = await Promise.all([
    safeQuery(pool, q('Q_COH_INV'), P, 'inv', warnings),
    safeQuery(pool, q('Q_COH_RENEG'), P, 'reneg', warnings),
    safeQuery(pool, q('Q_COH_TRUST'), P, 'trust', warnings),
    safeQuery(pool, q('Q_COH_EQUIP'), [contractNumbers], 'equip', warnings),
    safeQuery(pool, q('Q_COH_FIELD_PROT'), P, 'fieldProt', warnings),
    safeQuery(pool, q('Q_COH_FIELD_SCHED'), P, 'fieldSched', warnings),
    safeQuery(pool, q('Q_COH_FIELD_REASONS'), P, 'fieldReasons', warnings),
    safeQuery(pool, q('Q_COH_INST_PROT'), P, 'instProt', warnings),
    safeQuery(pool, q('Q_COH_INST_SCHED'), P, 'instSched', warnings),
    safeQuery(pool, q('Q_COH_REL_PROT'), P, 'relProt', warnings),
    safeQuery(pool, q('Q_COH_REL_DIM'), P, 'relDim', warnings),
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
