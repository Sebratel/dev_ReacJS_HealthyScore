import type {
  RealClient,
  FinancialEngineScore, FinancialEngineData, FinancialFactorComparison,
  FinancialScoreFactor, FinancialEngineConfig, FinancialIndicatorSummary,
  FinancialIndicatorKey,
} from '@/types'
import { DEFAULT_FINANCIAL_CONFIG, FINANCIAL_INDICATOR_ORDER } from './financialConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

// ─── Score por cliente — 100% real + config ────────────────────
// Modo manual → pontuação fixa configurada, aplicada por presença do indicador.
// Modo IA     → lógica ponderada (count-based) com os dados reais.
function scoreClient(c: RealClient, config: FinancialEngineConfig) {
  const factors: FinancialScoreFactor[] = []
  let v = 100
  const ind = config.indicators
  const overdueTotal = c.lateInvoices + c.overdueInvoices
  const byKey: Partial<Record<FinancialIndicatorKey, number>> = {}

  const add = (key: FinancialIndicatorKey, label: string, points: number) => {
    if (!points) return
    factors.push({ label, points, impact: points >= 0 ? 'positive' : 'negative', weight: Math.abs(points) / 100 })
    byKey[key] = (byKey[key] ?? 0) + points
    v += points
  }

  // 1. Faturas Atrasadas (pagas em atraso + em aberto vencidas)
  if (overdueTotal > 0) {
    if (ind.overdueBills.mode === 'manual') add('overdueBills', `Faturas atrasadas (${overdueTotal})`, ind.overdueBills.points)
    else add('overdueBills', `${overdueTotal} fatura(s) em atraso`, -Math.min(overdueTotal * 15, 60))
  }
  // 2. Liberações por Confiança
  if (c.trustReleases > 0) {
    if (ind.trustReleases.mode === 'manual') add('trustReleases', `Liberações por confiança (${c.trustReleases})`, ind.trustReleases.points)
    else add('trustReleases', `${c.trustReleases} desbloqueio(s) por confiança`, -Math.min(c.trustReleases * 8, 32))
  }
  // 3. Renegociações
  if (c.renegotiations > 0) {
    if (ind.renegotiations.mode === 'manual') add('renegotiations', `Renegociações (${c.renegotiations})`, ind.renegotiations.points)
    else add('renegotiations', `${c.renegotiations} renegociação(ões)`, -Math.min(c.renegotiations * 15, 45))
  }
  // 4. Faturas pagas no prazo
  if (c.onTimeInvoices > 0) {
    if (ind.onTimePayments.mode === 'manual') add('onTimePayments', `Faturas pagas no prazo (${c.onTimeInvoices})`, ind.onTimePayments.points)
    else add('onTimePayments', `${c.onTimeInvoices} fatura(s) no prazo`, Math.min(c.onTimeInvoices * 5, 25))
  }
  // 5. Forma de Pagamento (índice = forma real do contrato)
  if (ind.paymentMethod.mode === 'manual') {
    const idx = ind.paymentMethod.indices?.find((i) => i.key === c.paymentForm)
    if (idx) add('paymentMethod', `Forma de pagamento: ${idx.label}`, idx.points)
  }

  const healthScore = clamp(v)
  const churnRisk = clamp(100 - healthScore)

  // Breakdown: todos os indicadores configurados, com atributo real + pontuação
  const realValue: Record<FinancialIndicatorKey, string> = {
    overdueBills: `${overdueTotal} fatura(s)`,
    trustReleases: `${c.trustReleases} desbloqueio(s)`,
    renegotiations: `${c.renegotiations} reneg.`,
    onTimePayments: `${c.onTimeInvoices} fatura(s)`,
    paymentMethod: c.paymentForm || 'Não informado',
  }
  const indicators = FINANCIAL_INDICATOR_ORDER.map((key) => ({
    key, label: ind[key].label, value: realValue[key], points: byKey[key] ?? 0,
  }))

  return {
    healthScore,
    churnRisk,
    revenueRisk: (churnRisk / 100) * c.monthlyValue,
    classification: scoreToHealthClass(healthScore),
    factors,
    positive: factors.filter((f) => f.impact === 'positive'),
    negative: factors.filter((f) => f.impact === 'negative'),
    indicators,
  }
}

export function buildEngineScores(clients: RealClient[], config: FinancialEngineConfig): FinancialEngineScore[] {
  return clients.map((c) => {
    const s = scoreClient(c, config)
    return {
      customerId: c.clientId,
      customerName: c.name,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      healthScore: s.healthScore,
      churnRisk: s.churnRisk,
      revenueRisk: s.revenueRisk,
      classification: s.classification,
      factors: s.factors,
      positiveFactors: s.positive,
      negativeFactors: s.negative,
      indicators: s.indicators,
      signals: {
        onTimeInvoices: c.onTimeInvoices,
        lateInvoices: c.lateInvoices,
        overdueInvoices: c.overdueInvoices,
        totalInvoices: c.totalInvoices,
        renegotiations: c.renegotiations,
        trustReleases: c.trustReleases,
        paymentForm: c.paymentForm,
      },
    }
  })
}

// ─── Comparação real: grupo saudável vs grupo de risco ─────────
function buildFactorComparisons(scores: FinancialEngineScore[]): FinancialFactorComparison[] {
  const healthy = scores.filter((s) => s.healthScore >= 61)
  const risk = scores.filter((s) => s.healthScore < 41)
  const avg = (arr: FinancialEngineScore[], fn: (s: FinancialEngineScore) => number) =>
    arr.length ? arr.reduce((a, s) => a + fn(s), 0) / arr.length : 0
  return [
    { factor: 'Faturas atrasadas',   healthyAvg: avg(healthy, s => s.signals.lateInvoices + s.signals.overdueInvoices), riskAvg: avg(risk, s => s.signals.lateInvoices + s.signals.overdueInvoices), unit: 'qtd' },
    { factor: 'Faturas no prazo',    healthyAvg: avg(healthy, s => s.signals.onTimeInvoices),  riskAvg: avg(risk, s => s.signals.onTimeInvoices),  unit: 'qtd' },
    { factor: 'Renegociações',       healthyAvg: avg(healthy, s => s.signals.renegotiations),  riskAvg: avg(risk, s => s.signals.renegotiations),  unit: 'qtd' },
    { factor: 'Desbloq. confiança',  healthyAvg: avg(healthy, s => s.signals.trustReleases),   riskAvg: avg(risk, s => s.signals.trustReleases),   unit: 'qtd' },
  ]
}

// ─── Resumo real por indicador ─────────────────────────────────
function buildIndicatorSummary(clients: RealClient[], config: FinancialEngineConfig): FinancialIndicatorSummary[] {
  const ind = config.indicators
  const sum = (fn: (c: RealClient) => number) => clients.reduce((a, c) => a + fn(c), 0)
  const cnt = (fn: (c: RealClient) => boolean) => clients.filter(fn).length

  const metrics: Record<FinancialIndicatorKey, { affected: number; occ: number; pts: number }> = {
    overdueBills:   { affected: cnt(c => c.lateInvoices + c.overdueInvoices > 0), occ: sum(c => c.lateInvoices + c.overdueInvoices), pts: ind.overdueBills.points },
    trustReleases:  { affected: cnt(c => c.trustReleases > 0), occ: sum(c => c.trustReleases), pts: ind.trustReleases.points },
    renegotiations: { affected: cnt(c => c.renegotiations > 0), occ: sum(c => c.renegotiations), pts: ind.renegotiations.points },
    onTimePayments: { affected: cnt(c => c.onTimeInvoices > 0), occ: sum(c => c.onTimeInvoices), pts: ind.onTimePayments.points },
    paymentMethod:  { affected: cnt(c => !!c.paymentForm && c.paymentForm !== 'Não informado'), occ: clients.length, pts: 0 },
  }
  return FINANCIAL_INDICATOR_ORDER.map((key) => ({
    key,
    label: ind[key].label,
    mode: ind[key].mode,
    clientsAffected: metrics[key].affected,
    occurrences: metrics[key].occ,
    configuredPoints: metrics[key].pts,
  }))
}

// ─── Builder principal ─────────────────────────────────────────
export function buildFinancialEngineData(
  clients: RealClient[],
  config: FinancialEngineConfig = DEFAULT_FINANCIAL_CONFIG,
  monthly: FinancialEngineData['monthly'] = [],
): FinancialEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length

  const cityMap = new Map<string, { total: number; scoreSum: number; riskSum: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { total: 0, scoreSum: 0, riskSum: 0 }
    e.total++; e.scoreSum += s.healthScore; e.riskSum += s.churnRisk
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, avgScore: parseFloat((v.scoreSum / v.total).toFixed(1)), avgRisk: parseFloat((v.riskSum / v.total).toFixed(1)), count: v.total }))
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 12)

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    factorComparisons: buildFactorComparisons(scores),
    cityBreakdown,
    monthly,
    indicatorSummary: buildIndicatorSummary(clients, config),
  }
}
