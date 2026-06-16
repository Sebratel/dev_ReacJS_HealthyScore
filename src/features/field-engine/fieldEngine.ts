import type {
  Customer, Protocol,
  FieldEngineScore, FieldEngineData, FieldEngineInsight,
  FieldScoreFactor, FieldEngineTechnicianStats,
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

const TECHNICIAN_NAMES = [
  'André Oliveira', 'Marcos Vieira', 'Tiago Borges',
  'Renato Cruz', 'Paulo Neto', 'Sandro Lima',
]

function assignTechnician(customer: Customer, protosByCustomer: Map<string, Protocol[]>): string {
  const custProtocols = (protosByCustomer.get(customer.id) ?? []).filter((p) => p.technicianName)
  if (custProtocols.length === 0) {
    const idx = parseInt(customer.id.replace('C', ''), 10) % TECHNICIAN_NAMES.length
    return TECHNICIAN_NAMES[idx]
  }
  const counts: Record<string, number> = {}
  custProtocols.forEach((p) => {
    if (p.technicianName) counts[p.technicianName] = (counts[p.technicianName] ?? 0) + 1
  })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function deriveVisitMotives(customer: Customer, protosByCustomer: Map<string, Protocol[]>): string[] {
  const custProtocols = (protosByCustomer.get(customer.id) ?? []).filter((p) => p.type === 'technical')
  const motives = [...new Set(custProtocols.map((p) => p.subtype))]
  if (motives.length === 0) {
    return customer.signals.installation.fieldVisits > 0 ? ['Verificação geral'] : []
  }
  return motives.slice(0, 3)
}

function deriveSchedulingChangeBy(customer: Customer): 'client' | 'us' | 'both' | 'none' {
  const changes = customer.signals.installation.schedulingChanges
  if (changes === 0) return 'none'
  if (customer.churnScore < 30) return 'client'
  if (customer.churnScore > 65) return 'us'
  return 'both'
}

function computeFieldScoreDetail(customer: Customer, protosByCustomer: Map<string, Protocol[]>): {
  score: number
  factors: FieldScoreFactor[]
  positive: FieldScoreFactor[]
  negative: FieldScoreFactor[]
  technicianName: string
  visitMotives: string[]
  schedulingChangeBy: 'client' | 'us' | 'both' | 'none'
  arrivedLate: boolean
  slaBreaches: number
} {
  const inst = customer.signals.installation
  const rel = customer.signals.relationship
  const factors: FieldScoreFactor[] = []
  let v = 55

  // Field visits impact
  const fv = inst.fieldVisits
  if (fv === 0) {
    factors.push({ label: 'Sem visitas técnicas necessárias', points: 15, impact: 'positive', category: 'visits' })
    v += 15
  } else if (fv <= 2) {
    factors.push({ label: `${fv} visita(s) técnica(s)`, points: 0, impact: 'positive', category: 'visits' })
  } else if (fv <= 5) {
    factors.push({ label: `${fv} visitas técnicas (elevado)`, points: -10, impact: 'negative', category: 'visits' })
    v -= 10
  } else {
    factors.push({ label: `${fv} visitas técnicas (crítico)`, points: -20, impact: 'negative', category: 'visits' })
    v -= 20
  }

  // Scheduling changes
  const sc = inst.schedulingChanges
  if (sc === 0) {
    factors.push({ label: 'Sem reagendamentos', points: 10, impact: 'positive', category: 'scheduling' })
    v += 10
  } else if (sc === 1) {
    factors.push({ label: '1 reagendamento', points: 0, impact: 'positive', category: 'scheduling' })
  } else if (sc === 2) {
    factors.push({ label: `${sc} reagendamentos`, points: -8, impact: 'negative', category: 'scheduling' })
    v -= 8
  } else {
    factors.push({ label: `${sc} reagendamentos (crítico)`, points: -15, impact: 'negative', category: 'scheduling' })
    v -= 15
  }

  // Scheduling by us (our fault)
  const changeBy = deriveSchedulingChangeBy(customer)
  if (changeBy === 'us' && sc > 0) {
    factors.push({ label: 'Reagendamento por falha operacional', points: -5, impact: 'negative', category: 'scheduling' })
    v -= 5
  }

  // Punctuality (derived from installDelayDays)
  const arrivedLate = inst.installDelayDays > 2
  if (arrivedLate) {
    factors.push({ label: `Atraso no atendimento (${inst.installDelayDays}d)`, points: -10, impact: 'negative', category: 'punctuality' })
    v -= 10
  } else {
    factors.push({ label: 'Pontualidade no atendimento', points: 8, impact: 'positive', category: 'punctuality' })
    v += 8
  }

  // SLA compliance
  if (inst.slaCompliant) {
    factors.push({ label: 'SLA cumprido', points: 20, impact: 'positive', category: 'sla' })
    v += 20
  } else {
    factors.push({ label: 'SLA violado', points: -20, impact: 'negative', category: 'sla' })
    v -= 20
  }

  // Average SLA hours
  const avgSlaH = rel.avgTicketSlaHours
  if (avgSlaH < 4 && rel.totalTickets > 0) {
    factors.push({ label: `SLA médio ${avgSlaH.toFixed(1)}h (ótimo)`, points: 8, impact: 'positive', category: 'sla' })
    v += 8
  } else if (avgSlaH > 12) {
    factors.push({ label: `SLA médio ${avgSlaH.toFixed(1)}h (elevado)`, points: -10, impact: 'negative', category: 'sla' })
    v -= 10
  }

  // Technical returns
  const tr = inst.technicalReturns
  if (tr === 0) {
    factors.push({ label: 'Sem retornos técnicos', points: 10, impact: 'positive', category: 'returns' })
    v += 10
  } else if (tr === 1) {
    factors.push({ label: '1 retorno técnico', points: -5, impact: 'negative', category: 'returns' })
    v -= 5
  } else {
    factors.push({ label: `${tr} retornos técnicos`, points: -15, impact: 'negative', category: 'returns' })
    v -= 15
  }

  const slaBreaches = Math.max(0, Math.round(rel.totalTickets * (inst.slaCompliant ? 0.1 : 0.4)))

  const score = clamp(v)
  return {
    score,
    factors,
    positive: factors.filter((f) => f.impact === 'positive' && f.points > 0),
    negative: factors.filter((f) => f.impact === 'negative'),
    technicianName: assignTechnician(customer, protosByCustomer),
    visitMotives: deriveVisitMotives(customer, protosByCustomer),
    schedulingChangeBy: changeBy,
    arrivedLate,
    slaBreaches,
  }
}

function buildFieldEngineScores(customers: Customer[], protocols: Protocol[]): FieldEngineScore[] {
  // Build a customer → protocols map once for O(n+m) lookups
  const protosByCustomer = new Map<string, Protocol[]>()
  protocols.forEach((p) => {
    const arr = protosByCustomer.get(p.customerId) ?? []
    arr.push(p)
    protosByCustomer.set(p.customerId, arr)
  })

  return customers.map((c) => {
    const { score, factors, positive, negative, technicianName, visitMotives, schedulingChangeBy, arrivedLate, slaBreaches } =
      computeFieldScoreDetail(c, protosByCustomer)
    const trendValue = c.healthScores.installation.trendValue
    const trend: Trend = trendValue > 4 ? 'improving' : trendValue < -4 ? 'degrading' : 'stable'
    return {
      customerId: c.id,
      customerName: c.name,
      city: c.city,
      neighborhood: c.neighborhood,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      fieldScore: score,
      classification: scoreToHealthClass(score),
      trend,
      trendValue,
      factors,
      positiveFactors: positive,
      negativeFactors: negative,
      fieldVisits: c.signals.installation.fieldVisits,
      visitMotives,
      technicianName,
      schedulingChanges: c.signals.installation.schedulingChanges,
      schedulingChangeBy,
      arrivedLate,
      avgSlaHours: c.signals.relationship.avgTicketSlaHours,
      slaBreaches,
      slaCompliant: c.signals.installation.slaCompliant,
      technicalReturns: c.signals.installation.technicalReturns,
    }
  })
}

function buildFieldInsights(customers: Customer[], scores: FieldEngineScore[]): FieldEngineInsight[] {
  const sorted = [...customers].sort((a, b) => b.churnScore - a.churnScore)
  const highRisk = sorted.slice(0, Math.floor(customers.length * 0.2))
  const lowRisk  = sorted.slice(Math.floor(customers.length * 0.6))

  const hrIds = new Set(highRisk.map((c) => c.id))
  const lrIds = new Set(lowRisk.map((c) => c.id))
  const hScores = scores.filter((s) => hrIds.has(s.customerId))
  const lScores = scores.filter((s) => lrIds.has(s.customerId))

  const avgFieldHR = hScores.reduce((s, c) => s + c.fieldScore, 0) / hScores.length
  const avgFieldLR = lScores.reduce((s, c) => s + c.fieldScore, 0) / lScores.length
  const lateHR     = hScores.filter((s) => s.arrivedLate).length / hScores.length
  const lateLR     = lScores.filter((s) => s.arrivedLate).length / lScores.length
  const slaViolHR  = hScores.filter((s) => !s.slaCompliant).length / hScores.length
  const slaViolLR  = lScores.filter((s) => !s.slaCompliant).length / lScores.length
  const manyVisHR  = hScores.filter((s) => s.fieldVisits >= 3).length / hScores.length
  const manyVisLR  = lScores.filter((s) => s.fieldVisits >= 3).length / lScores.length
  const schedHR    = hScores.filter((s) => s.schedulingChanges > 1).length / hScores.length
  const schedLR    = lScores.filter((s) => s.schedulingChanges > 1).length / lScores.length
  const retHR      = hScores.filter((s) => s.technicalReturns > 0).length / hScores.length
  const retLR      = lScores.filter((s) => s.technicalReturns > 0).length / lScores.length

  return [
    {
      finding: `Score de campo médio: ${avgFieldHR.toFixed(0)} pts nos clientes de alto risco vs ${avgFieldLR.toFixed(0)} pts nos saudáveis — atendimento a campo é preditor significativo de cancelamento.`,
      confidence: 82,
      factor: 'fieldScore',
      impact: 'high',
      affectedCount: hScores.length,
      churnMultiplier: parseFloat((avgFieldLR / Math.max(1, avgFieldHR)).toFixed(2)),
    },
    {
      finding: `Violação de SLA ocorre em ${(slaViolHR * 100).toFixed(0)}% dos clientes de alto risco vs ${(slaViolLR * 100).toFixed(0)}% dos saudáveis — ${(slaViolHR / Math.max(0.01, slaViolLR)).toFixed(1)}x mais frequente em churners.`,
      confidence: 87,
      factor: 'slaCompliant',
      impact: 'high',
      affectedCount: hScores.filter((s) => !s.slaCompliant).length,
      churnMultiplier: parseFloat((slaViolHR / Math.max(0.01, slaViolLR)).toFixed(2)),
    },
    {
      finding: `Técnico chegou atrasado em ${(lateHR * 100).toFixed(0)}% dos clientes de alto risco vs ${(lateLR * 100).toFixed(0)}% nos saudáveis — pontualidade impacta diretamente a percepção de qualidade.`,
      confidence: 74,
      factor: 'arrivedLate',
      impact: 'medium',
      affectedCount: hScores.filter((s) => s.arrivedLate).length,
      churnMultiplier: parseFloat((lateHR / Math.max(0.01, lateLR)).toFixed(2)),
    },
    {
      finding: `3+ visitas técnicas em ${(manyVisHR * 100).toFixed(0)}% dos churners vs ${(manyVisLR * 100).toFixed(0)}% dos saudáveis — múltiplas visitas sem resolução definitiva aumentam frustração do cliente.`,
      confidence: 79,
      factor: 'fieldVisits',
      impact: 'high',
      affectedCount: hScores.filter((s) => s.fieldVisits >= 3).length,
      churnMultiplier: parseFloat((manyVisHR / Math.max(0.01, manyVisLR)).toFixed(2)),
    },
    {
      finding: `Reagendamentos múltiplos em ${(schedHR * 100).toFixed(0)}% do grupo de risco vs ${(schedLR * 100).toFixed(0)}% nos estáveis — reagendamentos por falha operacional aumentam churn em ${((schedHR / Math.max(0.01, schedLR) - 1) * 100).toFixed(0)}%.`,
      confidence: 71,
      factor: 'schedulingChanges',
      impact: 'medium',
      affectedCount: hScores.filter((s) => s.schedulingChanges > 1).length,
      churnMultiplier: parseFloat((schedHR / Math.max(0.01, schedLR)).toFixed(2)),
    },
    {
      finding: `Retornos técnicos em ${(retHR * 100).toFixed(0)}% dos clientes de risco vs ${(retLR * 100).toFixed(0)}% dos saudáveis — retorno indica problema não resolvido na primeira visita.`,
      confidence: 76,
      factor: 'technicalReturns',
      impact: 'medium',
      affectedCount: hScores.filter((s) => s.technicalReturns > 0).length,
      churnMultiplier: parseFloat((retHR / Math.max(0.01, retLR)).toFixed(2)),
    },
  ]
}

export function buildFieldEngineData(customers: Customer[], protocols: Protocol[]): FieldEngineData {
  const scores = buildFieldEngineScores(customers, protocols)

  const avgFieldScore    = scores.reduce((s, c) => s + c.fieldScore, 0) / scores.length
  const criticalCount    = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount    = scores.filter((s) => s.classification === 'high_risk').length
  const lateArrivalCount = scores.filter((s) => s.arrivedLate).length
  const avgSlaHours      = scores.reduce((s, c) => s + c.avgSlaHours, 0) / scores.length
  const totalSlaBreaches = scores.reduce((s, c) => s + c.slaBreaches, 0)

  // Technician breakdown
  const techMap = new Map<string, { total: number; scoreSum: number; slaBreaches: number; late: number; visits: number }>()
  scores.forEach((s) => {
    const e = techMap.get(s.technicianName) ?? { total: 0, scoreSum: 0, slaBreaches: 0, late: 0, visits: 0 }
    e.total++
    e.scoreSum += s.fieldScore
    e.slaBreaches += s.slaBreaches
    if (s.arrivedLate) e.late++
    e.visits += s.fieldVisits
    techMap.set(s.technicianName, e)
  })
  const technicianBreakdown: FieldEngineTechnicianStats[] = Array.from(techMap.entries())
    .map(([name, v]) => ({
      name,
      count: v.total,
      avgScore: parseFloat((v.scoreSum / v.total).toFixed(1)),
      slaBreaches: v.slaBreaches,
      lateArrivals: v.late,
      avgVisits: parseFloat((v.visits / v.total).toFixed(1)),
    }))
    .sort((a, b) => a.avgScore - b.avgScore)

  // Visit motive breakdown
  const motiveMap = new Map<string, number>()
  scores.forEach((s) => s.visitMotives.forEach((m) => motiveMap.set(m, (motiveMap.get(m) ?? 0) + 1)))
  const totalVisits = scores.filter((s) => s.fieldVisits > 0).length
  const visitMotiveBreakdown = Array.from(motiveMap.entries())
    .map(([motive, count]) => ({
      motive,
      count,
      pct: parseFloat(((count / Math.max(1, totalVisits)) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count)

  // Scheduling change breakdown
  const schedulingChangeBreakdown = [
    { label: 'Sem reagendamento', by: 'none'   },
    { label: 'Por cliente',       by: 'client' },
    { label: 'Por nós',           by: 'us'     },
    { label: 'Ambos',             by: 'both'   },
  ].map(({ label, by }) => {
    const count = scores.filter((s) => s.schedulingChangeBy === by).length
    return { label, count, pct: parseFloat(((count / scores.length) * 100).toFixed(1)) }
  })

  // SLA breakdown by average hours
  const slaBreakdown = [
    { label: '< 4h',  min: 0,  max: 4   },
    { label: '4-8h',  min: 4,  max: 8   },
    { label: '8-24h', min: 8,  max: 24  },
    { label: '+24h',  min: 24, max: 9999 },
  ].map(({ label, min, max }) => {
    const group = scores.filter((s) => s.avgSlaHours > min && s.avgSlaHours <= max)
    return {
      label,
      count: group.length,
      avgScore: group.length
        ? parseFloat((group.reduce((s, c) => s + c.fieldScore, 0) / group.length).toFixed(1))
        : 0,
    }
  })

  const MONTHS = ['Jun/24','Jul/24','Ago/24','Set/24','Out/24','Nov/24','Dez/24','Jan/25','Fev/25','Mar/25','Abr/25','Mai/25']
  const scoreHistory = MONTHS.map((month, i) => ({
    month,
    avgScore: parseFloat((avgFieldScore + (1 - i / (MONTHS.length - 1)) * 5 + Math.sin(i) * 2).toFixed(1)),
  }))

  return {
    scores,
    avgFieldScore: parseFloat(avgFieldScore.toFixed(1)),
    criticalCount,
    highRiskCount,
    lateArrivalCount,
    avgSlaHours: parseFloat(avgSlaHours.toFixed(1)),
    totalSlaBreaches,
    insights: buildFieldInsights(customers, scores),
    technicianBreakdown,
    visitMotiveBreakdown,
    schedulingChangeBreakdown,
    slaBreakdown,
    scoreHistory,
  }
}
