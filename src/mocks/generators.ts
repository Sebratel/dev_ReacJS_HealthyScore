import {
  Customer, Payment, Protocol, NetworkEvent, TimelineEvent, Seller,
  RiskLevel, FinancialStatus, PlanType, CustomerStatus,
  HealthClassification, SecondaryScore, HealthScores, DerivedRisks,
  CustomerSignals, FinancialSignals, NetworkSignals, RelationshipSignals,
  InstallationSignals, CommercialSignals, ProfileSignals, Trend, ScoreFactor,
  WifiQuality, PaymentMethod, CustomerSegment, HousingType,
  ConnectionSignals, InfraSignals,
} from '@/types'
import { subDays, subMonths, addDays, format } from 'date-fns'

// ─── Geo Data ─────────────────────────────────────────────────
const CITIES_RS = [
  { name: 'Porto Alegre', coords: [-30.0346, -51.2177] as [number, number], neighborhoods: ['Restinga', 'Rubem Berta', 'Sarandi', 'Lomba do Pinheiro', 'Mário Quintana', 'Cavalhada', 'Belém Novo'] },
  { name: 'Canoas', coords: [-29.9178, -51.1833] as [number, number], neighborhoods: ['Guajuviras', 'Mathias Velho', 'Niterói', 'Rio Branco', 'Centro', 'Igara'] },
  { name: 'Novo Hamburgo', coords: [-29.6783, -51.1306] as [number, number], neighborhoods: ['Rincão', 'Boa Saúde', 'Santo Afonso', 'Rio dos Sinos', 'Canudos', 'Primavera'] },
  { name: 'São Leopoldo', coords: [-29.7604, -51.1472] as [number, number], neighborhoods: ['Fião', 'Campina', 'Santos Dumont', 'Vicentina', 'Centro', 'Duque de Caxias'] },
  { name: 'Gravataí', coords: [-29.9438, -50.9918] as [number, number], neighborhoods: ['Barro Vermelho', 'Santa Fé', 'São Miguel', 'Morada do Vale', 'Copas Verdes'] },
  { name: 'Cachoeirinha', coords: [-29.9477, -51.0929] as [number, number], neighborhoods: ['Jardim América', 'Liberdade', 'Parque dos Anjos', 'União', 'Esmeralda'] },
  { name: 'Alvorada', coords: [-30.0088, -51.0813] as [number, number], neighborhoods: ['Jardim Alvorada', 'Presidente Vargas', 'Nações', 'Umbu', 'São João'] },
  { name: 'Viamão', coords: [-30.0815, -51.0226] as [number, number], neighborhoods: ['Águas Claras', 'Itapuã', 'Capão Raso', 'Vista Alegre', 'Centro'] },
]

const FIRST_NAMES = ['Ana', 'Maria', 'José', 'João', 'Carlos', 'Patricia', 'Fernanda', 'Lucas', 'Gabriel', 'Juliana', 'Roberto', 'Marcos', 'Amanda', 'Rodrigo', 'Aline', 'Felipe', 'Camila', 'Diego', 'Leticia', 'Bruno', 'Mariana', 'Eduardo', 'Priscila', 'Rafael', 'Claudia', 'Anderson', 'Tatiane', 'Thiago', 'Vanessa', 'Alexandre', 'Simone', 'Leandro', 'Cristiane', 'Renato', 'Adriana', 'Fabrício', 'Rosana', 'Marcelo', 'Denise', 'Paulo']
const LAST_NAMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Araújo', 'Melo', 'Barbosa', 'Rocha', 'Cardoso', 'Nascimento', 'Lopes', 'Moreira', 'Nunes', 'Correia', 'Gonçalves', 'Mendes', 'Freitas', 'Castro', 'Teixeira', 'Azevedo']
const PLANS: PlanType[] = ['Fibra 100MB', 'Fibra 200MB', 'Fibra 300MB', 'Fibra 500MB', 'Fibra 1GB']
const PLAN_VALUES: Record<PlanType, number> = { 'Fibra 100MB': 79.9, 'Fibra 200MB': 99.9, 'Fibra 300MB': 119.9, 'Fibra 500MB': 149.9, 'Fibra 1GB': 199.9 }

const SELLER_IDS = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S008']
const SELLER_NAMES: Record<string, string> = { S001: 'Carlos Mendonça', S002: 'Amanda Ferreira', S003: 'Ricardo Souza', S004: 'Beatriz Lima', S005: 'Thiago Rocha', S006: 'Patrícia Nunes', S007: 'Diego Martins', S008: 'Fernanda Costa' }
const SELLER_QUALITY: Record<string, number> = { S001: 85, S002: 92, S003: 61, S004: 78, S005: 45, S006: 88, S007: 55, S008: 73 }
const SELLER_TENURE: Record<string, number> = { S001: 48, S002: 36, S003: 24, S004: 60, S005: 18, S006: 42, S007: 12, S008: 30 }
const SELLER_TYPE: Record<string, 'internal' | 'external'> = { S001: 'internal', S002: 'internal', S003: 'external', S004: 'internal', S005: 'external', S006: 'internal', S007: 'external', S008: 'internal' }

const ONT_MODELS: Record<string, string[]> = {
  ZTE: ['F670L', 'F601', 'F609'], Huawei: ['HG8145V5', 'EG8145X6', 'HG8120C'],
  Nokia: ['G-240W-F', 'G-010G-P'], Intelbras: ['ONU 121 GE', 'ONU 110 GE'],
  Datacom: ['DM991', 'DM985'], Parks: ['P-IQ100'], Generic: ['ONT-GEN'],
}
const CITY_INFRA: Record<string, { site: string; olts: string[] }> = {
  'Porto Alegre': { site: 'POA-CENTRO', olts: ['OLT-POA-01', 'OLT-POA-02'] },
  'Canoas':        { site: 'CAN-01',    olts: ['OLT-CAN-01'] },
  'Novo Hamburgo': { site: 'NH-MAIN',   olts: ['OLT-NH-01'] },
  'São Leopoldo':  { site: 'SL-MAIN',   olts: ['OLT-SL-01'] },
  'Gravataí':      { site: 'GVT-01',    olts: ['OLT-GVT-01'] },
  'Cachoeirinha':  { site: 'CCH-01',    olts: ['OLT-CCH-01'] },
  'Alvorada':      { site: 'ALV-01',    olts: ['OLT-ALV-01'] },
  'Viamão':        { site: 'ALV-01',    olts: ['OLT-ALV-01'] },
}
const COLLABS = [
  { name: 'André Oliveira', score: 88 }, { name: 'Marcos Vieira', score: 75 },
  { name: 'Tiago Borges',   score: 62 }, { name: 'Renato Cruz',   score: 91 },
  { name: 'Paulo Neto',     score: 71 }, { name: 'Sandro Lima',   score: 55 },
]

// ─── Seeded RNG ────────────────────────────────────────────────
let seed = 12345
const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min
const randFloat = (min: number, max: number, d = 2) => parseFloat((rng() * (max - min) + min).toFixed(d))
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))
const genCpf = () => { const n = () => randInt(0, 9); return `${n()}${n()}${n()}.${n()}${n()}${n()}.${n()}${n()}${n()}-${n()}${n()}` }
const genPhone = () => `(51) 9${randInt(6000, 9999)}-${randInt(1000, 9999)}`
const genEmail = (name: string) => { const providers = ['gmail.com', 'hotmail.com', 'yahoo.com.br']; const clean = name.toLowerCase().replace(/\s+/g, '.').replace(/[áàãâ]/g, 'a').replace(/[éê]/g, 'e').replace(/[íî]/g, 'i').replace(/[óõô]/g, 'o').replace(/[úû]/g, 'u').replace(/ç/g, 'c'); return `${clean}${randInt(1, 99)}@${pick(providers)}` }

// ─── Classification helpers ────────────────────────────────────
function scoreToHealthClass(v: number): HealthClassification {
  if (v >= 81) return 'excellent'
  if (v >= 61) return 'healthy'
  if (v >= 41) return 'attention'
  if (v >= 21) return 'high_risk'
  return 'critical'
}

function scoreToRisk(v: number): RiskLevel {
  if (v >= 75) return 'critical'
  if (v >= 55) return 'high'
  if (v >= 35) return 'medium'
  return 'low'
}

function legacyFinStatus(score: number, delay: number): FinancialStatus {
  if (delay > 60) return 'defaulting'
  if (delay > 30) return 'delayed'
  if (score > 65 && rng() > 0.5) return 'negotiating'
  return 'ok'
}

// ─── Score computations ────────────────────────────────────────
function computeFinancialScore(s: FinancialSignals): number {
  let v = 100
  v -= s.overdueBills * 15
  v -= s.brokenRenegotiations * 20
  v -= s.renegotiations * 8
  v -= s.avgPaymentDelay * 0.4
  v += s.paymentMethod === 'auto_debit' ? 10 : s.paymentMethod === 'pix' ? 5 : 0
  v += Math.min(s.onTimePayments * 1.5, 15)
  v -= s.hasNegativation ? 25 : 0
  v -= s.paymentMethodChanges * 5
  return clamp(v)
}

function computeNetworkScore(s: NetworkSignals): number {
  let v = 100
  v -= s.networkEvents30d * 4
  v -= s.massivas30d * 8
  v -= s.pppoeDrops * 1.5
  v -= s.disconnections30d * 2.5
  v += s.uptime30d > 98 ? (s.uptime30d - 98) * 3 : 0
  v -= s.avgLatency > 30 ? (s.avgLatency - 30) * 0.3 : 0
  v -= s.rssi < -70 ? (-70 - s.rssi) * 0.4 : 0
  v += s.wifiQuality === 'excellent' ? 5 : s.wifiQuality === 'good' ? 0 : s.wifiQuality === 'fair' ? -8 : -18
  v -= (100 - s.slaCompliance) * 0.2
  return clamp(v)
}

function computeRelationshipScore(s: RelationshipSignals): number {
  let v = 100
  v -= s.totalTickets * 2.5
  v -= s.recurrentTickets * 10
  v -= s.cancellationThreats * 15
  v -= s.contactsLast30d * 1.5
  v -= s.duplicateBillRequests * 8
  v -= s.planDowngrade ? 20 : 0
  v -= s.sentimentScore < 0 ? s.sentimentScore * -12 : 0
  v += s.npsScore > 8 ? (s.npsScore - 8) * 5 : s.npsScore < 6 ? -(6 - s.npsScore) * 5 : 0
  v -= s.reincidenceRate * 0.25
  return clamp(v)
}

function computeInstallationScore(s: InstallationSignals): number {
  let v = 100
  v -= s.installDelayDays * 3
  v -= s.schedulingChanges * 8
  v -= s.warrantyTickets * 12
  v -= s.technicalReturns * 15
  v -= s.fieldVisits * 4
  v += s.slaCompliant ? 8 : -10
  return clamp(v)
}

function computeCommercialScore(s: CommercialSignals): number {
  let v = s.sellerPerformanceScore * 0.35 + s.campaignQuality * 0.2 + s.planFitScore * 0.25
  v += Math.min(s.contractMonths * 1.8, 20)
  v -= s.isEarlyChurnRisk ? 15 : 0
  return clamp(v)
}

function computeProfileScore(s: ProfileSignals): number {
  const segBase = s.segment === 'A' ? 90 : s.segment === 'B' ? 75 : s.segment === 'C' ? 55 : 35
  let v = segBase * 0.4 + s.locationScore * 0.35 + (s.housingType === 'house' ? 80 : s.housingType === 'condo' ? 70 : 60) * 0.15 + (s.customerType === 'PJ' ? 75 : 65) * 0.1
  v -= s.hasNegativation ? 30 : 0
  return clamp(v)
}

function buildSecondaryScore(
  value: number,
  weight: number,
  trendRoll: number,
  factors: ScoreFactor[],
  insight: string,
): SecondaryScore {
  const trendValue = clamp(Math.round(trendRoll), -30, 30)
  const trend: Trend = trendValue > 4 ? 'improving' : trendValue < -4 ? 'degrading' : 'stable'
  return { value, weight, classification: scoreToHealthClass(value), trend, trendValue, factors, insight }
}

function computeChurnProbability(hs: number, rel: RelationshipSignals, fin: FinancialSignals): number {
  let v = (100 - hs) * 0.65
  v += rel.cancellationThreats * 12
  v += rel.planDowngrade ? 10 : 0
  v += fin.overdueBills > 2 ? 10 : 0
  v += rel.sentimentScore < -0.5 ? 8 : 0
  return clamp(v)
}

function computeEquipmentReturnRisk(fin: FinancialSignals, rel: RelationshipSignals, months: number): number {
  let v = (100 - computeFinancialScore(fin)) * 0.45
  v += fin.brokenRenegotiations * 15
  v += fin.hasNegativation ? 20 : 0
  v += months < 3 ? 15 : 0
  v += rel.cancellationThreats > 0 ? 10 : 0
  return clamp(v)
}

// ─── Signal generation (correlated with existing churn score) ──
function generateSignals(churnScore: number, paymentDelay: number, netFailures: number, protocols: number, contacts: number, contractMonths: number, sellerId: string, city: string): CustomerSignals {
  const bad = churnScore > 60
  const mid = churnScore > 35

  const fin: FinancialSignals = {
    overdueBills: Math.min(5, Math.ceil(paymentDelay / 30)),
    renegotiations: bad ? randInt(1, 3) : mid ? randInt(0, 1) : 0,
    brokenRenegotiations: bad && rng() > 0.6 ? randInt(1, 2) : 0,
    paymentMethod: pick(['boleto', 'boleto', 'pix', 'pix', 'auto_debit', 'credit_card'] as PaymentMethod[]),
    paymentMethodChanges: bad ? randInt(1, 3) : 0,
    onTimePayments: Math.max(0, contractMonths - Math.ceil(paymentDelay / 30)),
    avgPaymentDelay: paymentDelay,
    hasNegativation: bad && rng() > 0.7,
    trustReleases: bad ? randInt(1, 4) : mid ? randInt(0, 2) : 0,
  }

  const net: NetworkSignals = {
    networkEvents30d: Math.min(15, netFailures + randInt(0, 3)),
    massivas30d: randInt(0, Math.min(3, Math.ceil(netFailures / 4))),
    slaCompliance: clamp(randFloat(bad ? 55 : mid ? 75 : 88, 100)),
    uptime30d: randFloat(bad ? 95.5 : 97.5, 99.9),
    pppoeDrops: bad ? randInt(5, 30) : mid ? randInt(2, 10) : randInt(0, 3),
    wifiQuality: pick(bad ? ['poor', 'poor', 'fair'] : mid ? ['fair', 'good'] : ['good', 'excellent'] as WifiQuality[]),
    rssi: bad ? randInt(-90, -72) : mid ? randInt(-75, -62) : randInt(-65, -48),
    avgLatency: bad ? randInt(40, 180) : mid ? randInt(18, 50) : randInt(5, 25),
    disconnections30d: Math.min(20, netFailures * 2 + randInt(0, 5)),
    txPower: randInt(1, 7),
    rxPower: randInt(-28, -14),
  }

  const rel: RelationshipSignals = {
    totalTickets: protocols,
    recurrentTickets: Math.ceil(protocols * (bad ? 0.45 : 0.15)),
    cancellationThreats: churnScore > 70 ? randInt(1, 4) : churnScore > 50 ? randInt(0, 2) : 0,
    npsScore: bad ? randFloat(1, 5) : mid ? randFloat(4, 7) : randFloat(6, 10),
    contactsLast30d: Math.min(20, contacts),
    duplicateBillRequests: bad ? randInt(0, 3) : 0,
    planDowngrade: churnScore > 65 && rng() > 0.6,
    sentimentScore: bad ? randFloat(-1, -0.2) : mid ? randFloat(-0.3, 0.3) : randFloat(0.2, 1),
    avgTicketSlaHours: bad ? randFloat(12, 48) : mid ? randFloat(4, 16) : randFloat(2, 8),
    reincidenceRate: clamp(protocols > 0 ? (protocols * (bad ? 40 : 15)) : 0),
  }

  const inst: InstallationSignals = {
    installDelayDays: contractMonths < 6 ? randInt(0, bad ? 15 : 5) : 0,
    schedulingChanges: contractMonths < 6 ? randInt(0, bad ? 3 : 1) : 0,
    warrantyTickets: contractMonths < 6 ? randInt(0, bad ? 3 : 1) : 0,
    technicalReturns: contractMonths < 12 ? randInt(0, bad ? 2 : 0) : 0,
    fieldVisits: randInt(0, bad ? 4 : 1),
    slaCompliant: !bad || rng() > 0.4,
  }

  const sellerQuality = SELLER_QUALITY[sellerId] ?? 70
  const com: CommercialSignals = {
    sellerPerformanceScore: sellerQuality,
    campaignQuality: randFloat(45, 95),
    planFitScore: bad ? randFloat(30, 65) : mid ? randFloat(55, 80) : randFloat(70, 100),
    contractMonths,
    isEarlyChurnRisk: contractMonths < 3 && churnScore > 40,
    acquisitionChannel: pick(['Porta a porta', 'Indicação', 'WhatsApp', 'Campanha digital', 'Parceiro local']),
  }

  const prof: ProfileSignals = {
    segment: pick(bad ? ['C', 'C', 'D', 'D'] : mid ? ['B', 'C', 'C'] : ['A', 'B', 'B'] as CustomerSegment[]),
    customerType: rng() > 0.88 ? 'PJ' : 'PF',
    hasNegativation: fin.hasNegativation,
    housingType: pick(['house', 'apartment', 'condo'] as HousingType[]),
    locationScore: clamp(randFloat(bad ? 20 : mid ? 40 : 55, 95)),
    ageEstimate: randInt(21, 65),
    gender: rng() > 0.52 ? 'M' : 'F',
    timeAtAddress: bad ? randInt(1, 8) : mid ? randInt(1, 12) : randInt(2, 20),
  }

  const ontBrand: string = bad
    ? pick(['Intelbras', 'Datacom', 'Parks', 'Generic'])
    : mid
    ? pick(['ZTE', 'Huawei', 'Intelbras', 'Datacom'])
    : pick(['ZTE', 'Huawei', 'Nokia'])
  const conn: ConnectionSignals = {
    wifiBand: (bad ? rng() > 0.72 : mid ? rng() > 0.52 : rng() > 0.32) ? '5GHz' : '2.4GHz',
    wifiRssi: bad ? randInt(-90, -70) : mid ? randInt(-75, -60) : randInt(-65, -45),
    pingMs: bad ? randInt(40, 200) : mid ? randInt(20, 60) : randInt(5, 25),
    ontUptimeDays: bad ? randInt(1, 60) : mid ? randInt(15, 180) : randInt(30, 365),
    pppoeUptimeDays: bad ? randInt(0, 15) : mid ? randInt(5, 60) : randInt(20, 180),
    pppoeDrops: net.pppoeDrops,
    ontRamUsage: bad ? randInt(70, 98) : mid ? randInt(45, 80) : randInt(20, 60),
    ontCpuUsage: bad ? randInt(60, 95) : mid ? randInt(35, 70) : randInt(10, 45),
    connectedDevices: randInt(1, bad ? 6 : mid ? 10 : 16),
    txRxOscillation: bad ? randFloat(5, 12) : mid ? randFloat(2, 7) : randFloat(0.5, 3),
    dataTrafficGb: randFloat(bad ? 5 : mid ? 20 : 50, bad ? 60 : mid ? 180 : 600),
    ontBrand,
    ontModel: pick(ONT_MODELS[ontBrand] ?? ['ONT-GEN']),
    ontFirmwareAge: bad ? randInt(18, 48) : mid ? randInt(6, 24) : randInt(1, 12),
  }

  const cityData = CITY_INFRA[city] ?? { site: 'POA-CENTRO', olts: ['OLT-POA-01'] }
  const collab = pick(COLLABS)
  const infra: InfraSignals = {
    site: cityData.site,
    olt: pick(cityData.olts),
    slot: randInt(1, 8),
    port: randInt(1, 128),
    splitter: pick(bad ? ['1:16', '1:32', '1:32'] : mid ? ['1:8', '1:16'] : ['1:4', '1:8']),
    gmudCount: bad ? randInt(3, 10) : mid ? randInt(1, 5) : randInt(0, 2),
    massivasCount: bad ? randInt(2, 8) : mid ? randInt(1, 4) : randInt(0, 2),
    massivasSlaAvgMin: bad ? randInt(120, 480) : mid ? randInt(60, 240) : randInt(15, 90),
    quebraCount: bad ? randInt(1, 5) : mid ? randInt(0, 3) : randInt(0, 1),
    collaboratorScore: collab.score,
    collaboratorName: collab.name,
  }

  return { financial: fin, network: net, relationship: rel, installation: inst, commercial: com, profile: prof, connection: conn, infra }
}

// ─── Health Score builder ──────────────────────────────────────
function buildHealthScores(signals: CustomerSignals, churnScore: number): HealthScores {
  const bad = churnScore > 60
  const mid = churnScore > 35

  const fv = computeFinancialScore(signals.financial)
  const nv = computeNetworkScore(signals.network)
  const rv = computeRelationshipScore(signals.relationship)
  const iv = computeInstallationScore(signals.installation)
  const cv = computeCommercialScore(signals.commercial)
  const pv = computeProfileScore(signals.profile)

  const overall = clamp(Math.round(fv * 0.30 + nv * 0.25 + rv * 0.20 + iv * 0.10 + cv * 0.10 + pv * 0.05))

  const financialFactors: ScoreFactor[] = [
    { label: `${signals.financial.overdueBills} fatura(s) em atraso`, impact: signals.financial.overdueBills > 0 ? 'negative' : 'positive', value: signals.financial.overdueBills > 0 ? `-${signals.financial.overdueBills * 15}pts` : '+0' },
    { label: `Método: ${signals.financial.paymentMethod.replace('_', ' ')}`, impact: signals.financial.paymentMethod === 'auto_debit' ? 'positive' : 'neutral', value: signals.financial.paymentMethod === 'auto_debit' ? '+10pts' : '' },
    { label: `${signals.financial.renegotiations} renegociação(ões)`, impact: signals.financial.renegotiations > 0 ? 'negative' : 'neutral', value: signals.financial.renegotiations > 0 ? `-${signals.financial.renegotiations * 8}pts` : '' },
    { label: signals.financial.hasNegativation ? 'Cliente negativado' : 'Sem negativação', impact: signals.financial.hasNegativation ? 'negative' : 'positive', value: signals.financial.hasNegativation ? '-25pts' : '+5pts' },
    { label: `${signals.financial.onTimePayments} pgtos em dia`, impact: signals.financial.onTimePayments > 5 ? 'positive' : 'neutral', value: signals.financial.onTimePayments > 0 ? `+${Math.min(15, Math.round(signals.financial.onTimePayments * 1.5))}pts` : '' },
  ]
  const networkFactors: ScoreFactor[] = [
    { label: `${signals.network.networkEvents30d} eventos 30d`, impact: signals.network.networkEvents30d > 3 ? 'negative' : 'positive', value: signals.network.networkEvents30d > 0 ? `-${signals.network.networkEvents30d * 4}pts` : '' },
    { label: `${signals.network.massivas30d} massivas`, impact: signals.network.massivas30d > 0 ? 'negative' : 'positive', value: signals.network.massivas30d > 0 ? `-${signals.network.massivas30d * 8}pts` : '+0' },
    { label: `Uptime ${signals.network.uptime30d.toFixed(1)}%`, impact: signals.network.uptime30d > 98 ? 'positive' : 'negative', value: '' },
    { label: `Latência média ${signals.network.avgLatency}ms`, impact: signals.network.avgLatency > 50 ? 'negative' : 'positive', value: '' },
    { label: `RSSI ${signals.network.rssi}dBm`, impact: signals.network.rssi > -65 ? 'positive' : 'negative', value: '' },
    { label: `Wifi: ${signals.network.wifiQuality}`, impact: signals.network.wifiQuality === 'excellent' || signals.network.wifiQuality === 'good' ? 'positive' : 'negative', value: '' },
  ]
  const relFactors: ScoreFactor[] = [
    { label: `${signals.relationship.totalTickets} chamados`, impact: signals.relationship.totalTickets > 3 ? 'negative' : 'neutral', value: signals.relationship.totalTickets > 0 ? `-${signals.relationship.totalTickets * 2.5}pts` : '' },
    { label: `${signals.relationship.cancellationThreats} ameaça(s) cancel.`, impact: signals.relationship.cancellationThreats > 0 ? 'negative' : 'positive', value: signals.relationship.cancellationThreats > 0 ? `-${signals.relationship.cancellationThreats * 15}pts` : '' },
    { label: `NPS ${signals.relationship.npsScore.toFixed(1)}`, impact: signals.relationship.npsScore >= 8 ? 'positive' : signals.relationship.npsScore < 6 ? 'negative' : 'neutral', value: '' },
    { label: signals.relationship.planDowngrade ? 'Downgrade de plano' : 'Sem downgrade', impact: signals.relationship.planDowngrade ? 'negative' : 'positive', value: signals.relationship.planDowngrade ? '-20pts' : '' },
    { label: `Sentiment: ${signals.relationship.sentimentScore > 0.3 ? 'positivo' : signals.relationship.sentimentScore < -0.3 ? 'negativo' : 'neutro'}`, impact: signals.relationship.sentimentScore > 0.3 ? 'positive' : signals.relationship.sentimentScore < -0.3 ? 'negative' : 'neutral', value: '' },
  ]
  const instFactors: ScoreFactor[] = [
    { label: `Atraso instalação: ${signals.installation.installDelayDays}d`, impact: signals.installation.installDelayDays > 5 ? 'negative' : 'positive', value: signals.installation.installDelayDays > 0 ? `-${signals.installation.installDelayDays * 3}pts` : '' },
    { label: `${signals.installation.warrantyTickets} chamado(s) garantia`, impact: signals.installation.warrantyTickets > 0 ? 'negative' : 'positive', value: signals.installation.warrantyTickets > 0 ? `-${signals.installation.warrantyTickets * 12}pts` : '' },
    { label: `${signals.installation.technicalReturns} retorno(s) técnico`, impact: signals.installation.technicalReturns > 0 ? 'negative' : 'positive', value: '' },
    { label: `SLA instalação: ${signals.installation.slaCompliant ? 'cumprido' : 'violado'}`, impact: signals.installation.slaCompliant ? 'positive' : 'negative', value: '' },
  ]
  const comFactors: ScoreFactor[] = [
    { label: `Vendedor: ${signals.commercial.sellerPerformanceScore}pts qualidade`, impact: signals.commercial.sellerPerformanceScore > 75 ? 'positive' : signals.commercial.sellerPerformanceScore < 55 ? 'negative' : 'neutral', value: '' },
    { label: `Aderência ao plano: ${signals.commercial.planFitScore.toFixed(0)}%`, impact: signals.commercial.planFitScore > 70 ? 'positive' : 'negative', value: '' },
    { label: `Canal: ${signals.commercial.acquisitionChannel}`, impact: 'neutral', value: '' },
    { label: signals.commercial.isEarlyChurnRisk ? 'Risco precoce detectado' : 'Fidelização estável', impact: signals.commercial.isEarlyChurnRisk ? 'negative' : 'positive', value: '' },
  ]
  const profFactors: ScoreFactor[] = [
    { label: `Segmento ${signals.profile.segment}`, impact: signals.profile.segment === 'A' || signals.profile.segment === 'B' ? 'positive' : 'negative', value: '' },
    { label: `Tipo: ${signals.profile.customerType}`, impact: 'neutral', value: '' },
    { label: signals.profile.hasNegativation ? 'Negativado' : 'Sem restrição', impact: signals.profile.hasNegativation ? 'negative' : 'positive', value: '' },
    { label: `Localização: ${signals.profile.locationScore.toFixed(0)}pts`, impact: signals.profile.locationScore > 65 ? 'positive' : 'negative', value: '' },
  ]

  const financialInsights = [
    `Histórico financeiro apresenta ${signals.financial.overdueBills} fatura(s) em atraso e atraso médio de ${signals.financial.avgPaymentDelay}d.`,
    `Pagamento via ${signals.financial.paymentMethod.replace('_', ' ')}, com ${signals.financial.onTimePayments} pagamentos em dia no histórico.`,
    `${signals.financial.renegotiations > 0 ? `Cliente com ${signals.financial.renegotiations} renegociação(ões); sinais de dificuldade financeira.` : 'Sem renegociações registradas — perfil financeiro estável.'}`,
  ]
  const networkInsights = [
    `${signals.network.networkEvents30d} eventos de rede nos últimos 30 dias; uptime de ${signals.network.uptime30d.toFixed(1)}% e latência média de ${signals.network.avgLatency}ms.`,
    `RSSI ${signals.network.rssi}dBm — qualidade Wi-Fi ${signals.network.wifiQuality}. ${signals.network.massivas30d > 0 ? `Afetado por ${signals.network.massivas30d} massiva(s).` : 'Sem massivas recentes.'}`,
  ]
  const relInsights = [
    `${signals.relationship.cancellationThreats > 0 ? `ALERTA: ${signals.relationship.cancellationThreats} ameaça(s) de cancelamento. NPS ${signals.relationship.npsScore.toFixed(1)} — sentimento ${signals.relationship.sentimentScore < 0 ? 'negativo' : 'positivo'}.` : `NPS ${signals.relationship.npsScore.toFixed(1)} com ${signals.relationship.totalTickets} chamados e ${signals.relationship.recurrentTickets} reincidências.`}`,
  ]
  const instInsights = [
    `Instalação ${signals.installation.installDelayDays > 0 ? `com atraso de ${signals.installation.installDelayDays}d` : 'no prazo'}, ${signals.installation.warrantyTickets} chamado(s) em garantia, SLA ${signals.installation.slaCompliant ? 'cumprido' : 'violado'}.`,
  ]
  const comInsights = [
    `Vendedor com qualidade ${signals.commercial.sellerPerformanceScore}pts. Aderência ao plano: ${signals.commercial.planFitScore.toFixed(0)}%. Canal: ${signals.commercial.acquisitionChannel}.`,
  ]
  const profInsights = [`Segmento ${signals.profile.segment}, ${signals.profile.customerType}, ${signals.profile.housingType === 'house' ? 'casa' : signals.profile.housingType === 'apartment' ? 'apartamento' : 'condomínio'}, localização ${signals.profile.locationScore.toFixed(0)}pts.`]

  const trendBase = bad ? -12 : mid ? -4 : 3
  const financial = buildSecondaryScore(fv, 0.30, trendBase + randFloat(-5, 5), financialFactors, pick(financialInsights))
  const network = buildSecondaryScore(nv, 0.25, trendBase + randFloat(-6, 6), networkFactors, pick(networkInsights))
  const relationship = buildSecondaryScore(rv, 0.20, trendBase + randFloat(-4, 4), relFactors, pick(relInsights))
  const installation = buildSecondaryScore(iv, 0.10, randFloat(-3, 3), instFactors, pick(instInsights))
  const commercial = buildSecondaryScore(cv, 0.10, randFloat(-3, 3), comFactors, pick(comInsights))
  const profile = buildSecondaryScore(pv, 0.05, randFloat(-2, 2), profFactors, pick(profInsights))

  const overallTrend: Trend = overall >= 61 ? 'stable' : bad ? 'degrading' : 'stable'

  return { overall, classification: scoreToHealthClass(overall), trend: overallTrend, trendValue: clamp(trendBase + randFloat(-3, 3), -30, 30), financial, network, relationship, installation, commercial, profile }
}

function buildDerivedRisks(healthScores: HealthScores, signals: CustomerSignals, monthlyValue: number): DerivedRisks {
  const churnProb = computeChurnProbability(healthScores.overall, signals.relationship, signals.financial)
  const equipRisk = computeEquipmentReturnRisk(signals.financial, signals.relationship, signals.commercial.contractMonths)

  const churnFactors: string[] = []
  if (signals.financial.overdueBills > 1) churnFactors.push(`${signals.financial.overdueBills} faturas em atraso`)
  if (signals.relationship.cancellationThreats > 0) churnFactors.push(`${signals.relationship.cancellationThreats} ameaça(s) de cancelamento`)
  if (signals.network.networkEvents30d > 5) churnFactors.push(`${signals.network.networkEvents30d} eventos de rede`)
  if (signals.relationship.planDowngrade) churnFactors.push('downgrade de plano detectado')
  if (signals.relationship.npsScore < 5) churnFactors.push(`NPS baixo (${signals.relationship.npsScore.toFixed(1)})`)
  if (churnFactors.length === 0) churnFactors.push('múltiplos sinais de deterioração')

  const equipFactors: string[] = []
  if (signals.financial.hasNegativation) equipFactors.push('cliente negativado')
  if (signals.financial.brokenRenegotiations > 0) equipFactors.push('renegociação descumprida')
  if (signals.commercial.contractMonths < 3) equipFactors.push('contrato recente < 3 meses')
  if (signals.relationship.cancellationThreats > 0) equipFactors.push('ameaça de cancelamento ativa')
  if (equipFactors.length === 0) equipFactors.push('sem histórico negativo')

  const revMonthly = (churnProb / 100) * monthlyValue
  const revAnnual = revMonthly * 12

  return {
    churn: {
      probability: churnProb,
      classification: scoreToRisk(churnProb),
      factors: churnFactors,
      trend: healthScores.trend,
      trendValue: -healthScores.trendValue,
      description: `Modelo detectou risco de cancelamento baseado em: ${churnFactors.slice(0, 3).join(', ')}.`,
    },
    equipmentReturn: {
      probability: equipRisk,
      classification: scoreToRisk(equipRisk),
      factors: equipFactors,
      trend: equipRisk > 50 ? 'degrading' : 'stable',
      trendValue: 0,
      description: `Risco de não devolução baseado em: ${equipFactors.slice(0, 2).join(', ')}.`,
    },
    revenueLoss: {
      probability: churnProb,
      classification: scoreToRisk(churnProb),
      factors: [`Mensalidade: R$ ${monthlyValue.toFixed(2)}`, `Risco anual: R$ ${revAnnual.toFixed(2)}`],
      trend: healthScores.trend,
      trendValue: 0,
      description: `Risco de perda de receita baseado na probabilidade de churn de ${churnProb}%.`,
    },
    revenueLossMonthly: revMonthly,
  }
}

// ─── Main customer generator ───────────────────────────────────
export function generateCustomers(count = 500): Customer[] {
  seed = 12345
  const customers: Customer[] = []

  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    const lastName2 = pick(LAST_NAMES)
    const name = `${firstName} ${lastName} ${lastName2}`
    const cityData = pick(CITIES_RS)
    const plan = pick(PLANS)
    const monthlyValue = PLAN_VALUES[plan]
    const contractMonths = randInt(1, 48)
    const contractDate = format(subMonths(new Date(), contractMonths), 'yyyy-MM-dd')
    const paymentDelay = rng() < 0.35 ? randInt(0, 120) : 0
    const netFailures = randInt(0, 15)
    const totalProtocols = randInt(0, 12)
    const openProtocols = Math.min(totalProtocols, randInt(0, 3))
    const supportContacts = randInt(0, 20)

    const churnScore = clamp(Math.round(paymentDelay * 0.4 + netFailures * 3 + totalProtocols * 2.5 + supportContacts * 1.5 + (contractMonths < 3 ? 20 : 0) + randFloat(-10, 15)))
    const churnRisk: RiskLevel = churnScore >= 75 ? 'critical' : churnScore >= 55 ? 'high' : churnScore >= 35 ? 'medium' : 'low'
    const financialStatus: FinancialStatus = legacyFinStatus(churnScore, paymentDelay)

    const CHURN_REASONS = ['Inadimplência recorrente', 'Problemas técnicos frequentes', 'Insatisfação com atendimento', 'Oferta concorrente', 'Instabilidade de conexão', 'Mudança de endereço', 'Dificuldade financeira', 'Queda de velocidade', 'Massivas recorrentes']
    const churnReasons: string[] = []
    if (paymentDelay > 30) churnReasons.push('Inadimplência recorrente')
    if (netFailures > 5) churnReasons.push('Instabilidade de conexão')
    const shuffled = [...CHURN_REASONS].filter((r) => !churnReasons.includes(r)).sort(() => rng() - 0.5)
    while (churnReasons.length < Math.min(3, Math.ceil(churnScore / 30)) && shuffled.length) churnReasons.push(shuffled.pop()!)

    const sellerId = pick(SELLER_IDS)
    const status: CustomerStatus = churnScore > 85 && rng() < 0.08 ? 'suspended' : 'active'

    const signals = generateSignals(churnScore, paymentDelay, netFailures, totalProtocols, supportContacts, contractMonths, sellerId, cityData.name)
    const healthScores = buildHealthScores(signals, churnScore)
    const derivedRisks = buildDerivedRisks(healthScores, signals, monthlyValue)

    customers.push({
      id: `C${String(i + 1).padStart(4, '0')}`,
      name,
      cpf: genCpf(),
      email: genEmail(name),
      phone: genPhone(),
      city: cityData.name,
      neighborhood: pick(cityData.neighborhoods),
      address: `Rua ${pick(LAST_NAMES)}, ${randInt(1, 999)}`,
      coordinates: [cityData.coords[0] + randFloat(-0.08, 0.08, 5), cityData.coords[1] + randFloat(-0.08, 0.08, 5)],
      plan,
      monthlyValue,
      contractDate,
      status,
      churnScore,
      churnRisk,
      churnReasons,
      lastPaymentDate: format(subDays(new Date(), paymentDelay > 0 ? paymentDelay : randInt(0, 30)), 'yyyy-MM-dd'),
      paymentDelayDays: paymentDelay,
      totalProtocols,
      openProtocols,
      networkFailures: netFailures,
      financialStatus,
      sellerId,
      sellerName: SELLER_NAMES[sellerId],
      totalPaid: contractMonths * monthlyValue * randFloat(0.6, 1.0),
      pendingAmount: paymentDelay > 0 ? monthlyValue * Math.ceil(paymentDelay / 30) : 0,
      contractMonths,
      supportContacts,
      signals,
      healthScores,
      derivedRisks,
    })
  }
  return customers
}

export function generatePayments(customers: Customer[]): Payment[] {
  seed = 54321
  const payments: Payment[] = []
  for (const c of customers.slice(0, 100)) {
    const months = Math.min(c.contractMonths, 12)
    for (let m = 0; m < months; m++) {
      const dueDate = subMonths(new Date(), months - m - 1)
      const delay = m < months - 1 && rng() < 0.2 ? randInt(5, 60) : 0
      const isPaid = m < months - 1
      payments.push({ id: `P${payments.length + 1}`, customerId: c.id, dueDate: format(dueDate, 'yyyy-MM-dd'), paymentDate: isPaid ? format(addDays(dueDate, delay), 'yyyy-MM-dd') : null, amount: c.monthlyValue, status: isPaid ? 'paid' : c.paymentDelayDays > 30 ? 'overdue' : 'pending', delayDays: delay })
    }
  }
  return payments
}

export function generateProtocols(customers: Customer[]): Protocol[] {
  seed = 99999
  const protocols: Protocol[] = []
  const subtypes: Record<string, string[]> = { technical: ['Sem conexão', 'Lentidão', 'Instabilidade', 'Queda frequente', 'Sem sinal óptico'], financial: ['Renegociação', 'Contestação de cobrança', 'Parcelamento'], commercial: ['Mudança de plano', 'Cancelamento solicitado'], complaint: ['Atendimento ruim', 'Prazo não cumprido', 'Cobrança indevida'] }
  const techIds = ['T001', 'T002', 'T003', 'T004', 'T005']
  const techNames: Record<string, string> = { T001: 'André Oliveira', T002: 'Marcos Vieira', T003: 'Tiago Borges', T004: 'Renato Cruz', T005: 'Paulo Neto' }
  for (const c of customers) {
    for (let p = 0; p < c.totalProtocols; p++) {
      const type = pick(['technical', 'technical', 'technical', 'financial', 'commercial', 'complaint']) as Protocol['type']
      const subtype = pick(subtypes[type])
      const daysAgo = randInt(1, 365)
      const sla = type === 'technical' ? 4 : 24
      const resolved = p < c.totalProtocols - c.openProtocols
      const techId = type === 'technical' ? pick(techIds) : null
      protocols.push({ id: `PR${protocols.length + 1}`, customerId: c.id, type, subtype, openDate: format(subDays(new Date(), daysAgo), 'yyyy-MM-dd'), closeDate: resolved ? format(addDays(subDays(new Date(), daysAgo), randInt(1, 7)), 'yyyy-MM-dd') : null, status: resolved ? 'resolved' : 'open', slaHours: sla, resolvedInHours: resolved ? randInt(1, sla * 3) : null, technicianId: techId, technicianName: techId ? techNames[techId] : null, description: `${subtype} - ${c.neighborhood}, ${c.city}`, isRecurrent: rng() < 0.25 })
    }
  }
  return protocols
}

export function generateNetworkEvents(): NetworkEvent[] {
  seed = 77777
  const CITIES_NAMES = ['Porto Alegre', 'Canoas', 'Novo Hamburgo', 'São Leopoldo', 'Gravataí', 'Cachoeirinha', 'Alvorada', 'Viamão']
  const ALL_NEIGHBORHOODS = ['Guajuviras', 'Restinga', 'Mathias Velho', 'Rincão', 'Barro Vermelho', 'Jardim América', 'Nações', 'Itapuã', 'Rubem Berta', 'Rio dos Sinos']
  const causes = ['Fibra cortada por obra', 'Equipamento defeituoso', 'Queda de energia', 'Falha em OLT', 'Tempestade', 'Vandalismo', 'Manutenção programada', 'Cabo danificado por roedor']
  const events: NetworkEvent[] = []
  for (let i = 0; i < 45; i++) {
    const daysAgo = randInt(0, 90)
    const duration = randInt(20, 480)
    const isActive = daysAgo < 2 && rng() < 0.3
    events.push({ id: `NE${i + 1}`, type: pick(['massiva', 'massiva', 'instability', 'outage', 'maintenance']), city: pick(CITIES_NAMES), neighborhood: pick(ALL_NEIGHBORHOODS), startDate: format(subDays(new Date(), daysAgo), 'yyyy-MM-dd HH:mm'), endDate: isActive ? null : format(subDays(new Date(), daysAgo), 'yyyy-MM-dd HH:mm'), affectedCustomers: randInt(10, 350), cause: pick(causes), status: isActive ? 'active' : rng() < 0.1 ? 'monitoring' : 'resolved', durationMinutes: isActive ? null : duration })
  }
  return events
}

export function generateSellers(): Seller[] {
  seed = 33333
  return SELLER_IDS.map((id) => ({
    id,
    name: SELLER_NAMES[id],
    region: pick(['Grande Porto Alegre Norte', 'Grande Porto Alegre Sul', 'Vale do Sinos', 'Região Metropolitana']),
    totalCustomers: randInt(45, 120),
    activeCustomers: randInt(35, 100),
    churnedCustomers: randInt(5, 25),
    earlyChurnRate: randFloat(8, 28),
    avgChurnScore: randFloat(28, 65),
    monthlyRevenue: randFloat(4500, 18000),
    conversionRate: randFloat(18, 45),
    tenure: SELLER_TENURE[id] ?? 24,
    type: SELLER_TYPE[id] ?? 'internal',
    performanceScore: SELLER_QUALITY[id] ?? 70,
  }))
}

export function generateTimeline(customer: Customer, payments: Payment[], protocols: Protocol[], networkEvents: NetworkEvent[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  events.push({ id: 'TL_CONTRACT', customerId: customer.id, date: customer.contractDate, type: 'contract', title: 'Contrato Ativado', description: `Plano ${customer.plan} — R$ ${customer.monthlyValue.toFixed(2)}/mês via ${customer.signals.commercial.acquisitionChannel}. Vendedor: ${customer.sellerName}`, severity: 'success' })
  if (customer.signals.installation.installDelayDays > 0) {
    events.push({ id: 'TL_INST', customerId: customer.id, date: customer.contractDate, type: 'technical_visit', title: `Instalação com ${customer.signals.installation.installDelayDays}d de atraso`, description: `${customer.signals.installation.schedulingChanges} reagendamento(s). SLA ${customer.signals.installation.slaCompliant ? 'cumprido' : 'violado'}.`, severity: customer.signals.installation.slaCompliant ? 'info' : 'warning' })
  }
  const custPayments = payments.filter((p) => p.customerId === customer.id)
  custPayments.forEach((p) => {
    if (p.delayDays > 0 && p.paymentDate) events.push({ id: `TL_DELAY_${p.id}`, customerId: customer.id, date: p.dueDate, type: 'payment_delay', title: `Pagamento Atrasado ${p.delayDays}d`, description: `Fatura de R$ ${p.amount.toFixed(2)} paga com ${p.delayDays} dias de atraso`, severity: p.delayDays > 30 ? 'danger' : 'warning', metadata: { delayDays: p.delayDays } })
    else if (p.status === 'paid') events.push({ id: `TL_PAY_${p.id}`, customerId: customer.id, date: p.paymentDate!, type: 'payment', title: 'Pagamento Realizado', description: `R$ ${p.amount.toFixed(2)} — fatura quitada`, severity: 'success' })
    else if (p.status === 'overdue') events.push({ id: `TL_OVD_${p.id}`, customerId: customer.id, date: p.dueDate, type: 'payment_delay', title: 'Fatura em Atraso', description: `R$ ${p.amount.toFixed(2)} vencida — ${customer.paymentDelayDays} dias em aberto`, severity: 'danger' })
  })
  if (customer.signals.financial.renegotiations > 0) events.push({ id: 'TL_RENEG', customerId: customer.id, date: format(subDays(new Date(), 45), 'yyyy-MM-dd'), type: 'renegotiation', title: `Renegociação Ativa`, description: `${customer.signals.financial.renegotiations} acordo(s) de pagamento — status: ${customer.signals.financial.brokenRenegotiations > 0 ? 'QUEBRADO' : 'em andamento'}`, severity: customer.signals.financial.brokenRenegotiations > 0 ? 'danger' : 'info' })
  if (customer.signals.relationship.cancellationThreats > 0) events.push({ id: 'TL_THREAT', customerId: customer.id, date: format(subDays(new Date(), 15), 'yyyy-MM-dd'), type: 'cancellation_threat', title: `Ameaça de Cancelamento`, description: `${customer.signals.relationship.cancellationThreats} ameaça(s) registrada(s). Sentimento: ${customer.signals.relationship.sentimentScore < 0 ? 'negativo' : 'neutro'}`, severity: 'danger' })
  const custProtocols = protocols.filter((p) => p.customerId === customer.id)
  custProtocols.forEach((p) => events.push({ id: `TL_PROT_${p.id}`, customerId: customer.id, date: p.openDate, type: 'protocol', title: `Protocolo: ${p.subtype}`, description: `${p.description}${p.isRecurrent ? ' [REINCIDENTE]' : ''}${p.technicianName ? ` — Técnico: ${p.technicianName}` : ''}`, severity: p.type === 'complaint' ? 'danger' : 'warning' }))
  const relevantNet = networkEvents.filter((e) => e.city === customer.city).slice(0, customer.networkFailures)
  relevantNet.forEach((ne) => events.push({ id: `TL_NET_${ne.id}`, customerId: customer.id, date: ne.startDate.split(' ')[0], type: ne.type === 'massiva' ? 'massiva' : 'network_failure', title: ne.type === 'massiva' ? `Massiva — ${ne.affectedCustomers} clientes` : 'Instabilidade de Rede', description: `${ne.cause}${ne.durationMinutes ? ` — ${Math.round(ne.durationMinutes / 60)}h de interrupção` : ''}`, severity: ne.type === 'massiva' ? 'danger' : 'warning' }))
  if (customer.healthScores.overall < 41) events.push({ id: 'TL_HEALTH', customerId: customer.id, date: format(subDays(new Date(), 7), 'yyyy-MM-dd'), type: 'health_alert', title: `Health Score Crítico: ${customer.healthScores.overall}/100`, description: `Deterioração detectada. Principais fatores: ${customer.churnReasons.join(', ')}. Ação imediata recomendada.`, severity: 'danger' })
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export const MONTHLY_CHURN = [
  { month: 'Jun/24', churned: 28, newCustomers: 45, churnRate: 4.2, revenueAtRisk: 38400, recovered: 12 },
  { month: 'Jul/24', churned: 31, newCustomers: 38, churnRate: 4.8, revenueAtRisk: 42100, recovered: 9 },
  { month: 'Ago/24', churned: 35, newCustomers: 52, churnRate: 5.1, revenueAtRisk: 47300, recovered: 14 },
  { month: 'Set/24', churned: 29, newCustomers: 41, churnRate: 4.4, revenueAtRisk: 39800, recovered: 11 },
  { month: 'Out/24', churned: 42, newCustomers: 36, churnRate: 6.3, revenueAtRisk: 56700, recovered: 8 },
  { month: 'Nov/24', churned: 38, newCustomers: 44, churnRate: 5.7, revenueAtRisk: 51200, recovered: 15 },
  { month: 'Dez/24', churned: 44, newCustomers: 29, churnRate: 6.8, revenueAtRisk: 59400, recovered: 7 },
  { month: 'Jan/25', churned: 51, newCustomers: 31, churnRate: 7.9, revenueAtRisk: 68800, recovered: 10 },
  { month: 'Fev/25', churned: 47, newCustomers: 40, churnRate: 7.2, revenueAtRisk: 63500, recovered: 13 },
  { month: 'Mar/25', churned: 43, newCustomers: 48, churnRate: 6.6, revenueAtRisk: 58100, recovered: 16 },
  { month: 'Abr/25', churned: 39, newCustomers: 55, churnRate: 6.0, revenueAtRisk: 52700, recovered: 18 },
  { month: 'Mai/25', churned: 36, newCustomers: 62, churnRate: 5.5, revenueAtRisk: 48600, recovered: 21 },
]
