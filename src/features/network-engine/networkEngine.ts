import type {
  RealClient,
  NetworkEngineScore, NetworkEngineData, NetworkInfraScoreFactor,
  NetworkEngineConfig, NetworkIndicatorSummary, NetworkIndicatorKey,
} from '@/types'
import {
  DEFAULT_NETWORK_CONFIG, NET_INDICATOR_ORDER, bucketByMax,
  MASSIVE_RANGES, OFFLINE_RANGES, OVERAGE_RANGES,
} from './networkConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

function scoreClient(c: RealClient, config: NetworkEngineConfig) {
  const factors: NetworkInfraScoreFactor[] = []
  let v = 100
  const ind = config.indicators
  const byKey: Partial<Record<NetworkIndicatorKey, number>> = {}

  // Faixa (massivas) e categórico (infra) compartilham a mesma mecânica: casam
  // um índice por chave e somam a nota. matchKey vazio → sem dado, sem regra.
  const apply = (key: NetworkIndicatorKey, matchKey: string, prefix: string) => {
    const indicator = ind[key]
    if (!indicator || indicator.mode !== 'manual' || !matchKey) return
    const idx = indicator.indices.find((i) => i.key === matchKey)
    if (idx && idx.points) {
      factors.push({ label: `${prefix}: ${idx.label}`, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
      byKey[key] = (byKey[key] ?? 0) + idx.points
      v += idx.points
    }
  }

  apply('massiveCount', bucketByMax(c.netMassiveCount, MASSIVE_RANGES).key, 'Massivas')
  apply('avgOffline', bucketByMax(c.netAvgOfflineMin, OFFLINE_RANGES).key, 'Offline')
  apply('slaOverage', bucketByMax(c.netAvgOverageMin, OVERAGE_RANGES).key, 'Atraso SLA')
  // Infraestrutura — categóricos dinâmicos (chave = próprio valor real).
  apply('site', c.netSite, 'Site')
  apply('concentrator', c.netConcentrator, 'Concentrador')
  apply('accessPoint', c.netAccessPoint, 'Ponto de acesso')
  apply('splitter', c.netSplitter, 'Splitter')
  apply('slot', c.netSlot, 'Slot')
  apply('pon', c.netPon, 'PON')

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

const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`)

export function buildEngineScores(clients: RealClient[], config: NetworkEngineConfig): NetworkEngineScore[] {
  const labelOf = (k: NetworkIndicatorKey) => config.indicators[k]?.label ?? k
  return clients.map((c) => {
    const s = scoreClient(c, config)
    const realValue: Record<NetworkIndicatorKey, string> = {
      massiveCount: `${c.netMassiveCount}`,
      avgOffline: fmtMin(c.netAvgOfflineMin),
      slaOverage: fmtMin(c.netAvgOverageMin),
      site: c.netSite || '—',
      concentrator: c.netConcentrator || '—',
      accessPoint: c.netAccessPoint || '—',
      splitter: c.netSplitter || '—',
      slot: c.netSlot || '—',
      pon: c.netPon || '—',
    }
    const indicators = NET_INDICATOR_ORDER.filter((k) => config.indicators[k]).map((key) => ({
      key, label: labelOf(key), value: realValue[key], points: s.byKey[key] ?? 0,
    }))
    return {
      customerId: c.clientId,
      customerName: c.name,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      site: c.netSite,
      concentrator: c.netConcentrator,
      accessPoint: c.netAccessPoint,
      splitter: c.netSplitter,
      splitterCode: c.netSplitterCode,
      slot: c.netSlot,
      pon: c.netPon,
      massiveCount: c.netMassiveCount,
      avgOfflineMin: c.netAvgOfflineMin,
      avgOverageMin: c.netAvgOverageMin,
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

function buildIndicatorSummary(config: NetworkEngineConfig): NetworkIndicatorSummary[] {
  return NET_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return { key, label: ind.label, mode: ind.mode, totalIndices: ind.indices.length, configuredCount: ind.indices.filter((i) => i.points !== 0).length }
  })
}

export function buildNetworkEngineData(
  clients: RealClient[],
  config: NetworkEngineConfig = DEFAULT_NETWORK_CONFIG,
): NetworkEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length
  const affectedClients = scores.filter((s) => s.massiveCount > 0).length

  const cityMap = new Map<string, { scoreSum: number; riskSum: number; count: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { scoreSum: 0, riskSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.riskSum += s.churnRisk; e.count++
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, vv]) => ({ city, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)), avgRisk: parseFloat((vv.riskSum / vv.count).toFixed(1)), count: vv.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  const siteMap = new Map<string, { scoreSum: number; count: number }>()
  scores.forEach((s) => {
    const k = s.site || '(s/ site)'
    const e = siteMap.get(k) ?? { scoreSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.count++
    siteMap.set(k, e)
  })
  const siteBreakdown = Array.from(siteMap.entries())
    .map(([site, vv]) => ({ site, count: vv.count, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  const splitterMap = new Map<string, { scoreSum: number; count: number; offSum: number }>()
  scores.forEach((s) => {
    if (!s.splitterCode) return
    const e = splitterMap.get(s.splitterCode) ?? { scoreSum: 0, count: 0, offSum: 0 }
    e.scoreSum += s.healthScore; e.count++; e.offSum += s.avgOfflineMin
    splitterMap.set(s.splitterCode, e)
  })
  const splitterBreakdown = Array.from(splitterMap.entries())
    .map(([splitter, vv]) => ({ splitter, count: vv.count, avgScore: parseFloat((vv.scoreSum / vv.count).toFixed(1)), avgOfflineMin: Math.round(vv.offSum / vv.count) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    affectedClients,
    indicatorSummary: buildIndicatorSummary(config),
    cityBreakdown,
    siteBreakdown,
    splitterBreakdown,
  }
}
