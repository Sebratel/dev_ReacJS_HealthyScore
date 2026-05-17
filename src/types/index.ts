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
}

export interface CustomerSignals {
  financial: FinancialSignals
  network: NetworkSignals
  relationship: RelationshipSignals
  installation: InstallationSignals
  commercial: CommercialSignals
  profile: ProfileSignals
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
