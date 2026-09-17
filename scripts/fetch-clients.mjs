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
import { makeAutoIspPool } from './db-autoisp.mjs'
import { buildEffectiveQueries } from './queries/index.mjs'
import { FROM_DATE, NON_BILLED_CONTRACT_TYPES } from './queries/registry.mjs'
import { buildCohort } from './queries/cohort.mjs'

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

// Lista distinta { value, count } de um atributo string dos clientes, ordenada
// por frequência desc — mesmo shape das listas comerciais/conexão do payload.
function distinctFromClients(clients, pick) {
  const counts = new Map()
  for (const c of clients) {
    const v = (pick(c) || '').trim()
    if (!v) continue
    counts.set(v, (counts.get(v) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

// SQL efetivo de cada query (override do usuário ?? default), do registro
// central. {{sampleClause}} é resolvido conforme amostra/base completa.
const {
  Q_TOTALS, Q_BY_CITY, Q_PAYFORMS, Q_SAMPLE, Q_MONTHLY_OK,
  Q_COMM_SELLERS, Q_COMM_PLANS, Q_COMM_VALUES, Q_COMM_CITIES, Q_COMM_HOODS, Q_COMM_CGENDER, Q_COMM_SGENDER,
  Q_CONN_AGG, Q_CONN_MODELS,
  Q_FIELD_PROT, Q_FIELD_SCHED, Q_FIELD_REASONS, Q_FIELD_REASON_LIST, Q_FIELD_TECH_LIST,
  Q_INST_PROT, Q_INST_SCHED, Q_INST_TECH_LIST,
  Q_REL_PROT, Q_REL_DIM, Q_REL_TYPE_LIST, Q_REL_ATT_LIST,
  Q_MARIA_SPLITTER, Q_NET_INFRA, Q_NET_INFRA_CANCELLED,
  Q_INV_AGG, Q_RENEG_AGG, Q_TRUST_AGG,
  Q_AUTOISP_ONU_STATUS, Q_AUTOISP_ONU_HEALTH, Q_AUTOISP_ONU_LAN, Q_AUTOISP_CPE, Q_AUTOISP_WIFI,
  Q_WD_PROT,
} = buildEffectiveQueries({ full: FULL })

const pool = makePool()
console.log(`Conectado em ${process.env.DB_ELLEVEN_HOST}/${process.env.DB_ELLEVEN_DATABASE}. Coletando…`)

try {
  const [totals, byCity, payforms, sample, commSellers, commPlans, commValues, commCities, commHoods, commCGender, commSGender, connModels, fieldReasonList, fieldTechList, instTechList, relTypeList, relAttList, wdProt] = await Promise.all([
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
    pool.query(Q_WD_PROT),
  ])

  // ── Retiradas de equipamento — rollup (base-wide, protocolo-a-protocolo) ──
  // wdProt: uma linha por protocolo { protocol, contract_number, is_cancelled,
  // retrieved, technician, visits, outcome_date }. Agregamos aqui em KPIs/
  // rankings/histograma e montamos um índice por CONTRATO (wdByContract) para
  // cruzar com os cancelados adiante (nível pessoa).
  const wdByContract = new Map() // contract_number -> { protocols, retrieved, visits, technicians:Set, lastDate }
  const wdProtocols = []         // linhas cruas por protocolo (compactas) p/ o filtro por período no detalhe
  const withdrawals = (() => {
    const st = { cancelled: { total: 0, retrieved: 0 }, active: { total: 0, retrieved: 0 } }
    const techMap = new Map() // nome -> { protocols, retrieved, visits }
    const histo = new Map()   // '1'|'2'|'3'|'4+' -> count
    let total = 0, retrieved = 0, visitsSum = 0
    for (const r of wdProt.rows) {
      total++
      const got = r.retrieved === true
      const v = Number(r.visits) || 0
      visitsSum += v
      if (got) retrieved++
      // linha crua compacta p/ o detalhe: x=cancelado, r=retirado, v=visitas,
      // t=técnico, d=data do desfecho (usada no filtro por período da tela).
      wdProtocols.push({
        x: r.is_cancelled ? 1 : 0,
        r: got ? 1 : 0,
        v,
        t: (r.technician || '').trim(),
        d: r.outcome_date ? new Date(r.outcome_date).toISOString().slice(0, 10) : null,
      })
      const bucket = r.is_cancelled ? st.cancelled : st.active
      bucket.total++; if (got) bucket.retrieved++
      const name = (r.technician || '').trim() || '(sem técnico)'
      const tm = techMap.get(name) || { protocols: 0, retrieved: 0, visits: 0 }
      tm.protocols++; if (got) tm.retrieved++; tm.visits += v
      techMap.set(name, tm)
      const key = v >= 4 ? '4+' : String(v || 1)
      histo.set(key, (histo.get(key) || 0) + 1)
      // índice por contrato
      const cn = r.contract_number != null ? String(r.contract_number) : ''
      if (cn) {
        let e = wdByContract.get(cn)
        if (!e) { e = { protocols: 0, retrieved: 0, visits: 0, technicians: new Set(), lastDate: null }; wdByContract.set(cn, e) }
        e.protocols++; if (got) e.retrieved++; e.visits += v
        if (r.technician && r.technician.trim()) e.technicians.add(r.technician.trim())
        const od = r.outcome_date ? new Date(r.outcome_date).toISOString().slice(0, 10) : null
        if (od && (!e.lastDate || od > e.lastDate)) e.lastDate = od
      }
    }
    const technicians = [...techMap.entries()]
      .map(([value, t]) => ({
        value, protocols: t.protocols, retrieved: t.retrieved,
        successRate: t.protocols ? t.retrieved / t.protocols : 0,
        avgVisits: t.protocols ? t.visits / t.protocols : 0,
      }))
      .sort((a, b) => b.protocols - a.protocols)
    return {
      total, retrieved, notRetrieved: total - retrieved,
      successRate: total ? retrieved / total : 0,
      avgVisits: total ? visitsSum / total : 0,
      contractsWithWithdrawal: wdByContract.size,
      byStatus: st,
      technicians,
      visitsHistogram: ['1', '2', '3', '4+'].map((k) => ({ visits: k, count: histo.get(k) || 0 })),
      // cancellation{} e people[] preenchidos após materializar os cancelados.
      cancellation: null,
      people: [],
    }
  })()
  console.log(`Retiradas: ${withdrawals.total} protocolos · ${withdrawals.retrieved} retirados (${(withdrawals.successRate * 100).toFixed(0)}%) · ${withdrawals.technicians.length} motoboys · ${wdByContract.size} contratos.`)

  const t = totals.rows[0]
  console.log(`Totais: ${t.clients} clientes, ${t.contracts} contratos, MRR R$ ${Number(t.mrr).toLocaleString('pt-BR')}`)

  // ── Uma linha por CONTRATO ───────────────────────────────────────────────
  // Antes isto deduplicava por `client_id` e ficava com o primeiro contrato de
  // cada pessoa. Custo medido: 3.356 dos 86.603 contratos nunca eram
  // analisados (e o MRR deles não entrava em receita em risco). Quem tem 3
  // contratos e cancela 1 aparecia como "não cancelou"; 2.838 pessoas têm mais
  // de um contrato, e uma tem 25.
  //
  // A unidade do sistema é o CONTRATO. A identidade (`clientId`, que as engines
  // usam para agrupar) aponta para o número do contrato; a pessoa continua
  // disponível em `personId` para quem quiser a visão por assinante.
  const byClient = new Map()
  for (const r of sample.rows) {
    // Cortesia e afins carregam o preço de TABELA do plano, mas nunca são
    // faturados. Sem zerar aqui, esse valor vira "receita em risco" em toda a
    // plataforma — já apareceu a própria SEBRATEL na lista de receita a perder.
    // O cliente continua na base, com score e ranking; só a receita é zero.
    const naoFaturado = NON_BILLED_CONTRACT_TYPES.includes((r.payment_form || '').trim())
    const price = naoFaturado ? 0 : (Number(r.selling_price) || 0)
    // Sem número de contrato não há identidade estável — a linha não entra.
    const contractNumber = r.contract_number != null ? String(r.contract_number) : ''
    if (!contractNumber || byClient.has(contractNumber)) continue
    const toDate = (x) => (x ? new Date(x).toISOString().slice(0, 10) : null)
    byClient.set(contractNumber, {
      clientId: contractNumber,
      personId: String(r.client_id),
      name: r.client_name?.trim() || 'Cliente sem nome',
      clientGender: r.client_gender != null ? String(r.client_gender) : '(sem gênero)',
      clientBirth: toDate(r.client_birth),
      seller: r.seller_name?.trim() || '(sem vendedor)',
      sellerGender: r.seller_gender != null ? String(r.seller_gender) : '(sem gênero)',
      sellerBirth: toDate(r.seller_birth),
      sellerAdmitted: toDate(r.seller_admitted),
      contractNumber,
      contractDate: r.created_contract ? new Date(r.created_contract).toISOString().slice(0, 10) : null,
      plan: r.plan_name?.trim() || 'Sem plano',
      monthlyValue: price,
      // Marca para a tela poder dizer "R$ 0 porque não é faturado", em vez de
      // parecer dado faltando.
      notBilled: naoFaturado || undefined,
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
      onuStatusCounts: {},
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
  // Índice por PESSOA → lista de contratos. Algumas queries devolvem client_id
  // (infra de rede, fallback de ONU); como a pessoa pode ter vários contratos,
  // o sinal dela precisa chegar em TODOS eles. Com um Map 1:1 aqui, o segundo
  // contrato ficava sem infra e sem quedas de PPPoE, silenciosamente.
  const byPersonId = new Map()
  for (const c of clients) {
    const arr = byPersonId.get(c.personId)
    if (arr) arr.push(c); else byPersonId.set(c.personId, [c])
  }
  const contractNumbers = Array.from(byContract.keys())
  const clientIds = Array.from(byPersonId.keys())
  console.log(`Amostra: ${clients.length} contratos de ${byPersonId.size} pessoas. Buscando sinais financeiros…`)

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

  // AutoISP — quedas de PPPoE: mudanças de status da ONU agregadas por
  // contrato + status (cross-DB). Banco opcional: sem DB_AUTOISP_* no .env o
  // ETL segue sem o sinal (onuStatusCounts fica vazio). O casamento com a base
  // é por contract_id (→ contract_number) com fallback em client_id.
  const onuByContract = new Map()
  const onuByClient = new Map()
  if (process.env.DB_AUTOISP_HOST) {
    // AutoISP é opcional e falhava em SILÊNCIO: se a query falhasse (ex.: banco
    // AutoISP ocupado/lento na janela da madrugada → timeout), o ETL seguia sem
    // as quedas e ninguém era avisado. Como o re-run manual costuma funcionar (a
    // carga já passou), aqui a gente RETENTA com backoff antes de desistir — e,
    // se desistir, avisa ALTO (não some calado). Nº de tentativas: AUTOISP_RETRIES.
    const ATTEMPTS = Math.max(1, Number(process.env.AUTOISP_RETRIES) || 3)
    // Um pool só para TODAS as consultas do AutoISP, e elas rodam em SÉRIE.
    // Em paralelo seriam 4 varreduras simultâneas no banco deles — o oposto do
    // que queremos. Em série o conjunto todo leva ~15s fora a query de quedas.
    const autoisp = makeAutoIspPool()
    // Retenta por consulta, não pelo bloco: assim uma falha no sinal de enlace
    // não custa 3 re-execuções da query de quedas (que varre 4,3 mi de linhas).
    const tryQuery = async (label, sql, params = []) => {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          const t0 = Date.now()
          const res = await autoisp.query(sql, params)
          console.log(`  ${label}: ${res.rows.length} linhas em ${((Date.now() - t0) / 1000).toFixed(1)}s`)
          return res
        } catch (e) {
          console.warn(`  ${label}: tentativa ${attempt}/${ATTEMPTS} falhou — ${e.message}`)
          if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 15000)) // backoff 15s, 30s…
        }
      }
      return null
    }
    try {
      console.log('AutoISP — coletando sinais de conexão…')
      const onuRes = await tryQuery('quedas de PPPoE', Q_AUTOISP_ONU_STATUS, [FROM_DATE])
      if (onuRes) {
        for (const r of onuRes.rows) {
          const status = (r.new_status || '').trim()
          const qty = Number(r.qty) || 0
          if (!status || !qty) continue
          if (r.contract_id != null) {
            const m = onuByContract.get(String(r.contract_id)) || {}
            m[status] = (m[status] || 0) + qty
            onuByContract.set(String(r.contract_id), m)
          }
          if (r.client_id != null) {
            const m = onuByClient.get(String(r.client_id)) || {}
            m[status] = (m[status] || 0) + qty
            onuByClient.set(String(r.client_id), m)
          }
        }
      } else {
        console.warn(`⚠️  ONU (AutoISP): FALHOU em ${ATTEMPTS} tentativa(s) — o snapshot vai SEM as quedas de PPPoE. Provável carga/janela do banco AutoISP no horário do ETL (ETL_HOUR=${process.env.ETL_HOUR ?? '3'}).`)
      }

      // ── Qualidade do enlace (foto atual) ──
      // As três consultas varrem a base INTEIRA do AutoISP (215 mil ONUs), mas
      // gravamos direto no objeto do cliente via byContract: nada de mapa
      // intermediário, então o pico de memória é só o resultado da consulta da
      // vez (~42 MB na maior) em vez de um índice de 215 mil entradas.
      let hits = { health: 0, lan: 0, cpe: 0, wifi: 0 }
      const healthRes = await tryQuery('enlace óptico', Q_AUTOISP_ONU_HEALTH)
      if (healthRes) {
        for (const r of healthRes.rows) {
          const c = byContract.get(String(r.contract_id))
          if (!c) continue
          // Leitura óptica válida fica entre −5 e −40 dBm. O AutoISP guarda
          // milhares de linhas entre −9 e 0 (e zeros) que são ONU sem leitura,
          // não sinal excelente — se entrassem, virariam "atenuação ótima".
          const rx0 = r.calculated_rx_power != null ? Number(r.calculated_rx_power) : null
          const rx = rx0 != null && rx0 <= -5 && rx0 >= -40 ? rx0 : null
          // Um contrato pode ter MAIS DE UMA ONU (contracted_services distintos).
          // Sem critério, a última linha lida ganhava e o score do cliente
          // dependia da ordem do banco. Fica com a PIOR leitura: é ela que
          // explica a reclamação, e o pior enlace é o que limita o cliente.
          const pior = c.connRxPower == null || (rx != null && rx < c.connRxPower)
          if (pior) {
            if (rx != null) c.connRxPower = rx
            c.connOnuStatus = (r.calculated_status || '').trim() || 'sem_leitura'
          } else if (c.connOnuStatus === undefined) {
            c.connOnuStatus = (r.calculated_status || '').trim() || 'sem_leitura'
          }
          const dist = r.distance != null ? Number(r.distance) : null
          if (dist != null && dist > 0) c.connFiberDistanceM = Math.max(c.connFiberDistanceM ?? 0, dist)
          const temp = r.optical_temperature != null ? Number(r.optical_temperature) : null
          if (temp != null && temp > 0) c.connOnuTempC = Math.max(c.connOnuTempC ?? 0, temp)
          hits.health++
        }
      }
      const lanRes = await tryQuery('velocidade da porta LAN', Q_AUTOISP_ONU_LAN)
      if (lanRes) {
        for (const r of lanRes.rows) {
          const c = byContract.get(String(r.contract_id))
          if (!c) continue
          // Idem multi-ONU: fica com a MAIOR velocidade negociada, que é a
          // melhor porta disponível ao cliente. 0 = nenhuma porta com link.
          const mbps = r.lan_mbps != null ? Number(r.lan_mbps) : 0
          c.connLanMbps = Math.max(c.connLanMbps ?? 0, mbps)
          hits.lan++
        }
      }
      const cpeRes = await tryQuery('equipamento (TR-069)', Q_AUTOISP_CPE)
      if (cpeRes) {
        for (const r of cpeRes.rows) {
          const c = byContract.get(String(r.contract_id))
          if (!c) continue
          // Só o modelo cru. A geração do Wi-Fi (ac/ax) é derivada dele no
          // motor, em connectionConfig.ts — o de-para mora num lugar só, e um
          // modelo novo aparece na tela como "Modelo não identificado" em vez
          // de exigir um ETL novo.
          // Primeiro modelo não vazio: se o contrato tem dois CPEs, qualquer um
          // serve para a geração do Wi-Fi (são do mesmo padrão na prática).
          if (!c.connCpeModel) {
            c.connCpeModel = (r.router_model_name || '').trim()
            c.connCpeFirmware = (r.firmware_version || '').trim()
          }
          hits.cpe++
        }
      }
      // ── Wi-Fi dentro da casa + saúde do CPE (TR-069) ──
      const wifiRes = await tryQuery('Wi-Fi na casa (TR-069)', Q_AUTOISP_WIFI)
      if (wifiRes) {
        for (const r of wifiRes.rows) {
          const c = byContract.get(String(r.contract_id))
          if (!c) continue
          const rssi = r.rssi_mediano != null ? Number(r.rssi_mediano) : null
          // Multi-CPE no mesmo contrato: fica com o PIOR Wi-Fi mediano — é ele
          // que explica a reclamação, mesma regra da potência óptica.
          if (rssi != null && (c.connWifiRssi == null || rssi < c.connWifiRssi)) {
            c.connWifiRssi = rssi
            c.connWifiWorstRssi = r.pior_rssi != null ? Number(r.pior_rssi) : null
            c.connWifiDevices = r.devices_wifi != null ? Number(r.devices_wifi) : null
            c.connWifiDevices24g = r.devices_24g != null ? Number(r.devices_24g) : null
            c.connWifiDevices5g = r.devices_5g != null ? Number(r.devices_5g) : null
          }
          // Memória e temperatura vêm de quase 100% dos CPEs: fica com o pior
          // (maior) valor entre os equipamentos do contrato.
          const mem = r.cpe_mem_pct != null ? Number(r.cpe_mem_pct) : null
          if (mem != null && mem > 0) c.connCpeMemPct = Math.max(c.connCpeMemPct ?? 0, mem)
          const ctemp = r.cpe_temp_c != null ? Number(r.cpe_temp_c) : null
          if (ctemp != null && ctemp > 0) c.connCpeTempC = Math.max(c.connCpeTempC ?? 0, ctemp)
          hits.wifi++
        }
      }
      console.log(`AutoISP — enlace casado com a base: ${hits.health} ópticos, ${hits.lan} portas LAN, ${hits.cpe} equipamentos, ${hits.wifi} leituras de Wi-Fi/CPE.`)
    } finally { await autoisp.end() }
  } else {
    console.log('ONU (AutoISP): DB_AUTOISP_* ausentes no .env — sinal pulado.')
  }
  const applyOnu = (c) => {
    // `clientId` agora é o contrato; o fallback do AutoISP vem por pessoa.
    const m = (c.contractNumber && onuByContract.get(c.contractNumber)) || onuByClient.get(c.personId)
    if (m) c.onuStatusCounts = { ...m }
  }

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
    pool.query(Q_NET_INFRA, [clientIds]),
  ])

  // Network — infra (PG) de TODA a base × massivas (Maria) por splitter_code.
  // A infra (site/concentrador/…) é gravada para todos os clientes (1ª linha
  // vista por cliente); as métricas de massiva só somam quando o splitter do
  // cliente aparece entre os afetados (massiveBySplitter).
  const netAcc = new Map()
  let withInfra = 0
  for (const r of netInfra.rows) {
    // A pessoa pode ter vários contratos: a infra vai para todos eles.
    for (const c of byPersonId.get(String(r.client_id)) ?? []) {
    let a = netAcc.get(c.clientId)
    if (!a) {
      a = { codes: new Set(), countSum: 0, offlineW: 0, overageSum: 0, overageN: 0 }
      netAcc.set(c.clientId, a)
      c.netSite = r.site?.trim() || ''
      c.netConcentrator = r.concentrator?.trim() || ''
      c.netAccessPoint = r.access_point?.trim() || ''
      c.netSplitter = r.splitter?.trim() || ''
      c.netSplitterCode = r.splitter_code != null ? String(r.splitter_code) : ''
      c.netSlot = r.slot != null ? String(r.slot) : ''
      c.netPon = r.pon != null ? String(r.pon) : ''
      if (c.netSite) withInfra++
    }
    const code = r.splitter_code != null ? String(r.splitter_code) : ''
    if (!code) continue
    const agg = massiveBySplitter.get(code)
    if (!agg || a.codes.has(code)) continue
    a.codes.add(code)
    a.countSum += agg.count
    a.offlineW += agg.offline * agg.count
    if (agg.overage > 0) { a.overageSum += agg.overage; a.overageN++ }
    }
  }
  let withMassive = 0
  for (const [contractNumber, a] of netAcc) {
    const c = byContract.get(contractNumber); if (!c) continue
    c.netMassiveCount = a.countSum
    c.netAvgOfflineMin = a.countSum > 0 ? Math.round(a.offlineW / a.countSum) : 0
    c.netAvgOverageMin = a.overageN > 0 ? Math.round(a.overageSum / a.overageN) : 0
    if (a.countSum > 0) withMassive++
  }
  console.log(`Network: ${withInfra}/${clients.length} contratos com infra · ${withMassive} em splitters afetados por massiva.`)

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

  for (const c of clients) applyOnu(c)
  const withOnu = clients.filter((c) => Object.keys(c.onuStatusCounts).length > 0).length
  if (onuByContract.size || onuByClient.size) console.log(`ONU (AutoISP): ${withOnu}/${clients.length} contratos com mudanças de status casadas na base.`)

  const withInv = clients.filter((c) => c.totalInvoices > 0).length
  console.log(`Sinais aplicados: ${withInv}/${clients.length} contratos com faturas no período.`)

  // Remove PII/geo de cada cliente antes de exportar (não usados no front).
  const clientsOut = clients.map((c) => { const o = { ...c }; for (const k of STRIP_FIELDS) delete o[k]; return o })

  // Coorte de CANCELADOS materializada (janela ampla) — a tela de Pontuação
  // Sugerida lê daqui, sem consultar o banco ao vivo. Mesmos campos do ativo
  // (o cohort.mjs já não traz PII).
  const CANCELLED_MONTHS = Number(process.env.CANCELLED_MONTHS) || 24
  const _to = new Date(), _from = new Date(); _from.setMonth(_from.getMonth() - CANCELLED_MONTHS)
  const cancelledFrom = _from.toISOString().slice(0, 10), cancelledTo = _to.toISOString().slice(0, 10)
  let cancelledClients = []
  try {
    const cc = await buildCohort(pool, { cancelled: true, from: cancelledFrom, to: cancelledTo })
    cancelledClients = cc.clients
    console.log(`Cancelados: ${cancelledClients.length} em ${cancelledFrom}..${cancelledTo}${cc.warnings.length ? ` (avisos: ${cc.warnings.join('; ')})` : ''}`)

    // ONU dos cancelados — mesmo mapa do AutoISP, casado por contrato/cliente.
    for (const c of cancelledClients) applyOnu(c)
    const cancWithOnu = cancelledClients.filter((c) => Object.keys(c.onuStatusCounts || {}).length > 0).length
    if (onuByContract.size || onuByClient.size) console.log(`Cancelados/ONU: ${cancWithOnu}/${cancelledClients.length} com mudanças de status.`)

    // Rede dos cancelados — infra via occurrences (histórico, sobrevive ao
    // cancelamento) para TODA a coorte × massivas (MariaDB, já em memória).
    // Mesma lógica do ativo, porém chaveada por contract_number.
    if (cancelledClients.length) {
      const byCancContract = new Map(cancelledClients.filter((c) => c.contractNumber).map((c) => [c.contractNumber, c]))
      const cancContracts = [...byCancContract.keys()]
      try {
        const netC = await pool.query(Q_NET_INFRA_CANCELLED, [cancContracts])
        const acc = new Map()
        let cWithInfra = 0
        for (const r of netC.rows) {
          const c = byCancContract.get(String(r.contract_number)); if (!c) continue
          let a = acc.get(c.contractNumber)
          if (!a) {
            a = { codes: new Set(), countSum: 0, offlineW: 0, overageSum: 0, overageN: 0 }
            acc.set(c.contractNumber, a)
            c.netSite = r.site?.trim() || ''
            c.netConcentrator = r.concentrator?.trim() || ''
            c.netAccessPoint = r.access_point?.trim() || ''
            c.netSplitter = r.splitter?.trim() || ''
            c.netSplitterCode = r.splitter_code != null ? String(r.splitter_code) : ''
            c.netSlot = r.slot != null ? String(r.slot) : ''
            c.netPon = r.pon != null ? String(r.pon) : ''
            if (c.netSite) cWithInfra++
          }
          const code = r.splitter_code != null ? String(r.splitter_code) : ''
          if (!code) continue
          const agg = massiveBySplitter.get(code); if (!agg) continue
          if (a.codes.has(code)) continue
          a.codes.add(code)
          a.countSum += agg.count
          a.offlineW += agg.offline * agg.count
          if (agg.overage > 0) { a.overageSum += agg.overage; a.overageN++ }
        }
        for (const [contractNumber, a] of acc) {
          const c = byCancContract.get(contractNumber); if (!c) continue
          c.netMassiveCount = a.countSum
          c.netAvgOfflineMin = a.countSum > 0 ? Math.round(a.offlineW / a.countSum) : 0
          c.netAvgOverageMin = a.overageN > 0 ? Math.round(a.overageSum / a.overageN) : 0
        }
        console.log(`Cancelados/Rede: ${cWithInfra}/${cancelledClients.length} com infra.`)
      } catch (e) { console.warn('Cancelados/Rede: falha —', e.message) }
    }
  } catch (e) { console.warn('Cancelados: falha ao materializar —', e.message) }

  // ── Retiradas × Cancelamentos (nível pessoa) ───────────────────
  // Cruza os protocolos de retirada (wdByContract) com a coorte de cancelados
  // (por contract_number). Enriquece cada cancelado com o status de retirada e
  // materializa: indicadores de recuperação de equipamento + lista de pessoas.
  let wdPeopleFull = [] // lista completa (vai no detalhe servido sob demanda)
  {
    let withWithdrawal = 0, recovered = 0, notRecovered = 0, mrrAtRisk = 0, visitsSum = 0
    const people = []
    for (const c of cancelledClients) {
      const e = c.contractNumber ? wdByContract.get(c.contractNumber) : null
      // Campos de retirada no próprio cancelado (também úteis no perfil de Cancelados)
      c.wdProtocols = e ? e.protocols : 0
      c.wdVisits = e ? e.visits : 0
      c.wdRecovered = e ? e.retrieved > 0 : false
      c.wdTechnicians = e ? [...e.technicians] : []
      c.wdLastDate = e ? e.lastDate : null
      if (!e) continue
      withWithdrawal++
      visitsSum += e.visits
      if (e.retrieved > 0) recovered++
      else { notRecovered++; mrrAtRisk += Number(c.monthlyValue) || 0 }
      people.push({
        name: c.name, contractNumber: c.contractNumber,
        cancellationDate: c.cancellationDate, cancellationMotive: c.cancellationMotive,
        plan: c.plan, city: c.city, monthlyValue: c.monthlyValue,
        protocols: e.protocols, visits: e.visits, recovered: e.retrieved > 0,
        technicians: [...e.technicians], lastDate: e.lastDate,
      })
    }
    // Mais recentes primeiro. A lista COMPLETA vai no detalhe (servido sob
    // demanda em /api/withdrawals) — o filtro por período recomputa no cliente.
    people.sort((a, b) => String(b.cancellationDate || '').localeCompare(String(a.cancellationDate || '')))
    wdPeopleFull = people

    // Agregados do período inteiro (default da tela antes de filtrar). window =
    // janela da coorte de cancelados; cancelledTotal = denominador do "% com retirada".
    withdrawals.cancellation = {
      cancelledTotal: cancelledClients.length,
      withWithdrawal,
      recovered,
      notRecovered,
      recoveryRate: withWithdrawal ? recovered / withWithdrawal : 0,
      avgVisits: withWithdrawal ? visitsSum / withWithdrawal : 0,
      mrrAtRisk,
      window: { from: cancelledFrom, to: cancelledTo, months: CANCELLED_MONTHS },
    }
    // A lista de pessoas não vai mais no bloco leve (fica no detalhe).
    withdrawals.people = []
    withdrawals.peopleTotal = people.length
    console.log(`Retiradas/Cancelados: ${withWithdrawal}/${cancelledClients.length} cancelados com retirada · ${recovered} recuperados · ${notRecovered} em risco (R$ ${mrrAtRisk.toLocaleString('pt-BR')}/mês).`)
  }

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
    // Network Engine — totais de massivas (MariaDB) + listas distintas de infra
    // (site/concentrador/…) para os índices dinâmicos, derivadas da base ativa.
    network: {
      totalMassives,
      splittersAffected: massiveCodes.length,
      sites: distinctFromClients(clients, (c) => c.netSite),
      concentrators: distinctFromClients(clients, (c) => c.netConcentrator),
      accessPoints: distinctFromClients(clients, (c) => c.netAccessPoint),
      splitters: distinctFromClients(clients, (c) => c.netSplitter),
      slots: distinctFromClients(clients, (c) => c.netSlot),
      pons: distinctFromClients(clients, (c) => c.netPon),
    },
    // Retiradas de equipamento — KPIs/rankings/histograma (base-wide, leve).
    withdrawals,
    // Detalhe cru (protocolos + pessoas) p/ o filtro por período — pesado,
    // excluído do /api/dataset/lists e servido sob demanda em /api/withdrawals.
    withdrawalDetail: { protocols: wdProtocols, people: wdPeopleFull },
    clients: clientsOut,
    // Coorte de cancelados (materializada) + a janela coberta.
    cancelledClients,
    cancelledMeta: { from: cancelledFrom, to: cancelledTo, months: CANCELLED_MONTHS, count: cancelledClients.length },
  }

  mkdirSync(dirname(OUT), { recursive: true })
  const json = JSON.stringify(payload)
  const gz = gzipSync(json, { level: 9 })
  writeFileSync(OUT, gz)
  console.log(`OK — ${clients.length} contratos (${FULL ? 'BASE COMPLETA' : 'amostra'}) · JSON ${(json.length / 1048576).toFixed(1)} MB → gzip ${(gz.length / 1048576).toFixed(1)} MB em ${OUT}`)
} catch (e) {
  console.error('ERRO:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
