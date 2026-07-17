import type {
  RealClient,
  RelationshipEngineScore, RelationshipEngineData, RelationshipScoreFactor,
  RelationshipEngineConfig, RelationshipIndicatorSummary, RelationshipIndicatorKey,
} from '@/types'
import {
  DEFAULT_RELATIONSHIP_CONFIG, REL_INDICATOR_ORDER, bucketByMax,
  PROTOCOL_RANGES, RECURRENCE_RANGES, CANCEL_RANGES, SLA_SATISFACTION_RANGES,
} from './relationshipConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

function scoreClient(c: RealClient, config: RelationshipEngineConfig) {
  const factors: RelationshipScoreFactor[] = []
  let v = 100
  const ind = config.indicators
  const byKey: Partial<Record<RelationshipIndicatorKey, number>> = {}

  const range = (key: RelationshipIndicatorKey, bucketKey: string, prefix: string) => {
    const indicator = ind[key]
    if (!indicator || indicator.mode !== 'manual') return
    const idx = indicator.indices.find((i) => i.key === bucketKey)
    if (idx && idx.points) {
      factors.push({ label: `${prefix}: ${idx.label}`, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
      byKey[key] = (byKey[key] ?? 0) + idx.points
      v += idx.points
    }
  }
  const multi = (key: RelationshipIndicatorKey, values: string[], prefix: string) => {
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

  range('protocolCount', bucketByMax(c.relProtocolCount, PROTOCOL_RANGES).key, 'Protocolos')
  range('recurrence', bucketByMax(c.relRecurrenceDays, RECURRENCE_RANGES).key, 'Recorrência')
  range('cancelThreats', bucketByMax(c.relCancelThreats, CANCEL_RANGES).key, 'Ameaças')
  range('slaSatisfaction', bucketByMax(c.relAvgOverageHours, SLA_SATISFACTION_RANGES).key, 'SLA')
  multi('protocolType', c.relTypes, 'Tipo')
  multi('attendant', c.relAttendants, 'Atendente')

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

export function buildEngineScores(clients: RealClient[], config: RelationshipEngineConfig): RelationshipEngineScore[] {
  const labelOf = (k: RelationshipIndicatorKey) => config.indicators[k]?.label ?? k
  return clients.map((c) => {
    const s = scoreClient(c, config)
    const recMonths = (c.relRecurrenceDays / 30).toFixed(1)
    const realValue: Record<RelationshipIndicatorKey, string> = {
      protocolCount: `${c.relProtocolCount}`,
      recurrence: `${recMonths} meses (${c.relRecurrenceDays.toFixed(0)}d)`,
      protocolType: c.relTypes.length ? c.relTypes.join(', ') : '—',
      cancelThreats: `${c.relCancelThreats}`,
      attendant: c.relAttendants.length ? c.relAttendants.join(', ') : '—',
      slaSatisfaction: `${c.relAvgOverageHours.toFixed(1)} h atraso`,
    }
    const indicators = REL_INDICATOR_ORDER.filter((k) => config.indicators[k]).map((key) => ({
      key, label: labelOf(key), value: realValue[key], points: s.byKey[key] ?? 0,
    }))
    return {
      customerId: c.clientId,
      customerName: c.name,
      contractNumber: c.contractNumber,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      protocolCount: c.relProtocolCount,
      recurrenceDays: c.relRecurrenceDays,
      avgOverageHours: c.relAvgOverageHours,
      cancelThreats: c.relCancelThreats,
      protocolTypes: c.relTypes,
      attendants: c.relAttendants,
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

function buildIndicatorSummary(config: RelationshipEngineConfig): RelationshipIndicatorSummary[] {
  return REL_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return { key, label: ind.label, mode: ind.mode, totalIndices: ind.indices.length, configuredCount: ind.indices.filter((i) => i.points !== 0).length }
  })
}

export function buildRelationshipEngineData(
  clients: RealClient[],
  config: RelationshipEngineConfig = DEFAULT_RELATIONSHIP_CONFIG,
): RelationshipEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length
  const withProtocols = scores.filter((s) => s.protocolCount > 0).length
  const totalCancelThreats = scores.reduce((a, s) => a + s.cancelThreats, 0)

  const cityMap = new Map<string, { scoreSum: number; riskSum: number; count: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { scoreSum: 0, riskSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.riskSum += s.churnRisk; e.count++
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, vv]) => ({ city, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)), avgRisk: parseFloat((vv.riskSum / vv.count).toFixed(1)), count: vv.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  const aggMulti = (pick: (s: RelationshipEngineScore) => string[]) => {
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
  const typeBreakdown = Array.from(aggMulti((s) => s.protocolTypes).entries())
    .map(([type, vv]) => ({ type, count: vv.count, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)
  const attendantBreakdown = Array.from(aggMulti((s) => s.attendants).entries())
    .map(([attendant, vv]) => ({ attendant, count: vv.count, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    withProtocols,
    totalCancelThreats,
    indicatorSummary: buildIndicatorSummary(config),
    cityBreakdown,
    typeBreakdown,
    attendantBreakdown,
  }
}
