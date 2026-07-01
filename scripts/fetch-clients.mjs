// ETL: lê clientes ativos + sinais financeiros REAIS da base ELLEVEN (PostgreSQL)
// e gera src/data/realClients.json. NENHUM dado mockado.
//   - amostra de N clientes (identidade real)
//   - por contrato (contract_number): faturas no prazo / atrasadas / em aberto,
//     renegociações e desbloqueios por confiança
//   - formas de pagamento ativas (para config dinâmica)
//   - série mensal real de adimplência + totais reais (clientes, contratos, MRR)
// Uso: node scripts/fetch-clients.mjs [sampleSize=2000 | full]
//   sem argumento → amostra de 2000 | 'full'/'all'/'0' → BASE COMPLETA
//
// As queries SQL ficam no registro central scripts/queries/ (editáveis pela
// tela de Configurações). Aqui obtemos o SQL EFETIVO de cada uma (override do
// usuário, se houver, senão o default) via buildEffectiveQueries().
import { writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { makePool } from './db.mjs'
import { makeMariaPool } from './db-maria.mjs'
import { buildEffectiveQueries } from './queries/index.mjs'
import { FROM_DATE } from './queries/registry.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Snapshot gzipado. Caminho configurável por SNAPSHOT_OUT (o job noturno grava
// no volume compartilhado); sem a env, cai no asset estático servido no dev.
const OUT = process.env.SNAPSHOT_OUT
  ? resolve(process.env.SNAPSHOT_OUT)
  : resolve(__dirname, '../public/realClients.data')
const ARG = (process.argv[2] || '').toLowerCase()
const FULL = ARG === 'full' || ARG === 'all' || ARG === '0'
const SAMPLE_SIZE = FULL ? Infinity : (Number(process.argv[2]) || 2000)
// PII/geo não usados no front — removidos do snapshot (privacidade + tamanho).
const STRIP_FIELDS = ['cpfCnpj', 'phone', 'email', 'lat', 'lng', 'state']

// SQL efetivo de cada query (override do usuário ?? default), do registro
// central. {{sampleClause}} é resolvido conforme amostra/base completa.
const {
  Q_TOTALS, Q_BY_CITY, Q_PAYFORMS, Q_SAMPLE, Q_MONTHLY_OK,
  Q_COMM_SELLERS, Q_COMM_PLANS, Q_COMM_VALUES, Q_COMM_CITIES, Q_COMM_HOODS, Q_COMM_CGENDER, Q_COMM_SGENDER,
  Q_CONN_AGG, Q_CONN_MODELS,
  Q_FIELD_PROT, Q_FIELD_SCHED, Q_FIELD_REASONS, Q_FIELD_REASON_LIST, Q_FIELD_TECH_LIST,
  Q_INST_PROT, Q_INST_SCHED, Q_INST_TECH_LIST,
  Q_REL_PROT, Q_REL_DIM, Q_REL_TYPE_LIST, Q_REL_ATT_LIST,
  Q_MARIA_SPLITTER, Q_NET_INFRA,
  Q_INV_AGG, Q_RENEG_AGG, Q_TRUST_AGG,
} = buildEffectiveQueries({ full: FULL })

const pool = makePool()
console.log(`Conectado em ${process.env.DB_ELLEVEN_HOST}/${process.env.DB_ELLEVEN_DATABASE}. Coletando…`)

try {
  const [totals, byCity, payforms, sample, commSellers, commPlans, commValues, commCities, commHoods, commCGender, commSGender, connModels, fieldReasonList, fieldTechList, instTechList, relTypeList, relAttList] = await Promise.all([
    pool.query(Q_TOTALS),
    pool.query(Q_BY_CITY),
    pool.query(Q_PAYFORMS),
    pool.query(Q_SAMPLE, FULL ? [] : [Math.ceil(SAMPLE_SIZE * 1.25)]),
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
  const clients = FULL ? Array.from(byClient.values()) : Array.from(byClient.values()).slice(0, SAMPLE_SIZE)
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

  // Remove PII/geo de cada cliente antes de exportar (não usados no front).
  const clientsOut = clients.map((c) => { const o = { ...c }; for (const k of STRIP_FIELDS) delete o[k]; return o })

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'ELLEVEN / PostgreSQL — dados reais (sem mock)',
      fromDate: FROM_DATE,
      sampleSize: clients.length,
      coverage: FULL ? 'full' : 'sample',
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
    clients: clientsOut,
  }

  mkdirSync(dirname(OUT), { recursive: true })
  const json = JSON.stringify(payload)
  const gz = gzipSync(json, { level: 9 })
  writeFileSync(OUT, gz)
  console.log(`OK — ${clients.length} clientes (${FULL ? 'BASE COMPLETA' : 'amostra'}) · JSON ${(json.length / 1048576).toFixed(1)} MB → gzip ${(gz.length / 1048576).toFixed(1)} MB em ${OUT}`)
} catch (e) {
  console.error('ERRO:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
