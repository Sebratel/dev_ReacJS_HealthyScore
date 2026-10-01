import type {
  RealClient,
  FinancialEngineScore, FinancialEngineData, FinancialFactorComparison,
  FinancialScoreFactor, FinancialEngineConfig, FinancialIndicatorSummary,
  FinancialIndicatorKey,
} from '@/types'
import { DEFAULT_FINANCIAL_CONFIG, FINANCIAL_INDICATOR_ORDER, LATE_RANGES } from './financialConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

// Dias de atraso → chave da faixa. Exportada porque o ETL classifica com ESTA
// função: se cada lado tivesse a sua, os cortes divergiriam no primeiro ajuste.
export function lateKeyOf(dias: number | null | undefined): string | null {
  if (dias == null || dias <= 0) return null
  return (LATE_RANGES.find((r) => dias <= r.maxDias) ?? LATE_RANGES[LATE_RANGES.length - 1]).key
}

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

  // 1. Faturas Atrasadas — faixa da PIOR fatura paga em atraso.
  // Sem leitura de dias (contrato novo, sem fatura paga) não pontua: ausência
  // de dado não é bom pagamento.
  const lateKey = c.finWorstLateKey ?? null
  if (ind.overdueBills.mode === 'manual') {
    const faixa = lateKey ? ind.overdueBills.indices?.find((i) => i.key === lateKey) : undefined
    if (faixa) add('overdueBills', `Atraso: ${faixa.label}`, faixa.points)
  } else if (overdueTotal > 0) {
    add('overdueBills', `${overdueTotal} fatura(s) em atraso`, -Math.min(overdueTotal * 15, 60))
  }
  // 2. Liberações por Confiança — escada de recorrência (meses consecutivos).
  const trustKey = c.finTrustKey ?? null
  if (ind.trustReleases.mode === 'manual') {
    const faixa = trustKey ? ind.trustReleases.indices?.find((i) => i.key === trustKey) : undefined
    if (faixa) add('trustReleases', `Confiança: ${faixa.label}`, faixa.points)
  } else if (c.trustReleases > 0) {
    add('trustReleases', `${c.trustReleases} desbloqueio(s) por confiança`, -Math.min(c.trustReleases * 8, 32))
  }
  // 3. Renegociações — mesma escada: dois meses seguidos pesam quase o triplo
  // de dois meses espalhados.
  const renegKey = c.finRenegKey ?? null
  if (ind.renegotiations.mode === 'manual') {
    const faixa = renegKey ? ind.renegotiations.indices?.find((i) => i.key === renegKey) : undefined
    if (faixa) add('renegotiations', `Renegociação: ${faixa.label}`, faixa.points)
  } else if (c.renegotiations > 0) {
    add('renegotiations', `${c.renegotiations} renegociação(ões)`, -Math.min(c.renegotiations * 15, 45))
  }
  // 4. Faturas pagas no prazo — antes do vencimento ou no próprio dia.
  const onTimeKey = c.finOnTimeKey ?? null
  if (ind.onTimePayments.mode === 'manual') {
    const faixa = onTimeKey ? ind.onTimePayments.indices?.find((i) => i.key === onTimeKey) : undefined
    if (faixa) add('onTimePayments', faixa.label, faixa.points)
  } else if (c.onTimeInvoices > 0) {
    add('onTimePayments', `${c.onTimeInvoices} fatura(s) no prazo`, Math.min(c.onTimeInvoices * 5, 25))
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
    overdueBills: c.finWorstLateDays != null
      ? `pior atraso: ${c.finWorstLateDays} dia(s)`
      : (overdueTotal > 0 ? `${overdueTotal} fatura(s) em aberto` : 'sem atraso'),
    trustReleases: trustKey === 'nunca' ? 'nunca usou'
      : `${c.trustReleases} em ${c.finTrustMeses ?? 0} mês(es)${trustKey?.startsWith('rc:') ? ' · consecutivos' : ''}`,
    renegotiations: renegKey === 'nunca' ? 'nunca solicitou'
      : `${c.renegotiations} em ${c.finRenegMeses ?? 0} mês(es)${renegKey?.startsWith('rc:') ? ' · consecutivos' : ''}`,
    onTimePayments: onTimeKey
      ? `${onTimeKey === 'antes' ? 'antes do vencimento' : 'no dia'} (${c.finPaidBefore ?? 0} antes, ${c.finPaidOnDay ?? 0} no dia)`
      : 'sem leitura',
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
      contractNumber: c.contractNumber,
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
