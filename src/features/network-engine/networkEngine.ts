import type {
  Customer, NetworkInfraScoreFactor, NetworkEngineScore, NetworkEngineInsight,
  NetworkEngineData, HealthClassification, Trend,
} from '@/types'

function scoreToHealthClass(v: number): HealthClassification {
  if (v >= 81) return 'excellent'
  if (v >= 61) return 'healthy'
  if (v >= 41) return 'attention'
  if (v >= 21) return 'high_risk'
  return 'critical'
}

function clamp(v: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(v)))
}

export function computeInfraScoreDetail(customer: Customer): {
  infraScore: number
  factors: NetworkInfraScoreFactor[]
  positive: NetworkInfraScoreFactor[]
  negative: NetworkInfraScoreFactor[]
} {
  const inf = customer.signals.infra
  const factors: NetworkInfraScoreFactor[] = []
  let v = 50

  // GMUDs
  const gmudPts = inf.gmudCount === 0 ? 10 : inf.gmudCount <= 2 ? 5 : inf.gmudCount <= 5 ? 0 : -12
  if (gmudPts !== 0) {
    factors.push({ label: `GMUDs 6mo: ${inf.gmudCount}`, points: gmudPts, impact: gmudPts > 0 ? 'positive' : 'negative', category: 'gmud' })
    v += gmudPts
  }

  // Massivas count
  const masPts = inf.massivasCount === 0 ? 10 : inf.massivasCount <= 2 ? 3 : inf.massivasCount <= 5 ? -8 : -15
  factors.push({ label: `Massivas 6mo: ${inf.massivasCount}`, points: masPts, impact: masPts >= 0 ? 'positive' : 'negative', category: 'massiva' })
  v += masPts

  // Massivas SLA
  const slaPts = inf.massivasSlaAvgMin < 60 ? 8 : inf.massivasSlaAvgMin < 120 ? 3 : inf.massivasSlaAvgMin < 240 ? -5 : -12
  if (inf.massivasCount > 0) {
    factors.push({ label: `SLA médio massivas: ${inf.massivasSlaAvgMin}min`, points: slaPts, impact: slaPts >= 0 ? 'positive' : 'negative', category: 'massiva' })
    v += slaPts
  }

  // Quebras
  const qPts = inf.quebraCount === 0 ? 10 : inf.quebraCount <= 1 ? 3 : inf.quebraCount <= 3 ? -8 : -15
  factors.push({ label: `Quebras infra 6mo: ${inf.quebraCount}`, points: qPts, impact: qPts >= 0 ? 'positive' : 'negative', category: 'quebra' })
  v += qPts

  // Collaborator score
  const collabPts = inf.collaboratorScore > 85 ? 8 : inf.collaboratorScore > 70 ? 4 : inf.collaboratorScore > 55 ? 0 : -8
  if (collabPts !== 0) {
    factors.push({ label: `Técnico: ${inf.collaboratorName} (${inf.collaboratorScore}pts)`, points: collabPts, impact: collabPts > 0 ? 'positive' : 'negative', category: 'collaborator' })
    v += collabPts
  }

  // Splitter quality
  const splitPts = inf.splitter === '1:4' ? 5 : inf.splitter === '1:8' ? 3 : inf.splitter === '1:16' ? 0 : -5
  if (splitPts !== 0) {
    factors.push({ label: `Splitter ${inf.splitter}`, points: splitPts, impact: splitPts > 0 ? 'positive' : 'negative', category: 'infra' })
    v += splitPts
  }

  const infraScore = clamp(v)
  return {
    infraScore, factors,
    positive: factors.filter((f) => f.impact === 'positive' && f.points > 0),
    negative: factors.filter((f) => f.impact === 'negative'),
  }
}

// Score de conexão (CPE/ONT) a partir dos sinais — local para o Network Engine
function computeConnectionScore(c: Customer): number {
  const s = c.signals.connection
  let v = 100
  v -= s.pppoeDrops * 1.5
  v -= s.pingMs > 30 ? (s.pingMs - 30) * 0.3 : 0
  v -= s.wifiRssi < -65 ? (-65 - s.wifiRssi) * 0.5 : 0
  v -= s.ontRamUsage > 70 ? (s.ontRamUsage - 70) * 0.4 : 0
  v -= s.ontCpuUsage > 70 ? (s.ontCpuUsage - 70) * 0.4 : 0
  v -= s.txRxOscillation * 1.5
  v -= s.ontFirmwareAge > 12 ? (s.ontFirmwareAge - 12) * 0.5 : 0
  return clamp(v)
}

function buildNetworkEngineScores(customers: Customer[]): NetworkEngineScore[] {
  return customers.map((c) => {
    const { infraScore, factors, positive, negative } = computeInfraScoreDetail(c)
    const connScore = computeConnectionScore(c)
    const networkScore = clamp(Math.round(infraScore * 0.70 + connScore * 0.30))
    const tv = c.healthScores.network.trendValue
    const trend: Trend = tv > 4 ? 'improving' : tv < -4 ? 'degrading' : 'stable'
    const { infra: inf } = c.signals
    return {
      customerId: c.id, customerName: c.name, city: c.city, plan: c.plan,
      monthlyValue: c.monthlyValue, networkScore, infraScore, connectionScore: connScore,
      classification: scoreToHealthClass(networkScore), trend, trendValue: tv,
      factors, positiveFactors: positive, negativeFactors: negative,
      site: inf.site, olt: inf.olt, slot: inf.slot, port: inf.port,
      splitter: inf.splitter, gmudCount: inf.gmudCount, massivasCount: inf.massivasCount,
      quebraCount: inf.quebraCount, collaboratorScore: inf.collaboratorScore,
      collaboratorName: inf.collaboratorName,
    }
  })
}

function buildInsights(customers: Customer[]): NetworkEngineInsight[] {
  const sorted = [...customers].sort((a, b) => b.churnScore - a.churnScore)
  const hr = sorted.slice(0, Math.floor(customers.length * 0.20))
  const lr = sorted.slice(Math.floor(customers.length * 0.60))

  const avg = (arr: Customer[], fn: (c: Customer) => number) => arr.reduce((s, c) => s + fn(c), 0) / arr.length
  const pct = (arr: Customer[], fn: (c: Customer) => boolean) => arr.filter(fn).length / arr.length

  const masHR = avg(hr, (c) => c.signals.infra.massivasCount)
  const masLR = avg(lr, (c) => c.signals.infra.massivasCount)
  const slaHR = avg(hr, (c) => c.signals.infra.massivasSlaAvgMin)
  const slaLR = avg(lr, (c) => c.signals.infra.massivasSlaAvgMin)
  const qHR = avg(hr, (c) => c.signals.infra.quebraCount)
  const qLR = avg(lr, (c) => c.signals.infra.quebraCount)
  const gmudHR = avg(hr, (c) => c.signals.infra.gmudCount)
  const gmudLR = avg(lr, (c) => c.signals.infra.gmudCount)
  const badSplitHR = pct(hr, (c) => c.signals.infra.splitter === '1:32')
  const badSplitLR = pct(lr, (c) => c.signals.infra.splitter === '1:32')
  const goodSplitHR = pct(hr, (c) => c.signals.infra.splitter === '1:4')
  const goodSplitLR = pct(lr, (c) => c.signals.infra.splitter === '1:4')
  const collabLowHR = pct(hr, (c) => c.signals.infra.collaboratorScore < 65)
  const collabLowLR = pct(lr, (c) => c.signals.infra.collaboratorScore < 65)
  const highQHR = pct(hr, (c) => c.signals.infra.quebraCount > 3)
  const highQLR = pct(lr, (c) => c.signals.infra.quebraCount > 3)

  return [
    {
      finding: `Massivas 6mo: média de ${masHR.toFixed(1)} (alto risco) vs ${masLR.toFixed(1)} (saudáveis). Clientes expostos a mais de 5 massivas têm ${(masHR / Math.max(0.1, masLR)).toFixed(1)}x mais risco de cancelamento.`,
      confidence: 89, factor: 'massivasCount', impact: 'high',
      affectedCount: hr.filter((c) => c.signals.infra.massivasCount > 5).length,
      churnMultiplier: parseFloat((masHR / Math.max(0.1, masLR)).toFixed(2)),
    },
    {
      finding: `SLA médio de massivas: ${slaHR.toFixed(0)}min (alto risco) vs ${slaLR.toFixed(0)}min (saudáveis). Interrupções com SLA >240min têm impacto ${(slaHR / Math.max(1, slaLR)).toFixed(1)}x maior na satisfação.`,
      confidence: 85, factor: 'massivasSlaAvgMin', impact: 'high',
      affectedCount: hr.filter((c) => c.signals.infra.massivasSlaAvgMin > 240).length,
      churnMultiplier: parseFloat((slaHR / Math.max(1, slaLR)).toFixed(2)),
    },
    {
      finding: `Quebras de infraestrutura: ${qHR.toFixed(1)} (alto risco) vs ${qLR.toFixed(1)} (saudáveis). Clientes com >3 quebras representam ${(highQHR * 100).toFixed(0)}% dos em risco vs ${(highQLR * 100).toFixed(0)}% dos saudáveis.`,
      confidence: 91, factor: 'quebraCount', impact: 'high',
      affectedCount: hr.filter((c) => c.signals.infra.quebraCount > 3).length,
      churnMultiplier: parseFloat((qHR / Math.max(0.1, qLR)).toFixed(2)),
    },
    {
      finding: `GMUDs frequentes: ${gmudHR.toFixed(1)} (alto risco) vs ${gmudLR.toFixed(1)} (saudáveis). Mudanças planejadas excessivas indicam infraestrutura instável correlacionada com churn.`,
      confidence: 74, factor: 'gmudCount', impact: 'medium',
      affectedCount: hr.filter((c) => c.signals.infra.gmudCount > 5).length,
      churnMultiplier: parseFloat((gmudHR / Math.max(0.1, gmudLR)).toFixed(2)),
    },
    {
      finding: `Splitter 1:32 (pior qualidade) em ${(badSplitHR * 100).toFixed(0)}% dos clientes de alto risco vs ${(badSplitLR * 100).toFixed(0)}% dos saudáveis. Splitter 1:4 (melhor) apenas ${(goodSplitHR * 100).toFixed(0)}% vs ${(goodSplitLR * 100).toFixed(0)}%.`,
      confidence: 78, factor: 'splitter', impact: 'medium',
      affectedCount: hr.filter((c) => c.signals.infra.splitter === '1:32').length,
      churnMultiplier: parseFloat((badSplitHR / Math.max(0.01, badSplitLR)).toFixed(2)),
    },
    {
      finding: `Técnicos com score <65: ${(collabLowHR * 100).toFixed(0)}% dos atendimentos em alto risco vs ${(collabLowLR * 100).toFixed(0)}% nos saudáveis. Qualidade do atendimento técnico é fator significativo de retenção.`,
      confidence: 69, factor: 'collaboratorScore', impact: 'medium',
      affectedCount: hr.filter((c) => c.signals.infra.collaboratorScore < 65).length,
      churnMultiplier: parseFloat((collabLowHR / Math.max(0.01, collabLowLR)).toFixed(2)),
    },
  ]
}

export function buildNetworkEngineData(customers: Customer[]): NetworkEngineData {
  const scores = buildNetworkEngineScores(customers)
  const sum = (fn: (s: NetworkEngineScore) => number) => scores.reduce((s, c) => s + fn(c), 0)

  const avgNetworkScore  = parseFloat((sum((s) => s.networkScore)  / scores.length).toFixed(1))
  const avgInfraScore    = parseFloat((sum((s) => s.infraScore)    / scores.length).toFixed(1))
  const avgConnectionScore = parseFloat((sum((s) => s.connectionScore) / scores.length).toFixed(1))
  const criticalCount  = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount  = scores.filter((s) => s.classification === 'high_risk').length
  const avgGmudCount   = parseFloat((sum((s) => s.gmudCount)    / scores.length).toFixed(1))
  const avgMassivasCount = parseFloat((sum((s) => s.massivasCount) / scores.length).toFixed(1))

  // OLT breakdown
  const oltMap = new Map<string, { site: string; count: number; netSum: number; infraSum: number }>()
  scores.forEach((s) => {
    const e = oltMap.get(s.olt) ?? { site: s.site, count: 0, netSum: 0, infraSum: 0 }
    e.count++; e.netSum += s.networkScore; e.infraSum += s.infraScore
    oltMap.set(s.olt, e)
  })
  const oltBreakdown = Array.from(oltMap.entries()).map(([olt, v]) => ({
    olt, site: v.site, count: v.count,
    avgNetworkScore: parseFloat((v.netSum / v.count).toFixed(1)),
    avgInfraScore: parseFloat((v.infraSum / v.count).toFixed(1)),
  })).sort((a, b) => a.avgNetworkScore - b.avgNetworkScore)

  // Site breakdown
  const siteMap = new Map<string, { count: number; netSum: number }>()
  scores.forEach((s) => {
    const e = siteMap.get(s.site) ?? { count: 0, netSum: 0 }
    e.count++; e.netSum += s.networkScore
    siteMap.set(s.site, e)
  })
  const siteBreakdown = Array.from(siteMap.entries()).map(([site, v]) => ({
    site, count: v.count, avgNetworkScore: parseFloat((v.netSum / v.count).toFixed(1)),
  })).sort((a, b) => a.avgNetworkScore - b.avgNetworkScore)

  // Splitter breakdown
  const splitterBreakdown = ['1:4', '1:8', '1:16', '1:32'].map((sp) => {
    const g = scores.filter((s) => s.splitter === sp)
    return { splitter: sp, count: g.length, avgScore: g.length ? parseFloat((g.reduce((s, c) => s + c.networkScore, 0) / g.length).toFixed(1)) : 0 }
  })

  // Collaborator breakdown
  const collabMap = new Map<string, { score: number; count: number; netSum: number }>()
  scores.forEach((s) => {
    const e = collabMap.get(s.collaboratorName) ?? { score: s.collaboratorScore, count: 0, netSum: 0 }
    e.count++; e.netSum += s.networkScore
    collabMap.set(s.collaboratorName, e)
  })
  const collaboratorBreakdown = Array.from(collabMap.entries()).map(([name, v]) => ({
    name, score: v.score, count: v.count, avgNetworkScore: parseFloat((v.netSum / v.count).toFixed(1)),
  })).sort((a, b) => b.score - a.score)

  // GMUD breakdown
  const gmudBreakdown = [
    { label: 'Nenhum (0)',  min: 0, max: 0  },
    { label: 'Baixo (1-2)',min: 1, max: 2  },
    { label: 'Médio (3-5)',min: 3, max: 5  },
    { label: 'Alto (>5)',  min: 6, max: 999 },
  ].map(({ label, min, max }) => {
    const g = scores.filter((s) => s.gmudCount >= min && s.gmudCount <= max)
    return { label, count: g.length, avgScore: g.length ? parseFloat((g.reduce((s, c) => s + c.networkScore, 0) / g.length).toFixed(1)) : 0 }
  })

  // Massivas SLA breakdown
  const massivasSlaBreakdown = [
    { label: '<60min',    min: 0,   max: 59  },
    { label: '60-119min', min: 60,  max: 119 },
    { label: '120-239min',min: 120, max: 239 },
    { label: '≥240min',  min: 240, max: 9999 },
  ].map(({ label, min, max }) => {
    const g = scores.filter((s) => s.massivasCount > 0 && customers.find((c) => c.id === s.customerId)!.signals.infra.massivasSlaAvgMin >= min && customers.find((c) => c.id === s.customerId)!.signals.infra.massivasSlaAvgMin <= max)
    return { label, count: g.length, avgScore: g.length ? parseFloat((g.reduce((s, c) => s + c.networkScore, 0) / g.length).toFixed(1)) : 0 }
  })

  const cityMap = new Map<string, { total: number; scoreSum: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { total: 0, scoreSum: 0 }
    e.total++; e.scoreSum += s.networkScore
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, avgScore: parseFloat((v.scoreSum / v.total).toFixed(1)), count: v.total }))
    .sort((a, b) => a.avgScore - b.avgScore)

  const MONTHS = ['Jun/24','Jul/24','Ago/24','Set/24','Out/24','Nov/24','Dez/24','Jan/25','Fev/25','Mar/25','Abr/25','Mai/25']
  const scoreHistory = MONTHS.map((month, i) => ({
    month,
    avgNetworkScore: parseFloat((avgNetworkScore + (1 - i / (MONTHS.length - 1)) * 3).toFixed(1)),
    avgInfraScore:   parseFloat((avgInfraScore   + (1 - i / (MONTHS.length - 1)) * 3.5).toFixed(1)),
    avgConnectionScore: parseFloat((avgConnectionScore + (1 - i / (MONTHS.length - 1)) * 4).toFixed(1)),
  }))

  return {
    scores, avgNetworkScore, avgInfraScore, avgConnectionScore,
    criticalCount, highRiskCount, avgGmudCount, avgMassivasCount,
    insights: buildInsights(customers),
    oltBreakdown, siteBreakdown, splitterBreakdown, collaboratorBreakdown,
    gmudBreakdown, massivasSlaBreakdown, cityBreakdown, scoreHistory,
  }
}