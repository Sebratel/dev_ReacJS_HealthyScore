import type {
  RealClient, HealthClassification,
  FieldEngineScore, FieldEngineData, FieldScoreFactor,
  FieldEngineConfig, FieldIndicatorSummary, FieldIndicatorKey,
} from '@/types'
import {
  DEFAULT_FIELD_CONFIG, FIELD_INDICATOR_ORDER, bucketByMax,
  PROTOCOL_RANGES, SCHEDULE_RANGES, SLA_OVERDUE_RANGES, AVG_SLA_RANGES,
} from './fieldConfig'

function scoreToHealthClass(v: number): HealthClassification {
  if (v >= 81) return 'excellent'
  if (v >= 61) return 'healthy'
  if (v >= 41) return 'attention'
  if (v >= 21) return 'high_risk'
  return 'critical'
}
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

// ─── Score por cliente — 100% real + config ────────────────────
function scoreClient(c: RealClient, config: FieldEngineConfig) {
  const factors: FieldScoreFactor[] = []
  let v = 100
  const ind = config.indicators
  const byKey: Partial<Record<FieldIndicatorKey, number>> = {}

  // Faixas (1 índice por cliente)
  const range = (key: FieldIndicatorKey, bucketKey: string, prefix: string) => {
    const indicator = ind[key]
    if (!indicator || indicator.mode !== 'manual') return
    const idx = indicator.indices.find((i) => i.key === bucketKey)
    if (idx && idx.points) {
      factors.push({ label: `${prefix}: ${idx.label}`, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
      byKey[key] = (byKey[key] ?? 0) + idx.points
      v += idx.points
    }
  }
  // Dinâmicos (N índices por cliente — soma)
  const multi = (key: FieldIndicatorKey, values: string[], prefix: string) => {
    const indicator = ind[key]
    if (!indicator || indicator.mode !== 'manual') return
    for (const val of values) {
      const idx = indicator.indices.find((i) => i.key === val)
      if (idx && idx.points) {
        factors.push({ label: `${prefix}: ${idx.label}`, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
        byKey[key] = (byKey[key] ?? 0) + idx.points
        v += idx.points
      }
    }
  }

  range('protocolCount', bucketByMax(c.protocolCount, PROTOCOL_RANGES).key, 'Protocolos')
  range('scheduleCount', bucketByMax(c.scheduleCount, SCHEDULE_RANGES).key, 'Agendamentos')
  range('slaOverdue', bucketByMax(c.slaLateCount, SLA_OVERDUE_RANGES).key, 'SLA atrasado')
  range('avgSla', bucketByMax(c.avgSlaDays, AVG_SLA_RANGES).key, 'Média SLA')
  multi('reasons', c.reasons, 'Motivo')
  multi('technician', c.technicians, 'Técnico')

  const healthScore = clamp(v)
  const churnRisk = clamp(100 - healthScore)
  return {
    healthScore, churnRisk,
    revenueRisk: (churnRisk / 100) * c.monthlyValue,
    classification: scoreToHealthClass(healthScore),
    factors,
    positive: factors.filter((f) => f.impact === 'positive'),
    negative: factors.filter((f) => f.impact === 'negative'),
    byKey,
  }
}

export function buildEngineScores(clients: RealClient[], config: FieldEngineConfig): FieldEngineScore[] {
  const labelOf = (k: FieldIndicatorKey) => config.indicators[k]?.label ?? k
  return clients.map((c) => {
    const s = scoreClient(c, config)
    const realValue: Record<FieldIndicatorKey, string> = {
      protocolCount: `${c.protocolCount}`,
      reasons: c.reasons.length ? c.reasons.join(', ') : '—',
      scheduleCount: `${c.scheduleCount}`,
      slaOverdue: `${c.slaLateCount}`,
      avgSla: `${c.avgSlaDays.toFixed(1)} d`,
      technician: c.technicians.length ? c.technicians.join(', ') : '—',
    }
    const indicators = FIELD_INDICATOR_ORDER.filter((k) => config.indicators[k]).map((key) => ({
      key, label: labelOf(key), value: realValue[key], points: s.byKey[key] ?? 0,
    }))
    return {
      customerId: c.clientId,
      customerName: c.name,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      protocolCount: c.protocolCount,
      scheduleCount: c.scheduleCount,
      slaLateCount: c.slaLateCount,
      avgSlaDays: c.avgSlaDays,
      reasons: c.reasons,
      technicians: c.technicians,
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

function buildIndicatorSummary(config: FieldEngineConfig): FieldIndicatorSummary[] {
  return FIELD_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return { key, label: ind.label, mode: ind.mode, totalIndices: ind.indices.length, configuredCount: ind.indices.filter((i) => i.points !== 0).length }
  })
}

export function buildFieldEngineData(
  clients: RealClient[],
  config: FieldEngineConfig = DEFAULT_FIELD_CONFIG,
): FieldEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length
  const withProtocols = scores.filter((s) => s.protocolCount > 0).length

  const cityMap = new Map<string, { scoreSum: number; riskSum: number; count: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { scoreSum: 0, riskSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.riskSum += s.churnRisk; e.count++
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, vv]) => ({ city, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)), avgRisk: parseFloat((vv.riskSum / vv.count).toFixed(1)), count: vv.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  // distribuição por motivo / técnico (cada cliente conta para cada item distinto)
  const aggMulti = (pick: (s: FieldEngineScore) => string[]) => {
    const m = new Map<string, { scoreSum: number; count: number }>()
    scores.forEach((s) => {
      for (const val of pick(s)) {
        const e = m.get(val) ?? { scoreSum: 0, count: 0 }
        e.scoreSum += s.healthScore; e.count++
        m.set(val, e)
      }
    })
    return m
  }
  const reasonBreakdown = Array.from(aggMulti((s) => s.reasons).entries())
    .map(([reason, vv]) => ({ reason, count: vv.count, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)
  const technicianBreakdown = Array.from(aggMulti((s) => s.technicians).entries())
    .map(([technician, vv]) => ({ technician, count: vv.count, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    withProtocols,
    indicatorSummary: buildIndicatorSummary(config),
    cityBreakdown,
    reasonBreakdown,
    technicianBreakdown,
  }
}
