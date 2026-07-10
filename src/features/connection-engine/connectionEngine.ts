import type {
  RealClient,
  ConnectionEngineScore, ConnectionEngineData, ConnectionScoreFactor,
  ConnectionEngineConfig, ConnectionIndicatorKey, ConnectionIndicatorSummary,
} from '@/types'
import { DEFAULT_CONNECTION_CONFIG, CONNECTION_INDICATOR_ORDER, ONU_INDICATOR_KEYS, ONU_STATUS_OF } from './connectionConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

// ─── Score por cliente — 100% real + config ────────────────────
// Equipamento: o cliente soma a nota de cada MODELO distinto que possui.
// Status ONU (quedas de PPPoE): presença — pontua uma vez quando o status
// ocorreu no período (contagens em c.onuStatusCounts, banco AutoISP).
function scoreClient(c: RealClient, config: ConnectionEngineConfig) {
  const factors: ConnectionScoreFactor[] = []
  const byKey: Partial<Record<ConnectionIndicatorKey, number>> = {}
  let v = 100
  const eq = config.indicators.equipment

  if (eq && eq.mode === 'manual') {
    for (const model of c.equipment) {
      const idx = eq.indices.find((i) => i.key === model)
      if (idx && idx.points) {
        factors.push({ label: model, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
        v += idx.points
        byKey.equipment = (byKey.equipment ?? 0) + idx.points
      }
    }
  }

  const counts = c.onuStatusCounts ?? {}
  for (const key of ONU_INDICATOR_KEYS) {
    const ind = config.indicators[key]
    if (!ind || ind.mode !== 'manual' || !ind.points) continue
    const n = counts[ONU_STATUS_OF[key]] ?? 0
    if (n > 0) {
      factors.push({ label: ind.label, points: ind.points, impact: ind.points >= 0 ? 'positive' : 'negative' })
      v += ind.points
      byKey[key] = ind.points
    }
  }

  const healthScore = clamp(v)
  const churnRisk = clamp(100 - healthScore)
  return {
    healthScore,
    churnRisk,
    revenueRisk: (churnRisk / 100) * c.monthlyValue,
    classification: scoreToHealthClass(healthScore),
    factors,
    positive: factors.filter((f) => f.impact === 'positive'),
    negative: factors.filter((f) => f.impact === 'negative'),
    byKey,
  }
}

export function buildEngineScores(clients: RealClient[], config: ConnectionEngineConfig): ConnectionEngineScore[] {
  return clients.map((c) => {
    const s = scoreClient(c, config)
    const counts = c.onuStatusCounts ?? {}
    const indicators = CONNECTION_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
      const ind = config.indicators[key]
      const value = key === 'equipment'
        ? (c.equipment.length ? c.equipment.join(', ') : 'Sem equipamento')
        : (() => { const n = counts[ONU_STATUS_OF[key]] ?? 0; return n > 0 ? `${n} evento(s)` : 'Sem eventos' })()
      return { key, label: ind.label, value, points: s.byKey[key] ?? 0 }
    })
    return {
      customerId: c.clientId,
      customerName: c.name,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      equipment: c.equipment,
      onuStatusCounts: counts,
      onuDrops: (counts.power_fail ?? 0) + (counts.loss_signal ?? 0),
      healthScore: s.healthScore,
      churnRisk: s.churnRisk,
      revenueRisk: s.revenueRisk,
      classification: s.classification,
      factors: s.factors,
      positiveFactors: s.positive,
      negativeFactors: s.negative,
      indicators,
    }
  })
}

function buildIndicatorSummary(config: ConnectionEngineConfig): ConnectionIndicatorSummary[] {
  return CONNECTION_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return {
      key, label: ind.label, mode: ind.mode,
      totalIndices: ind.dynamic ? ind.indices.length : 1,
      configuredCount: ind.dynamic ? ind.indices.filter((i) => i.points !== 0).length : (ind.points ? 1 : 0),
    }
  })
}

export function buildConnectionEngineData(
  clients: RealClient[],
  config: ConnectionEngineConfig = DEFAULT_CONNECTION_CONFIG,
): ConnectionEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length
  const withEquipment = scores.filter((s) => s.equipment.length > 0).length

  // Cidade
  const cityMap = new Map<string, { scoreSum: number; riskSum: number; count: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { scoreSum: 0, riskSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.riskSum += s.churnRisk; e.count++
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)), avgRisk: parseFloat((v.riskSum / v.count).toFixed(1)), count: v.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  // Modelo (cada cliente conta para cada modelo distinto que possui)
  const modelMap = new Map<string, { scoreSum: number; count: number }>()
  scores.forEach((s) => {
    for (const model of s.equipment) {
      const e = modelMap.get(model) ?? { scoreSum: 0, count: 0 }
      e.scoreSum += s.healthScore; e.count++
      modelMap.set(model, e)
    }
  })
  const modelBreakdown = Array.from(modelMap.entries())
    .map(([model, v]) => ({ model, count: v.count, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    withEquipment,
    indicatorSummary: buildIndicatorSummary(config),
    cityBreakdown,
    modelBreakdown,
  }
}
