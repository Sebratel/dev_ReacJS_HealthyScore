import type {
  RealClient,
  ConnectionEngineScore, ConnectionEngineData, ConnectionScoreFactor,
  ConnectionEngineConfig, ConnectionIndicatorSummary,
} from '@/types'
import { DEFAULT_CONNECTION_CONFIG, CONNECTION_INDICATOR_ORDER } from './connectionConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

// ─── Score por cliente — 100% real + config ────────────────────
// O cliente soma a nota de cada MODELO distinto de equipamento que possui.
function scoreClient(c: RealClient, config: ConnectionEngineConfig) {
  const factors: ConnectionScoreFactor[] = []
  let v = 100
  let points = 0
  const eq = config.indicators.equipment

  if (eq && eq.mode === 'manual') {
    for (const model of c.equipment) {
      const idx = eq.indices.find((i) => i.key === model)
      if (idx && idx.points) {
        factors.push({ label: model, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
        v += idx.points
        points += idx.points
      }
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
    points,
  }
}

export function buildEngineScores(clients: RealClient[], config: ConnectionEngineConfig): ConnectionEngineScore[] {
  const label = config.indicators.equipment?.label ?? 'Equipamento'
  return clients.map((c) => {
    const s = scoreClient(c, config)
    const value = c.equipment.length ? c.equipment.join(', ') : 'Sem equipamento'
    return {
      customerId: c.clientId,
      customerName: c.name,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      equipment: c.equipment,
      healthScore: s.healthScore,
      churnRisk: s.churnRisk,
      revenueRisk: s.revenueRisk,
      classification: s.classification,
      factors: s.factors,
      positiveFactors: s.positive,
      negativeFactors: s.negative,
      indicators: [{ key: 'equipment', label, value, points: s.points }],
    }
  })
}

function buildIndicatorSummary(config: ConnectionEngineConfig): ConnectionIndicatorSummary[] {
  return CONNECTION_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return { key, label: ind.label, mode: ind.mode, totalIndices: ind.indices.length, configuredCount: ind.indices.filter((i) => i.points !== 0).length }
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
