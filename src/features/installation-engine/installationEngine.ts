import type {
  RealClient,
  InstallationEngineScore, InstallationEngineData, InstallationScoreFactor,
  InstallationEngineConfig, InstallationIndicatorSummary, InstallationIndicatorKey,
} from '@/types'
import {
  DEFAULT_INSTALLATION_CONFIG, INSTALL_INDICATOR_ORDER, bucketByMax,
  SCHEDULE_RANGES, AVG_SLA_RANGES, SLA_OVERDUE_RANGES, SALE_TO_SCHEDULE_RANGES,
} from './installationConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

function scoreClient(c: RealClient, config: InstallationEngineConfig) {
  const factors: InstallationScoreFactor[] = []
  let v = 100
  const ind = config.indicators
  const byKey: Partial<Record<InstallationIndicatorKey, number>> = {}

  const range = (key: InstallationIndicatorKey, bucketKey: string, prefix: string) => {
    const indicator = ind[key]
    if (!indicator || indicator.mode !== 'manual') return
    const idx = indicator.indices.find((i) => i.key === bucketKey)
    if (idx && idx.points) {
      factors.push({ label: `${prefix}: ${idx.label}`, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
      byKey[key] = (byKey[key] ?? 0) + idx.points
      v += idx.points
    }
  }
  const multi = (key: InstallationIndicatorKey, values: string[], prefix: string) => {
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

  range('scheduleCount', bucketByMax(c.installScheduleCount, SCHEDULE_RANGES).key, 'Agendamentos')
  range('avgSla', bucketByMax(c.installAvgSlaDays, AVG_SLA_RANGES).key, 'Média SLA')
  range('slaOverdue', bucketByMax(c.installSlaLateCount, SLA_OVERDUE_RANGES).key, 'SLA atrasado')
  range('saleToSchedule', bucketByMax(c.installSaleToScheduleDays, SALE_TO_SCHEDULE_RANGES).key, 'Venda→agenda')
  multi('technician', c.installTechnicians, 'Técnico')

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

export function buildEngineScores(clients: RealClient[], config: InstallationEngineConfig): InstallationEngineScore[] {
  const labelOf = (k: InstallationIndicatorKey) => config.indicators[k]?.label ?? k
  return clients.map((c) => {
    const s = scoreClient(c, config)
    const realValue: Record<InstallationIndicatorKey, string> = {
      scheduleCount: `${c.installScheduleCount}`,
      avgSla: `${c.installAvgSlaDays.toFixed(1)} d`,
      slaOverdue: `${c.installSlaLateCount}`,
      saleToSchedule: `${c.installSaleToScheduleDays.toFixed(1)} d`,
      technician: c.installTechnicians.length ? c.installTechnicians.join(', ') : '—',
    }
    const indicators = INSTALL_INDICATOR_ORDER.filter((k) => config.indicators[k]).map((key) => ({
      key, label: labelOf(key), value: realValue[key], points: s.byKey[key] ?? 0,
    }))
    return {
      customerId: c.clientId,
      customerName: c.name,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      protocolCount: c.installProtocols,
      scheduleCount: c.installScheduleCount,
      slaLateCount: c.installSlaLateCount,
      avgSlaDays: c.installAvgSlaDays,
      saleToScheduleDays: c.installSaleToScheduleDays,
      technicians: c.installTechnicians,
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

function buildIndicatorSummary(config: InstallationEngineConfig): InstallationIndicatorSummary[] {
  return INSTALL_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return { key, label: ind.label, mode: ind.mode, totalIndices: ind.indices.length, configuredCount: ind.indices.filter((i) => i.points !== 0).length }
  })
}

export function buildInstallationEngineData(
  clients: RealClient[],
  config: InstallationEngineConfig = DEFAULT_INSTALLATION_CONFIG,
): InstallationEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length
  const withInstall = scores.filter((s) => s.protocolCount > 0).length

  const cityMap = new Map<string, { scoreSum: number; riskSum: number; count: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { scoreSum: 0, riskSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.riskSum += s.churnRisk; e.count++
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, vv]) => ({ city, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)), avgRisk: parseFloat((vv.riskSum / vv.count).toFixed(1)), count: vv.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  const techMap = new Map<string, { scoreSum: number; count: number }>()
  scores.forEach((s) => {
    for (const t of s.technicians) {
      const e = techMap.get(t) ?? { scoreSum: 0, count: 0 }
      e.scoreSum += s.healthScore; e.count++
      techMap.set(t, e)
    }
  })
  const technicianBreakdown = Array.from(techMap.entries())
    .map(([technician, vv]) => ({ technician, count: vv.count, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    withInstall,
    indicatorSummary: buildIndicatorSummary(config),
    cityBreakdown,
    technicianBreakdown,
  }
}
