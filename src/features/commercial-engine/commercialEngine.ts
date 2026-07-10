import { differenceInMonths, differenceInYears } from 'date-fns'
import type {
  RealClient,
  CommercialEngineScore, CommercialEngineData, CommercialScoreFactor,
  CommercialEngineConfig, CommercialIndicatorSummary, CommercialIndicatorKey,
} from '@/types'
import {
  DEFAULT_COMMERCIAL_CONFIG, COMMERCIAL_INDICATOR_ORDER,
  contractAgeBucket, personAgeBucket, sellerTenureBucket, genderLabel,
} from './commercialConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

function monthsSince(dateStr: string | null): number {
  if (!dateStr) return -1
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return -1
  return Math.max(0, differenceInMonths(new Date(), d))
}
function ageYears(dateStr: string | null): number {
  if (!dateStr) return -1
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return -1
  return Math.max(0, differenceInYears(new Date(), d))
}

interface ScoreKeys { contractAge: string; clientAge: string; sellerAge: string; sellerTenure: string }

// ─── Score por cliente — 100% real + config ────────────────────
// Cada indicador é categórico: o cliente se enquadra em UM índice e recebe a nota dele.
function scoreClient(c: RealClient, config: CommercialEngineConfig, keys: ScoreKeys) {
  const factors: CommercialScoreFactor[] = []
  let v = 100
  const ind = config.indicators
  const byKey: Partial<Record<CommercialIndicatorKey, number>> = {}

  const apply = (key: CommercialIndicatorKey, matchKey: string, prefix: string) => {
    const indicator = ind[key]
    if (!indicator || indicator.mode !== 'manual' || !matchKey) return // ausente, IA ou sem dado: sem regra
    const idx = indicator.indices.find((i) => i.key === matchKey)
    if (idx && idx.points) {
      factors.push({ label: `${prefix}: ${idx.label}`, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
      byKey[key] = (byKey[key] ?? 0) + idx.points
      v += idx.points
    }
  }

  apply('seller', c.seller, 'Vendedor')
  apply('plan', c.plan, 'Plano')
  apply('planValue', String(c.monthlyValue), 'Valor')
  apply('contractAge', keys.contractAge, 'Tempo')
  apply('city', c.city, 'Cidade')
  apply('neighborhood', c.neighborhood, 'Bairro')
  apply('clientAge', keys.clientAge, 'Idade cliente')
  apply('sellerAge', keys.sellerAge, 'Idade vendedor')
  apply('clientGender', c.clientGender, 'Gênero cliente')
  apply('sellerGender', c.sellerGender, 'Gênero vendedor')
  apply('sellerTenure', keys.sellerTenure, 'Tempo de casa')

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

export function buildEngineScores(clients: RealClient[], config: CommercialEngineConfig): CommercialEngineScore[] {
  const labelOf = (k: CommercialIndicatorKey) => config.indicators[k]?.label ?? k
  return clients.map((c) => {
    const cm = monthsSince(c.contractDate)
    const bucket = contractAgeBucket(cm < 0 ? 0 : cm)
    const clientAgeY = ageYears(c.clientBirth)
    const sellerAgeY = ageYears(c.sellerBirth)
    const sellerTenM = monthsSince(c.sellerAdmitted)
    const clientAge = clientAgeY >= 0 ? personAgeBucket(clientAgeY) : null
    const sellerAge = sellerAgeY >= 0 ? personAgeBucket(sellerAgeY) : null
    const sellerTen = sellerTenM >= 0 ? sellerTenureBucket(sellerTenM) : null
    const keys = {
      contractAge: bucket.key,
      clientAge: clientAge?.key ?? '',
      sellerAge: sellerAge?.key ?? '',
      sellerTenure: sellerTen?.key ?? '',
    }
    const s = scoreClient(c, config, keys)

    // Breakdown: todos os indicadores configurados, com atributo real + pontuação
    const realValue: Record<CommercialIndicatorKey, string> = {
      seller: c.seller,
      plan: c.plan,
      planValue: `R$ ${c.monthlyValue.toFixed(2)}`,
      contractAge: bucket.label,
      city: c.city,
      neighborhood: c.neighborhood,
      clientAge: clientAge ? clientAge.label : 'n/d',
      sellerAge: sellerAge ? sellerAge.label : 'n/d',
      clientGender: genderLabel(c.clientGender),
      sellerGender: genderLabel(c.sellerGender),
      sellerTenure: sellerTen ? sellerTen.label : 'n/d',
    }
    const indicators = COMMERCIAL_INDICATOR_ORDER.filter((k) => config.indicators[k]).map((key) => ({
      key, label: labelOf(key), value: realValue[key], points: s.byKey[key] ?? 0,
    }))

    return {
      customerId: c.clientId,
      customerName: c.name,
      seller: c.seller,
      city: c.city,
      neighborhood: c.neighborhood,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      contractAgeLabel: bucket.label,
      contractAgeMonths: cm < 0 ? 0 : cm,
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

function groupBreakdown(scores: CommercialEngineScore[], keyFn: (s: CommercialEngineScore) => string) {
  const map = new Map<string, { scoreSum: number; riskSum: number; count: number }>()
  scores.forEach((s) => {
    const k = keyFn(s)
    const e = map.get(k) ?? { scoreSum: 0, riskSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.riskSum += s.churnRisk; e.count++
    map.set(k, e)
  })
  return map
}

function buildIndicatorSummary(config: CommercialEngineConfig): CommercialIndicatorSummary[] {
  return COMMERCIAL_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return {
      key, label: ind.label, mode: ind.mode,
      totalIndices: ind.indices.length,
      configuredCount: ind.indices.filter((i) => i.points !== 0).length,
    }
  })
}

// ─── Builder principal ─────────────────────────────────────────
export function buildCommercialEngineData(
  clients: RealClient[],
  config: CommercialEngineConfig = DEFAULT_COMMERCIAL_CONFIG,
): CommercialEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length

  const cityMap = groupBreakdown(scores, (s) => s.city)
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)), avgRisk: parseFloat((v.riskSum / v.count).toFixed(1)), count: v.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  const sellerMap = groupBreakdown(scores, (s) => s.seller)
  const sellerBreakdown = Array.from(sellerMap.entries())
    .map(([seller, v]) => ({ seller, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)), count: v.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  const planMap = groupBreakdown(scores, (s) => s.plan)
  const planBreakdown = Array.from(planMap.entries())
    .map(([plan, v]) => ({ plan, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)), count: v.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  const ageMap = groupBreakdown(scores, (s) => s.contractAgeLabel)
  const ageBreakdown = config.indicators.contractAge.indices.map((r) => {
    const v = ageMap.get(r.label)
    return { label: r.label, count: v?.count ?? 0, avgScore: v ? parseFloat((v.scoreSum / v.count).toFixed(1)) : 0 }
  })

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    indicatorSummary: buildIndicatorSummary(config),
    cityBreakdown,
    sellerBreakdown,
    planBreakdown,
    ageBreakdown,
  }
}
