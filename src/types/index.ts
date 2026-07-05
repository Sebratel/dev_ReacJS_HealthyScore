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
  // PII/geo removidos do snapshot enviado ao navegador (não usados no front) — opcionais.
  state?: string
  cpfCnpj?: string
  phone?: string
  email?: string
  lat?: number | null
  lng?: number | null
  onTimeInvoices: number
  lateInvoices: number
  overdueInvoices: number
  totalInvoices: number
  renegotiations: number
  trustReleases: number
  equipment: string[]      // modelos de equipamento alocados no contrato
  // Field Engine — protocolos de manutenção
  protocolCount: number
  scheduleCount: number
  slaLateCount: number
  avgSlaDays: number
  reasons: string[]
  technicians: string[]
  // Installation Engine — protocolos de instalação (ATV)
  installProtocols: number
  installScheduleCount: number
  installSlaLateCount: number
  installAvgSlaDays: number
  installSaleToScheduleDays: number
  installTechnicians: string[]
  // Relationship Engine — protocolos de relacionamento
  relProtocolCount: number
  relRecurrenceDays: number
  relAvgOverageHours: number
  relCancelThreats: number
  relTypes: string[]
  relAttendants: string[]
  // Network Engine — infraestrutura + massivas (cross-DB)
  netSite: string
  netConcentrator: string
  netAccessPoint: string
  netSplitter: string
  netSplitterCode: string
  netSlot: string
  netPon: string
  netMassiveCount: number
  netAvgOfflineMin: number
  netAvgOverageMin: number
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

// ─── Network Engine (100% real + config · massivas cross-DB) ───
export interface NetworkInfraScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
}

// Indicadores configuráveis na engine de rede. Os 3 primeiros são por faixa
// (massivas); os 6 de infra são categóricos dinâmicos (site/concentrador/…),
// sincronizados do snapshot em runtime (store.syncNetworkLists).
export type NetworkIndicatorKey =
  | 'massiveCount'   // Qtd. de massivas por contrato
  | 'avgOffline'     // SLA médio offline (event_identified → closed)
  | 'slaOverage'     // Atraso de SLA (closed − expected)
  | 'site'           // Site / POP
  | 'concentrator'   // Concentrador (OLT)
  | 'accessPoint'    // Ponto de acesso
  | 'splitter'       // Splitter
  | 'slot'           // Slot da OLT
  | 'pon'            // Porta PON

export interface NetworkIndicatorConfig {
  key: NetworkIndicatorKey
  label: string
  description: string
  mode: FinancialIndicatorMode
  indices: FinancialIndicatorIndex[]
  dynamic: boolean
  query: string
}

export interface NetworkEngineConfig {
  indicators: Record<NetworkIndicatorKey, NetworkIndicatorConfig>
}

export interface NetworkEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  site: string
  concentrator: string
  accessPoint: string
  splitter: string
  splitterCode: string
  slot: string
  pon: string
  massiveCount: number
  avgOfflineMin: number
  avgOverageMin: number
  healthScore: number
  churnRisk: number
  revenueRisk: number
  classification: HealthClassification
  factors: NetworkInfraScoreFactor[]
  positiveFactors: NetworkInfraScoreFactor[]
  negativeFactors: NetworkInfraScoreFactor[]
  indicators: EngineIndicatorBreakdown[]
}

export interface NetworkIndicatorSummary {
  key: NetworkIndicatorKey
  label: string
  mode: FinancialIndicatorMode
  totalIndices: number
  configuredCount: number
}

export interface NetworkEngineData {
  scores: NetworkEngineScore[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  affectedClients: number
  indicatorSummary: NetworkIndicatorSummary[]
  cityBreakdown: { city: string; avgScore: number; avgRisk: number; count: number }[]
  siteBreakdown: { site: string; count: number; avgScore: number }[]
  splitterBreakdown: { splitter: string; count: number; avgScore: number; avgOfflineMin: number }[]
}

// ─── Field Engine (100% real + config) ─────────────────────────
export interface FieldScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
}

// Indicadores configuráveis na engine de campo
export type FieldIndicatorKey =
  | 'protocolCount'   // Quantidade de protocolos (faixas)
  | 'reasons'         // Motivos (categorias 1-4) — dinâmico
  | 'scheduleCount'   // Agendamentos por protocolo (faixas)
  | 'slaOverdue'      // SLAs atrasados (faixas)
  | 'avgSla'          // Média de SLA em dias (faixas)
  | 'technician'      // Técnicos — dinâmico

export interface FieldIndicatorConfig {
  key: FieldIndicatorKey
  label: string
  description: string
  mode: FinancialIndicatorMode
  indices: FinancialIndicatorIndex[]
  dynamic: boolean
  query: string
}

export interface FieldEngineConfig {
  indicators: Record<FieldIndicatorKey, FieldIndicatorConfig>
}

export interface FieldEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  protocolCount: number
  scheduleCount: number
  slaLateCount: number
  avgSlaDays: number
  reasons: string[]
  technicians: string[]
  healthScore: number
  churnRisk: number
  revenueRisk: number
  classification: HealthClassification
  factors: FieldScoreFactor[]
  positiveFactors: FieldScoreFactor[]
  negativeFactors: FieldScoreFactor[]
  indicators: EngineIndicatorBreakdown[]
}

export interface FieldIndicatorSummary {
  key: FieldIndicatorKey
  label: string
  mode: FinancialIndicatorMode
  totalIndices: number
  configuredCount: number
}

export interface FieldEngineData {
  scores: FieldEngineScore[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  withProtocols: number
  indicatorSummary: FieldIndicatorSummary[]
  cityBreakdown: { city: string; avgScore: number; avgRisk: number; count: number }[]
  reasonBreakdown: { reason: string; count: number; avgScore: number }[]
  technicianBreakdown: { technician: string; count: number; avgScore: number }[]
}

// ─── Installation Engine (100% real + config) ──────────────────
export interface InstallationScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
}

// Indicadores configuráveis na engine de instalação
export type InstallationIndicatorKey =
  | 'scheduleCount'    // Alterações de agendamento (faixas)
  | 'avgSla'           // Média de SLA do protocolo (faixas)
  | 'slaOverdue'       // SLAs atrasados (faixas)
  | 'saleToSchedule'   // Média venda → agenda (faixas)
  | 'technician'       // Técnicos — dinâmico

export interface InstallationIndicatorConfig {
  key: InstallationIndicatorKey
  label: string
  description: string
  mode: FinancialIndicatorMode
  indices: FinancialIndicatorIndex[]
  dynamic: boolean
  query: string
}

export interface InstallationEngineConfig {
  indicators: Record<InstallationIndicatorKey, InstallationIndicatorConfig>
}

export interface InstallationEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  protocolCount: number
  scheduleCount: number
  slaLateCount: number
  avgSlaDays: number
  saleToScheduleDays: number
  technicians: string[]
  healthScore: number
  churnRisk: number
  revenueRisk: number
  classification: HealthClassification
  factors: InstallationScoreFactor[]
  positiveFactors: InstallationScoreFactor[]
  negativeFactors: InstallationScoreFactor[]
  indicators: EngineIndicatorBreakdown[]
}

export interface InstallationIndicatorSummary {
  key: InstallationIndicatorKey
  label: string
  mode: FinancialIndicatorMode
  totalIndices: number
  configuredCount: number
}

export interface InstallationEngineData {
  scores: InstallationEngineScore[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  withInstall: number
  indicatorSummary: InstallationIndicatorSummary[]
  cityBreakdown: { city: string; avgScore: number; avgRisk: number; count: number }[]
  technicianBreakdown: { technician: string; count: number; avgScore: number }[]
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

// ─── Relationship Engine (100% real + config) ──────────────────
export interface RelationshipScoreFactor {
  label: string
  points: number
  impact: 'positive' | 'negative'
}

// Indicadores configuráveis na engine de relacionamento
export type RelationshipIndicatorKey =
  | 'protocolCount'    // Qtd. de protocolos abertos (faixas)
  | 'recurrence'       // Recorrência venda → abertura (faixas)
  | 'protocolType'     // Tipo de protocolo — dinâmico
  | 'cancelThreats'    // Ameaças de cancelamento (faixas)
  | 'attendant'        // Atendente — dinâmico
  | 'slaSatisfaction'  // Satisfação via SLA (atraso médio, faixas)

export interface RelationshipIndicatorConfig {
  key: RelationshipIndicatorKey
  label: string
  description: string
  mode: FinancialIndicatorMode
  indices: FinancialIndicatorIndex[]
  dynamic: boolean
  query: string
}

export interface RelationshipEngineConfig {
  indicators: Record<RelationshipIndicatorKey, RelationshipIndicatorConfig>
}

export interface RelationshipEngineScore {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  protocolCount: number
  recurrenceDays: number
  avgOverageHours: number
  cancelThreats: number
  protocolTypes: string[]
  attendants: string[]
  healthScore: number
  churnRisk: number
  revenueRisk: number
  classification: HealthClassification
  factors: RelationshipScoreFactor[]
  positiveFactors: RelationshipScoreFactor[]
  negativeFactors: RelationshipScoreFactor[]
  indicators: EngineIndicatorBreakdown[]
}

export interface RelationshipIndicatorSummary {
  key: RelationshipIndicatorKey
  label: string
  mode: FinancialIndicatorMode
  totalIndices: number
  configuredCount: number
}

export interface RelationshipEngineData {
  scores: RelationshipEngineScore[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  withProtocols: number
  totalCancelThreats: number
  indicatorSummary: RelationshipIndicatorSummary[]
  cityBreakdown: { city: string; avgScore: number; avgRisk: number; count: number }[]
  typeBreakdown: { type: string; count: number; avgScore: number }[]
  attendantBreakdown: { attendant: string; count: number; avgScore: number }[]
}
