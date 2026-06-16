import type {
  Customer,
  InstallationEngineScore, InstallationEngineData, InstallationEngineInsight,
  InstallationScoreFactor,
  HealthClassification, Trend,
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

const INSTALLER_NAMES = [
  'Carlos Eduardo', 'Marcos Vieira', 'Tiago Borges',
  'Renato Cruz', 'Paulo Neto', 'Sandro Lima',
  'André Oliveira', 'Felipe Torres',
]

function assignInstaller(customer: Customer): string {
  const idx = parseInt(customer.id.replace('C', ''), 10) % INSTALLER_NAMES.length
  return INSTALLER_NAMES[idx]
}

const UC_LABEL: Record<string, string> = {
  house: 'Residência',
  condo: 'Condomínio',
  apartment: 'Prédio/Apto',
}

function computeInstallationScoreDetail(customer: Customer): {
  score: number
  factors: InstallationScoreFactor[]
  positive: InstallationScoreFactor[]
  negative: InstallationScoreFactor[]
} {
  const inst = customer.signals.installation
  const conn = customer.signals.connection
  const factors: InstallationScoreFactor[] = []
  let v = 65

  // Install delay
  const delay = inst.installDelayDays
  if (delay === 0) {
    factors.push({ label: 'Instalação no prazo', points: 20, impact: 'positive', category: 'delay' })
    v += 20
  } else if (delay <= 2) {
    factors.push({ label: `Pequeno atraso na instalação (${delay}d)`, points: 5, impact: 'positive', category: 'delay' })
    v += 5
  } else if (delay <= 5) {
    factors.push({ label: `Atraso de ${delay} dia(s) na instalação`, points: -10, impact: 'negative', category: 'delay' })
    v -= 10
  } else {
    factors.push({ label: `Atraso crítico: ${delay} dias na instalação`, points: -20, impact: 'negative', category: 'delay' })
    v -= 20
  }

  // Warranty tickets (within 72h post-install)
  const wt = inst.warrantyTickets
  if (wt === 0) {
    factors.push({ label: 'Sem chamados em garantia (72h)', points: 20, impact: 'positive', category: 'warranty' })
    v += 20
  } else if (wt === 1) {
    factors.push({ label: '1 chamado em garantia (72h)', points: -10, impact: 'negative', category: 'warranty' })
    v -= 10
  } else if (wt === 2) {
    factors.push({ label: `${wt} chamados em garantia (72h)`, points: -20, impact: 'negative', category: 'warranty' })
    v -= 20
  } else {
    factors.push({ label: `${wt} chamados em garantia — crítico`, points: -25, impact: 'negative', category: 'warranty' })
    v -= 25
  }

  // Technical returns after install
  const tr = inst.technicalReturns
  if (tr === 0) {
    factors.push({ label: 'Sem retornos técnicos pós-instalação', points: 15, impact: 'positive', category: 'installer' })
    v += 15
  } else if (tr === 1) {
    factors.push({ label: '1 retorno técnico pós-instalação', points: -5, impact: 'negative', category: 'installer' })
    v -= 5
  } else {
    factors.push({ label: `${tr} retornos técnicos pós-instalação`, points: -15, impact: 'negative', category: 'installer' })
    v -= 15
  }

  // Scheduling changes during installation
  const sc = inst.schedulingChanges
  if (sc === 0) {
    factors.push({ label: 'Instalação sem reagendamentos', points: 10, impact: 'positive', category: 'scheduling' })
    v += 10
  } else if (sc === 1) {
    factors.push({ label: '1 reagendamento na instalação', points: 0, impact: 'positive', category: 'scheduling' })
  } else {
    factors.push({ label: `${sc} reagendamentos na instalação`, points: -10, impact: 'negative', category: 'scheduling' })
    v -= 10
  }

  // ONT firmware age
  const firmAge = conn.ontFirmwareAge
  if (firmAge < 180) {
    factors.push({ label: `ONT ${conn.ontBrand} ${conn.ontModel} — firmware recente`, points: 5, impact: 'positive', category: 'ont' })
    v += 5
  } else if (firmAge > 730) {
    factors.push({ label: `ONT com firmware desatualizado (${Math.round(firmAge / 365)}a)`, points: -10, impact: 'negative', category: 'ont' })
    v -= 10
  } else {
    factors.push({ label: `ONT ${conn.ontBrand} ${conn.ontModel}`, points: 0, impact: 'positive', category: 'ont' })
  }

  // UC type
  const uc = customer.signals.profile.housingType
  if (uc === 'house') {
    factors.push({ label: 'UC: Residência (instalação simples)', points: 5, impact: 'positive', category: 'uc_type' })
    v += 5
  } else if (uc === 'condo') {
    factors.push({ label: 'UC: Condomínio (instalação estruturada)', points: 3, impact: 'positive', category: 'uc_type' })
    v += 3
  } else {
    factors.push({ label: 'UC: Prédio/Apartamento', points: 0, impact: 'positive', category: 'uc_type' })
  }

  const score = clamp(v)
  return {
    score,
    factors,
    positive: factors.filter((f) => f.impact === 'positive' && f.points > 0),
    negative: factors.filter((f) => f.impact === 'negative'),
  }
}

function buildInstallationEngineScores(customers: Customer[]): InstallationEngineScore[] {
  return customers.map((c) => {
    const { score, factors, positive, negative } = computeInstallationScoreDetail(c)
    const trendValue = c.healthScores.installation.trendValue
    const trend: Trend = trendValue > 4 ? 'improving' : trendValue < -4 ? 'degrading' : 'stable'
    return {
      customerId: c.id,
      customerName: c.name,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      installationScore: score,
      classification: scoreToHealthClass(score),
      trend,
      trendValue,
      factors,
      positiveFactors: positive,
      negativeFactors: negative,
      installerName: assignInstaller(c),
      ucType: c.signals.profile.housingType,
      ontModel: c.signals.connection.ontModel,
      ontBrand: c.signals.connection.ontBrand,
      warrantyTickets: c.signals.installation.warrantyTickets,
      installDelayDays: c.signals.installation.installDelayDays,
      technicalReturns: c.signals.installation.technicalReturns,
      schedulingChanges: c.signals.installation.schedulingChanges,
      slaCompliant: c.signals.installation.slaCompliant,
    }
  })
}

function buildInstallationInsights(customers: Customer[], scores: InstallationEngineScore[]): InstallationEngineInsight[] {
  const sorted = [...customers].sort((a, b) => b.churnScore - a.churnScore)
  const highRisk = sorted.slice(0, Math.floor(customers.length * 0.2))
  const lowRisk  = sorted.slice(Math.floor(customers.length * 0.6))

  const hrIds = new Set(highRisk.map((c) => c.id))
  const lrIds = new Set(lowRisk.map((c) => c.id))
  const hScores = scores.filter((s) => hrIds.has(s.customerId))
  const lScores = scores.filter((s) => lrIds.has(s.customerId))

  const pct = (arr: InstallationEngineScore[], fn: (s: InstallationEngineScore) => boolean) =>
    arr.filter(fn).length / arr.length

  const wtHR  = pct(hScores, (s) => s.warrantyTickets > 0)
  const wtLR  = pct(lScores, (s) => s.warrantyTickets > 0)
  const delHR = pct(hScores, (s) => s.installDelayDays > 2)
  const delLR = pct(lScores, (s) => s.installDelayDays > 2)
  const retHR = pct(hScores, (s) => s.technicalReturns > 0)
  const retLR = pct(lScores, (s) => s.technicalReturns > 0)
  const schedHR = pct(hScores, (s) => s.schedulingChanges > 1)
  const schedLR = pct(lScores, (s) => s.schedulingChanges > 1)

  const avgInstHR = hScores.reduce((s, c) => s + c.installationScore, 0) / hScores.length
  const avgInstLR = lScores.reduce((s, c) => s + c.installationScore, 0) / lScores.length

  // ONT brand with most warranty tickets
  const ontWarranty = new Map<string, { total: number; withWarranty: number }>()
  scores.forEach((s) => {
    const e = ontWarranty.get(s.ontBrand) ?? { total: 0, withWarranty: 0 }
    e.total++
    if (s.warrantyTickets > 0) e.withWarranty++
    ontWarranty.set(s.ontBrand, e)
  })
  const worstOnt = Array.from(ontWarranty.entries())
    .map(([brand, v]) => ({ brand, rate: v.withWarranty / v.total }))
    .sort((a, b) => b.rate - a.rate)[0]

  return [
    {
      finding: `Score de instalação médio: ${avgInstHR.toFixed(0)} pts nos churners vs ${avgInstLR.toFixed(0)} pts nos saudáveis — qualidade da instalação é preditor precoce de churn.`,
      confidence: 84,
      factor: 'installationScore',
      impact: 'high',
      affectedCount: hScores.length,
      churnMultiplier: parseFloat((avgInstLR / Math.max(1, avgInstHR)).toFixed(2)),
    },
    {
      finding: `Chamados em garantia (72h) em ${(wtHR * 100).toFixed(0)}% dos churners vs ${(wtLR * 100).toFixed(0)}% dos saudáveis — problemas pós-instalação imediatos elevam churn em ${((wtHR / Math.max(0.01, wtLR) - 1) * 100).toFixed(0)}%.`,
      confidence: 91,
      factor: 'warrantyTickets',
      impact: 'high',
      affectedCount: hScores.filter((s) => s.warrantyTickets > 0).length,
      churnMultiplier: parseFloat((wtHR / Math.max(0.01, wtLR)).toFixed(2)),
    },
    {
      finding: `Atraso na instalação em ${(delHR * 100).toFixed(0)}% dos clientes de alto risco vs ${(delLR * 100).toFixed(0)}% dos saudáveis — primeira impressão negativa aumenta probabilidade de churn precoce.`,
      confidence: 77,
      factor: 'installDelayDays',
      impact: 'high',
      affectedCount: hScores.filter((s) => s.installDelayDays > 2).length,
      churnMultiplier: parseFloat((delHR / Math.max(0.01, delLR)).toFixed(2)),
    },
    {
      finding: `Retornos técnicos em ${(retHR * 100).toFixed(0)}% dos churners vs ${(retLR * 100).toFixed(0)}% dos saudáveis — retorno pós-instalação indica problema estrutural não resolvido.`,
      confidence: 73,
      factor: 'technicalReturns',
      impact: 'medium',
      affectedCount: hScores.filter((s) => s.technicalReturns > 0).length,
      churnMultiplier: parseFloat((retHR / Math.max(0.01, retLR)).toFixed(2)),
    },
    {
      finding: `ONT ${worstOnt?.brand ?? 'genérica'} apresenta maior taxa de chamados em garantia (${((worstOnt?.rate ?? 0) * 100).toFixed(0)}%) — avaliar compatibilidade com perfil de UC atendida.`,
      confidence: 68,
      factor: 'ontBrand',
      impact: 'medium',
      affectedCount: scores.filter((s) => s.ontBrand === worstOnt?.brand && s.warrantyTickets > 0).length,
      churnMultiplier: parseFloat(((worstOnt?.rate ?? 0.3) / 0.15).toFixed(2)),
    },
    {
      finding: `Reagendamentos múltiplos durante instalação em ${(schedHR * 100).toFixed(0)}% dos churners vs ${(schedLR * 100).toFixed(0)}% — cada reagendamento adicional aumenta percepção negativa antes mesmo do serviço ativo.`,
      confidence: 69,
      factor: 'schedulingChanges',
      impact: 'medium',
      affectedCount: hScores.filter((s) => s.schedulingChanges > 1).length,
      churnMultiplier: parseFloat((schedHR / Math.max(0.01, schedLR)).toFixed(2)),
    },
  ]
}

export function buildInstallationEngineData(customers: Customer[]): InstallationEngineData {
  const scores = buildInstallationEngineScores(customers)

  const avgInstallationScore = scores.reduce((s, c) => s + c.installationScore, 0) / scores.length
  const criticalCount    = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount    = scores.filter((s) => s.classification === 'high_risk').length
  const avgWarrantyTickets = scores.reduce((s, c) => s + c.warrantyTickets, 0) / scores.length
  const avgInstallDelay  = scores.reduce((s, c) => s + c.installDelayDays, 0) / scores.length
  const totalReturns     = scores.reduce((s, c) => s + c.technicalReturns, 0)

  // Installer breakdown
  const instMap = new Map<string, { total: number; scoreSum: number; warrantySum: number; returnSum: number; delaySum: number }>()
  scores.forEach((s) => {
    const e = instMap.get(s.installerName) ?? { total: 0, scoreSum: 0, warrantySum: 0, returnSum: 0, delaySum: 0 }
    e.total++
    e.scoreSum += s.installationScore
    e.warrantySum += s.warrantyTickets > 0 ? 1 : 0
    e.returnSum += s.technicalReturns > 0 ? 1 : 0
    e.delaySum += s.installDelayDays
    instMap.set(s.installerName, e)
  })
  const installerBreakdown = Array.from(instMap.entries())
    .map(([name, v]) => ({
      name,
      count: v.total,
      avgScore: parseFloat((v.scoreSum / v.total).toFixed(1)),
      warrantyRate: parseFloat(((v.warrantySum / v.total) * 100).toFixed(1)),
      returnRate: parseFloat(((v.returnSum / v.total) * 100).toFixed(1)),
      avgDelay: parseFloat((v.delaySum / v.total).toFixed(1)),
    }))
    .sort((a, b) => a.avgScore - b.avgScore)

  // UC type breakdown
  const ucTypeBreakdown = [
    { label: 'Residência', key: 'house' },
    { label: 'Condomínio', key: 'condo' },
    { label: 'Prédio/Apto', key: 'apartment' },
  ].map(({ label, key }) => {
    const group = scores.filter((s) => s.ucType === key)
    const warrantyCount = group.filter((s) => s.warrantyTickets > 0).length
    return {
      label,
      key,
      count: group.length,
      avgScore: group.length ? parseFloat((group.reduce((s, c) => s + c.installationScore, 0) / group.length).toFixed(1)) : 0,
      warrantyRate: group.length ? parseFloat(((warrantyCount / group.length) * 100).toFixed(1)) : 0,
    }
  })

  // ONT brand breakdown
  const ontMap = new Map<string, { total: number; scoreSum: number; warrantyCount: number }>()
  scores.forEach((s) => {
    const e = ontMap.get(s.ontBrand) ?? { total: 0, scoreSum: 0, warrantyCount: 0 }
    e.total++
    e.scoreSum += s.installationScore
    if (s.warrantyTickets > 0) e.warrantyCount++
    ontMap.set(s.ontBrand, e)
  })
  const ontBreakdown = Array.from(ontMap.entries())
    .map(([brand, v]) => ({
      brand,
      count: v.total,
      avgScore: parseFloat((v.scoreSum / v.total).toFixed(1)),
      warrantyRate: parseFloat(((v.warrantyCount / v.total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.warrantyRate - a.warrantyRate)

  // Warranty breakdown
  const warrantyBreakdown = [
    { label: 'Sem chamados', min: 0, max: 0 },
    { label: '1 chamado',   min: 1, max: 1 },
    { label: '2 chamados',  min: 2, max: 2 },
    { label: '3+ chamados', min: 3, max: 99 },
  ].map(({ label, min, max }) => {
    const count = scores.filter((s) => s.warrantyTickets >= min && s.warrantyTickets <= max).length
    return { label, count, pct: parseFloat(((count / scores.length) * 100).toFixed(1)) }
  })

  // City breakdown
  const cityMap = new Map<string, { total: number; scoreSum: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { total: 0, scoreSum: 0 }
    e.total++
    e.scoreSum += s.installationScore
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, avgScore: parseFloat((v.scoreSum / v.total).toFixed(1)), count: v.total }))
    .sort((a, b) => a.avgScore - b.avgScore)

  const MONTHS = ['Jun/24','Jul/24','Ago/24','Set/24','Out/24','Nov/24','Dez/24','Jan/25','Fev/25','Mar/25','Abr/25','Mai/25']
  const scoreHistory = MONTHS.map((month, i) => ({
    month,
    avgScore: parseFloat((avgInstallationScore + (1 - i / (MONTHS.length - 1)) * 4 + Math.cos(i) * 1.5).toFixed(1)),
  }))

  return {
    scores,
    avgInstallationScore: parseFloat(avgInstallationScore.toFixed(1)),
    criticalCount,
    highRiskCount,
    avgWarrantyTickets: parseFloat(avgWarrantyTickets.toFixed(2)),
    avgInstallDelay: parseFloat(avgInstallDelay.toFixed(1)),
    totalReturns,
    insights: buildInstallationInsights(customers, scores),
    installerBreakdown,
    ucTypeBreakdown,
    ontBreakdown,
    warrantyBreakdown,
    cityBreakdown,
    scoreHistory,
  }
}

export { UC_LABEL }
