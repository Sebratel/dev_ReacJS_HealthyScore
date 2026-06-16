// ─── Primitives ───────────────────────────────────────────────
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type FinancialStatus = 'ok' | 'delayed' | 'defaulting' | 'negotiating'
export type CustomerStatus = 'active' | 'suspended' | 'cancelled'
export type PlanType = 'Fibra 100MB' | 'Fibra 200MB' | 'Fibra 300MB' | 'Fibra 500MB' | 'Fibra 1GB'
export type HealthClassification = 'critical' | 'high_risk' | 'attention' | 'healthy' | 'excellent'
export type Trend = 'improving' | 'stable' | 'degrading'
export type WifiQuality = 'excellent' | 'good' | 'fair' | 'poor'
export type PaymentMethod = 'boleto' | 'pix' | 'auto_debit' | 'credit_card'
export type CustomerSegment = 'A' | 'B' | 'C' | 'D'
export type HousingType = 'house' | 'apartment' | 'condo'

// ─── Health Score System ───────────────────────────────────────
export interface ScoreFactor {
  label: string
  impact: 'positive' | 'negative' | 'neutral'
  value: string
}

export interface SecondaryScore {
  value: number             // 0-100
  weight: number            // e.g., 0.30 for 30%
  classification: HealthClassification
  trend: Trend
  trendValue: number        // points changed in 30d (positive = improving)
  factors: ScoreFactor[]
  insight: string           // one-line AI explanation
}

export interface HealthScores {
  overall: number
  classification: HealthClassification
  trend: Trend
  trendValue: number
  financial: SecondaryScore
  network: SecondaryScore
  relationship: SecondaryScore
  installation: SecondaryScore
  commercial: SecondaryScore
  profile: SecondaryScore
}

// ─── Derived Risks ─────────────────────────────────────────────
export interface DerivedRisk {
  probability: number       // 0-100 percent
  classification: RiskLevel
  factors: string[]
  trend: Trend
  trendValue: number
  description: string
}

export interface DerivedRisks {
  churn: DerivedRisk
  equipmentReturn: DerivedRisk
  revenueLoss: DerivedRisk  // annual R$ value at risk
  revenueLossMonthly: number
}

// ─── Raw Signals (input data for scoring) ─────────────────────
export interface FinancialSignals {
  overdueBills: number
  renegotiations: number
  brokenRenegotiations: number
  paymentMethod: PaymentMethod
  paymentMethodChanges: number
  onTimePayments: number
  avgPaymentDelay: number
  hasNegativation: boolean
  trustReleases: number       // liberações por confiança (serviço liberado apesar de inadimplência)
}

export interface NetworkSignals {
  networkEvents30d: number
  massivas30d: number
  slaCompliance: number      // 0-100%
  uptime30d: number          // 95-100%
  pppoeDrops: number
  wifiQuality: WifiQuality
  rssi: number               // dBm, e.g. -55
  avgLatency: number         // ms
  disconnections30d: number
  txPower: number            // dBm
  rxPower: number            // dBm
}

export interface RelationshipSignals {
  totalTickets: number
  recurrentTickets: number
  cancellationThreats: number
  npsScore: number           // 0-10
  contactsLast30d: number
  duplicateBillRequests: number
  planDowngrade: boolean
  sentimentScore: number     // -1 to 1
  avgTicketSlaHours: number
  reincidenceRate: number    // 0-100%
}

export interface InstallationSignals {
  installDelayDays: number
  schedulingChanges: number
  warrantyTickets: number
  technicalReturns: number
  fieldVisits: number
  slaCompliant: boolean
}

export interface CommercialSignals {
  sellerPerformanceScore: number // 0-100
  campaignQuality: number        // 0-100
  planFitScore: number           // 0-100
  contractMonths: number
  isEarlyChurnRisk: boolean
  acquisitionChannel: string
}

export interface ProfileSignals {
  segment: CustomerSegment
  customerType: 'PF' | 'PJ'
  hasNegativation: boolean
  housingType: HousingType
  locationScore: number          // 0-100
  ageEstimate: number
  gender: 'M' | 'F'
  timeAtAddress: number          // years at current residence
}

export interface ConnectionSignals {
  wifiBand: '2.4GHz' | '5GHz'
  wifiRssi: number
  pingMs: number
  ontUptimeDays: number
  pppoeUptimeDays: number
  pppoeDrops: number
  ontRamUsage: number
  ontCpuUsage: number
  connectedDevices: number
  txRxOscillation: number
  dataTrafficGb: number
  ontBrand: string
  ontModel: string
  ontFirmwareAge: number
}

export interface InfraSignals {
  site: string
  olt: string
  slot: number
  port: number
  splitter: string
  gmudCount: number
  massivasCount: number
  massivasSlaAvgMin: number
  quebraCount: number
  collaboratorScore: number
  collaboratorName: string
}

export interface CustomerSignals {
  financial: FinancialSignals
  network: NetworkSignals
  relationship: RelationshipSignals
  installation: InstallationSignals
  commercial: CommercialSignals
  profile: ProfileSignals
  connection: ConnectionSignals
  infra: InfraSignals
}

// ─── Customer (full model) ─────────────────────────────────────
export interface Customer {
  id: string
  name: string
  cpf: string
  email: string
  phone: string
  city: string
  neighborhood: string
  address: string
  coordinates: [number, number]
  plan: PlanType
  monthlyValue: number
  contractDate: string
  status: CustomerStatus
  // Legacy churn score (kept for backward compat)
  churnScore: number
  churnRisk: RiskLevel
  churnReasons: string[]
  lastPaymentDate: string | null
  paymentDelayDays: number
  totalProtocols: number
  openProtocols: number
  networkFailures: number
  financialStatus: FinancialStatus
  sellerId: string
  sellerName: string
  totalPaid: number
  pendingAmount: number
  contractMonths: number
  supportContacts: number
  // Health Score System
  signals: CustomerSignals
  healthScores: HealthScores
  derivedRisks: DerivedRisks
}

// ─── Supporting domain types ───────────────────────────────────
export interface Payment {
  id: string
  customerId: string
  dueDate: string
  paymentDate: string | null
  amount: number
  status: 'paid' | 'pending' | 'overdue' | 'negotiating'
  delayDays: number
}

export interface Protocol {
  id: string
  customerId: string
  type: 'technical' | 'financial' | 'commercial' | 'complaint'
  subtype: string
  openDate: string
  closeDate: string | null
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled'
  slaHours: number
  resolvedInHours: number | null
  technicianId: string | null
  technicianName: string | null
  description: string
  isRecurrent: boolean
}

export interface NetworkEvent {
  id: string
  type: 'massiva' | 'instability' | 'maintenance' | 'outage'
  city: string
  neighborhood: string
  startDate: string
  endDate: string | null
  affectedCustomers: number
  cause: string
  status: 'active' | 'resolved' | 'monitoring'
  durationMinutes: number | null
}

export interface Seller {
  id: string
  name: string
  region: string
  totalCustomers: number
  activeCustomers: number
  churnedCustomers: number
  earlyChurnRate: number
  avgChurnScore: number
  monthlyRevenue: number
  conversionRate: number
  tenure: number                 // months in the company
  type: 'internal' | 'external'
  performanceScore: number       // 0-100 quality score
}

export interface TimelineEvent {
  id: string
  customerId: string
  date: string
  type:
    | 'contract'
    | 'payment'
    | 'payment_delay'
    | 'protocol'
    | 'network_failure'
    | 'massiva'
    | 'technical_visit'
    | 'renegotiation'
    | 'support_contact'
    | 'suspension'
    | 'churn_risk'
    | 'plan_change'
    | 'cancellation_threat'
    | 'health_alert'
  title: string
  description: string
  severity: 'info' | 'warning' | 'danger' | 'success'
  metadata?: Record<string, string | number | boolean>
}

export interface MonthlyChurnData {
  month: string
  churned: number
  newCustomers: number
  churnRate: number
  revenueAtRisk: number
  recovered: number
}

export interface ChurnByCity {
  city: string
  total: number
  churned: number
  rate: number
  atRisk: number
}

// ─── Client Engine ────────────────────────────────────────────
export interface ClientScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
}

export interface ClientEngineScore {
  customerId: string
  customerName: string
  city: string
  neighborhood: string
  plan: string
  monthlyValue: number
  profileScore: number
  classification: HealthClassification
  trend: Trend
  trendValue: number
  factors: ClientScoreFactor[]
  positiveFactors: ClientScoreFactor[]
  negativeFactors: ClientScoreFactor[]
  gender: 'M' | 'F'
  segment: CustomerSegment
  customerType: 'PF' | 'PJ'
  housingType: HousingType
  timeAtAddress: number
  locationScore: number
  ageEstimate: number
}

export interface ClientEngineInsight {
  finding: string
  confidence: number
  factor: string
  impact: 'high' | 'medium' | 'low'
  affectedCount: number
  churnMultiplier: number
}

export interface ClientEngineData {
  scores: ClientEngineScore[]
  avgProfileScore: number
  criticalCount: number
  highRiskCount: number
  insights: ClientEngineInsight[]
  segmentBreakdown: { label: string; avgScore: number; count: number; color: string }[]
  housingBreakdown: { label: string; avgScore: number; count: number }[]
  cityBreakdown: { city: string; avgScore: number; count: number }[]
  genderBreakdown: { gender: string; count: number; avgScore: number }[]
  typeBreakdown: { label: string; count: number; avgScore: number }[]
  stabilityBreakdown: { label: string; count: number; avgScore: number }[]
  scoreHistory: { month: string; avgScore: number }[]
}

// ─── Commercial Engine (100% real + config) ────────────────────
export interface CommercialScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
}

// Indicadores configuráveis na engine comercial
export type CommercialIndicatorKey =
  | 'seller'        // Vendedor
  | 'plan'          // Plano
  | 'planValue'     // Valor do plano
  | 'contractAge'   // Tempo de contrato (faixas)
  | 'city'          // Cidade
  | 'neighborhood'  // Bairro
  | 'clientAge'     // Idade do cliente (faixas)
  | 'sellerAge'     // Idade do vendedor (faixas)
  | 'clientGender'  // Gênero do cliente
  | 'sellerGender'  // Gênero do vendedor
  | 'sellerTenure'  // Tempo de casa do vendedor (faixas)

export interface CommercialIndicatorConfig {
  key: CommercialIndicatorKey
  label: string
  description: string
  mode: FinancialIndicatorMode               // 'manual' | 'ai'
  indices: FinancialIndicatorIndex[]         // { key, label, points }
  dynamic: boolean                           // true = índices vêm do banco; false = faixas fixas
  query: string
}

export interface CommercialEngineConfig {
  indicators: Record<CommercialIndicatorKey, CommercialIndicatorConfig>
}

export interface CommercialEngineScore {
  customerId: string
  customerName: string
  seller: string
  city: string
  neighborhood: string
  plan: string
  monthlyValue: number
  contractAgeLabel: string
  healthScore: number
  churnRisk: number
  revenueRisk: number
  classification: HealthClassification
  factors: CommercialScoreFactor[]
  positiveFactors: CommercialScoreFactor[]
  negativeFactors: CommercialScoreFactor[]
  indicators: EngineIndicatorBreakdown[]
}

export interface CommercialIndicatorSummary {
  key: CommercialIndicatorKey
  label: string
  mode: FinancialIndicatorMode
  totalIndices: number       // total de categorias (distinct)
  configuredCount: number    // categorias com pontuação ≠ 0
}

export interface CommercialEngineData {
  scores: CommercialEngineScore[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  indicatorSummary: CommercialIndicatorSummary[]
  cityBreakdown: { city: string; avgScore: number; avgRisk: number; count: number }[]
  sellerBreakdown: { seller: string; avgScore: number; count: number }[]
  planBreakdown: { plan: string; avgScore: number; count: number }[]
  ageBreakdown: { label: string; count: number; avgScore: number }[]
}

// ─── Financial Engine ──────────────────────────────────────────
export interface FinancialScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
  weight: number
}

// Detalhamento por indicador exibido nas observações do cliente
// (um lado = pontuação aplicada; outro = atributo real)
export interface EngineIndicatorBreakdown {
  key: string
  label: string
  value: string    // atributo real do cliente para o indicador
  points: number   // pontuação aplicada (0 se não pontuou)
}

// Cliente real (linha do realClients.json gerado pelo ETL)
export interface RealClient {
  clientId: string
  name: string
  clientGender: string
  clientBirth: string | null
  seller: string
  sellerGender: string
  sellerBirth: string | null
  sellerAdmitted: string | null
  contractNumber: string
  contractDate: string | null
  plan: string
  monthlyValue: number
  paymentForm: string
  city: string
  neighborhood: string
  state: string
  cpfCnpj: string
  phone: string
  email: string
  lat: number | null
  lng: number | null
  onTimeInvoices: number
  lateInvoices: number
  overdueInvoices: number
  totalInvoices: number
  renegotiations: number
  trustReleases: number
  equipment: string[]      // modelos de equipamento alocados no contrato
}

// Sinais financeiros REAIS por cliente/contrato (vindos do PostgreSQL via ETL)
export interface RealFinancialSignals {
  onTimeInvoices: number    // faturas pagas no prazo
  lateInvoices: number      // faturas pagas em atraso
  overdueInvoices: number   // faturas em aberto e vencidas
  totalInvoices: number
  renegotiations: number    // títulos renegociados
  trustReleases: number     // desbloqueios por confiança
  paymentForm: string       // forma de pagamento real do contrato
}

export interface FinancialEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  healthScore: number           // 0-100
  churnRisk: number             // 0-100 percent
  revenueRisk: number           // R$ monthly
  classification: HealthClassification
  factors: FinancialScoreFactor[]
  positiveFactors: FinancialScoreFactor[]
  negativeFactors: FinancialScoreFactor[]
  indicators: EngineIndicatorBreakdown[]
  signals: RealFinancialSignals
}

export interface FinancialFactorComparison {
  factor: string
  healthyAvg: number            // média no grupo saudável
  riskAvg: number               // média no grupo de risco
  unit: string
}

// Resumo real por indicador (quantos clientes possuem / total de ocorrências)
export interface FinancialIndicatorSummary {
  key: FinancialIndicatorKey
  label: string
  mode: FinancialIndicatorMode
  clientsAffected: number       // clientes com o indicador presente
  occurrences: number           // total de ocorrências na amostra
  configuredPoints: number      // pontuação configurada (manual)
}

export interface FinancialEngineData {
  scores: FinancialEngineScore[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  factorComparisons: FinancialFactorComparison[]
  cityBreakdown: { city: string; avgScore: number; avgRisk: number; count: number }[]
  monthly: { month: string; onTime: number; late: number; overdue: number }[]
  indicatorSummary: FinancialIndicatorSummary[]
}

// ─── Financial Engine — Configuração de pontuação ──────────────
export type FinancialIndicatorMode = 'manual' | 'ai'

// Indicadores configuráveis na engine financeira
export type FinancialIndicatorKey =
  | 'overdueBills'      // Faturas Atrasadas
  | 'trustReleases'     // Liberações por Confiança
  | 'renegotiations'    // Renegociações
  | 'onTimePayments'    // Faturas pagas no prazo
  | 'paymentMethod'     // Forma de Pagamento (com índices)

// Um "índice" é uma sub-condição de um indicador (ex.: cada forma de pagamento)
export interface FinancialIndicatorIndex {
  key: string           // chave técnica (ex.: 'pix')
  label: string         // rótulo exibido (ex.: 'PIX')
  points: number        // pontuação manual atribuída a este índice
}

export interface FinancialIndicatorConfig {
  key: FinancialIndicatorKey
  label: string
  description: string
  mode: FinancialIndicatorMode
  points: number                          // pontuação manual (indicadores sem índice)
  indices?: FinancialIndicatorIndex[]     // índices (indicadores como Forma de Pagamento)
  query: string                           // query SQL fornecida para o indicador
}

export interface FinancialEngineConfig {
  indicators: Record<FinancialIndicatorKey, FinancialIndicatorConfig>
}

// ─── Connection Engine (100% real + config) ────────────────────
export interface ConnectionScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
}

// Indicadores configuráveis na engine de conexão (por enquanto só equipamento)
export type ConnectionIndicatorKey = 'equipment'

export interface ConnectionIndicatorConfig {
  key: ConnectionIndicatorKey
  label: string
  description: string
  mode: FinancialIndicatorMode
  indices: FinancialIndicatorIndex[]
  dynamic: boolean
  query: string
}

export interface ConnectionEngineConfig {
  indicators: Record<ConnectionIndicatorKey, ConnectionIndicatorConfig>
}

export interface ConnectionEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  equipment: string[]
  healthScore: number
  churnRisk: number
  revenueRisk: number
  classification: HealthClassification
  factors: ConnectionScoreFactor[]
  positiveFactors: ConnectionScoreFactor[]
  negativeFactors: ConnectionScoreFactor[]
  indicators: EngineIndicatorBreakdown[]
}

export interface ConnectionIndicatorSummary {
  key: ConnectionIndicatorKey
  label: string
  mode: FinancialIndicatorMode
  totalIndices: number
  configuredCount: number
}

export interface ConnectionEngineData {
  scores: ConnectionEngineScore[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  withEquipment: number
  indicatorSummary: ConnectionIndicatorSummary[]
  cityBreakdown: { city: string; avgScore: number; avgRisk: number; count: number }[]
  modelBreakdown: { model: string; count: number; avgScore: number }[]
}

// ─── Network Engine ────────────────────────────────────────────
export interface NetworkInfraScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
  category: 'gmud' | 'massiva' | 'quebra' | 'collaborator' | 'infra' | 'connection'
}

export interface NetworkEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  networkScore: number
  infraScore: number
  connectionScore: number
  classification: HealthClassification
  trend: Trend
  trendValue: number
  factors: NetworkInfraScoreFactor[]
  positiveFactors: NetworkInfraScoreFactor[]
  negativeFactors: NetworkInfraScoreFactor[]
  site: string
  olt: string
  slot: number
  port: number
  splitter: string
  gmudCount: number
  massivasCount: number
  quebraCount: number
  collaboratorScore: number
  collaboratorName: string
}

export interface NetworkEngineInsight {
  finding: string
  confidence: number
  factor: string
  impact: 'high' | 'medium' | 'low'
  affectedCount: number
  churnMultiplier: number
}

export interface NetworkEngineData {
  scores: NetworkEngineScore[]
  avgNetworkScore: number
  avgInfraScore: number
  avgConnectionScore: number
  criticalCount: number
  highRiskCount: number
  avgGmudCount: number
  avgMassivasCount: number
  insights: NetworkEngineInsight[]
  oltBreakdown: { olt: string; site: string; count: number; avgNetworkScore: number; avgInfraScore: number }[]
  siteBreakdown: { site: string; count: number; avgNetworkScore: number }[]
  splitterBreakdown: { splitter: string; count: number; avgScore: number }[]
  collaboratorBreakdown: { name: string; score: number; count: number; avgNetworkScore: number }[]
  gmudBreakdown: { label: string; count: number; avgScore: number }[]
  massivasSlaBreakdown: { label: string; count: number; avgScore: number }[]
  cityBreakdown: { city: string; avgScore: number; count: number }[]
  scoreHistory: { month: string; avgNetworkScore: number; avgInfraScore: number; avgConnectionScore: number }[]
}

// ─── Field Engine ──────────────────────────────────────────────
export interface FieldScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
  category: 'visits' | 'scheduling' | 'sla' | 'punctuality' | 'returns'
}

export interface FieldEngineScore {
  customerId: string
  customerName: string
  city: string
  neighborhood: string
  plan: string
  monthlyValue: number
  fieldScore: number
  classification: HealthClassification
  trend: Trend
  trendValue: number
  factors: FieldScoreFactor[]
  positiveFactors: FieldScoreFactor[]
  negativeFactors: FieldScoreFactor[]
  fieldVisits: number
  visitMotives: string[]
  technicianName: string
  schedulingChanges: number
  schedulingChangeBy: 'client' | 'us' | 'both' | 'none'
  arrivedLate: boolean
  avgSlaHours: number
  slaBreaches: number
  slaCompliant: boolean
  technicalReturns: number
}

export interface FieldEngineInsight {
  finding: string
  confidence: number
  factor: string
  impact: 'high' | 'medium' | 'low'
  affectedCount: number
  churnMultiplier: number
}

export interface FieldEngineTechnicianStats {
  name: string
  count: number
  avgScore: number
  slaBreaches: number
  lateArrivals: number
  avgVisits: number
}

export interface FieldEngineData {
  scores: FieldEngineScore[]
  avgFieldScore: number
  criticalCount: number
  highRiskCount: number
  lateArrivalCount: number
  avgSlaHours: number
  totalSlaBreaches: number
  insights: FieldEngineInsight[]
  technicianBreakdown: FieldEngineTechnicianStats[]
  visitMotiveBreakdown: { motive: string; count: number; pct: number }[]
  schedulingChangeBreakdown: { label: string; count: number; pct: number }[]
  slaBreakdown: { label: string; count: number; avgScore: number }[]
  scoreHistory: { month: string; avgScore: number }[]
}

// ─── Installation Engine ───────────────────────────────────────
export interface InstallationScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
  category: 'installer' | 'uc_type' | 'ont' | 'warranty' | 'delay' | 'scheduling'
}

export interface InstallationEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  installationScore: number
  classification: HealthClassification
  trend: Trend
  trendValue: number
  factors: InstallationScoreFactor[]
  positiveFactors: InstallationScoreFactor[]
  negativeFactors: InstallationScoreFactor[]
  installerName: string
  ucType: HousingType
  ontModel: string
  ontBrand: string
  warrantyTickets: number
  installDelayDays: number
  technicalReturns: number
  schedulingChanges: number
  slaCompliant: boolean
}

export interface InstallationEngineInsight {
  finding: string
  confidence: number
  factor: string
  impact: 'high' | 'medium' | 'low'
  affectedCount: number
  churnMultiplier: number
}

export interface InstallationEngineData {
  scores: InstallationEngineScore[]
  avgInstallationScore: number
  criticalCount: number
  highRiskCount: number
  avgWarrantyTickets: number
  avgInstallDelay: number
  totalReturns: number
  insights: InstallationEngineInsight[]
  installerBreakdown: { name: string; count: number; avgScore: number; warrantyRate: number; returnRate: number; avgDelay: number }[]
  ucTypeBreakdown: { label: string; key: string; count: number; avgScore: number; warrantyRate: number }[]
  ontBreakdown: { brand: string; count: number; avgScore: number; warrantyRate: number }[]
  warrantyBreakdown: { label: string; count: number; pct: number }[]
  cityBreakdown: { city: string; avgScore: number; count: number }[]
  scoreHistory: { month: string; avgScore: number }[]
}

// ─── Cancellation Management ───────────────────────────────────
export interface CancellationEngineScore {
  overallScore: number
  classification: HealthClassification
  motivoScore: number
  servicoScore: number
  devolucaoScore: number
  motoboyTempoScore: number
  motoboyVisitasScore: number
  motoboyScore: number
  clienteScore: number
  competidorScore: number
}

export interface CancellationInsight {
  finding: string
  confidence: number
  factor: string
  impact: 'high' | 'medium' | 'low'
  affectedCount: number
  churnMultiplier: number
}

export interface CancellationRecord {
  id: string
  customerId: string
  customerName: string
  city: string
  neighborhood: string
  plan: string
  monthlyValue: number
  contractMonths: number
  cancellationDate: string
  reason: string
  equipmentReturned: boolean
  equipmentReturnDays: number | null
  motoboyDays: number
  motoboyVisits: number
  motoboyCollaborator: string
  competitorName: string | null
  churnScore: number
  revenueAtRisk: number
}

export interface CancellationData {
  records: CancellationRecord[]
  totalCancellations: number
  equipmentReturnedCount: number
  equipmentPendingCount: number
  avgMotoboyDays: number
  totalRevenueAtRisk: number
  reasonBreakdown: { reason: string; count: number; pct: number }[]
  planBreakdown: { plan: string; count: number; avgMonths: number; revenue: number }[]
  motoboyBreakdown: { name: string; count: number; avgDays: number; returnedCount: number; returnRate: number }[]
  competitorBreakdown: { name: string; count: number; pct: number }[]
  cityBreakdown: { city: string; count: number; returnRate: number; avgMotoboyDays: number }[]
  monthlyTrend: { month: string; count: number; returned: number }[]
  insights: CancellationInsight[]
  engineScore: CancellationEngineScore
}

// ─── Competitors ───────────────────────────────────────────────
export interface CompetitorInsight {
  finding: string
  confidence: number
  factor: string
  impact: 'high' | 'medium' | 'low'
  affectedCount: number
  churnMultiplier: number
}

export interface CompetitorPlan {
  name: string
  speed: string
  price: number
}

export interface Competitor {
  id: string
  name: string
  city: string
  neighborhood: string
  street: string | null
  size: 'micro' | 'pequeno' | 'médio' | 'grande'
  accessCount: number
  entryDate: string
  plans: CompetitorPlan[]
  lowestPrice: number
  technology: 'Fibra' | 'VDSL' | 'Coaxial' | 'Radio'
}

export interface CompetitorData {
  competitors: Competitor[]
  totalCompetitors: number
  totalCompetitorAccesses: number
  citiesAffected: number
  hotspotCity: string
  hotspotNeighborhood: string
  avgLowestPrice: number
  sizeBreakdown: { size: string; count: number; totalAccesses: number }[]
  cityBreakdown: { city: string; competitors: number; totalAccesses: number; avgLowestPrice: number; mostPresent: string }[]
  priceComparison: { speed: string; ourPrice: number; avgCompetitorPrice: number; minCompetitorPrice: number }[]
  entryTimeline: { month: string; newEntries: number; cumulative: number }[]
  insights: CompetitorInsight[]
}

// ─── Relationship Engine ───────────────────────────────────────
export interface RelationshipScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
  category: 'tickets' | 'nps' | 'sentiment' | 'scrapping' | 'threats' | 'billing'
}

export interface RelationshipEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  relationshipScore: number
  classification: HealthClassification
  trend: Trend
  trendValue: number
  factors: RelationshipScoreFactor[]
  positiveFactors: RelationshipScoreFactor[]
  negativeFactors: RelationshipScoreFactor[]
  totalTickets: number
  recurrentTickets: number
  slaBreaches: number
  avgSlaHours: number
  secondCopyRequests: number
  planDowngrade: boolean
  attendant: string
  npsScore: number
  sentimentScore: number
  nativeContacts: number
  matrixContacts: number
  cancellationThreats: number
}

export interface RelationshipEngineInsight {
  finding: string
  confidence: number
  factor: string
  impact: 'high' | 'medium' | 'low'
  affectedCount: number
  churnMultiplier: number
}

export interface RelationshipEngineData {
  scores: RelationshipEngineScore[]
  avgRelationshipScore: number
  criticalCount: number
  highRiskCount: number
  avgNps: number
  avgSentiment: number
  totalSlaBreaches: number
  totalNativeContacts: number
  totalMatrixContacts: number
  insights: RelationshipEngineInsight[]
  ticketAreaBreakdown: { area: string; count: number; avgSlaHours: number; slaBreachRate: number; recurrenceRate: number }[]
  npsBreakdown: { label: string; scoreRange: string; count: number; pct: number; color: string }[]
  sentimentBreakdown: { label: string; count: number; pct: number; avgScore: number; color: string }[]
  attendantBreakdown: { name: string; count: number; avgScore: number; avgNps: number; slaBreaches: number; avgSentiment: number }[]
  nativeReasonBreakdown: { label: string; count: number; pct: number }[]
  matrixReasonBreakdown: { label: string; count: number; pct: number }[]
  scoreHistory: { month: string; avgScore: number; avgNps: number }[]
  npsScoreDistribution: { score: number; count: number }[]
  totalNpsSurveysAnswered: number
  totalSecondCopyRequests: number
  totalPlanDowngrades: number
}
