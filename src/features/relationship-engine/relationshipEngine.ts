import type { Customer, Protocol, RelationshipEngineData, RelationshipEngineScore, RelationshipEngineInsight, HealthClassification, Trend } from '@/types'

const ATTENDANT_NAMES = [
  'Ana Lima', 'Bruno Souza', 'Camila Rocha', 'Diego Ferreira', 'Elisa Martins',
  'Fábio Costa', 'Gabriela Nunes', 'Henrique Silva',
]

const NATIVE_REASONS = [
  'Dúvida sobre fatura', 'Solicitação de suporte', 'Reclamação de velocidade',
  'Informação sobre planos', 'Cancelamento', 'Reagendamento visita',
]

const MATRIX_REASONS = [
  'Suporte técnico', 'Segunda via de boleto', 'Reclamação geral',
  'Informação contratual', 'Elogio', 'Cancelamento',
]

const TICKET_AREAS = [
  'Técnico – Conexão', 'Financeiro – Cobrança', 'Comercial – Plano',
  'Técnico – Equipamento', 'Reclamação – Atendimento', 'Administrativo – Contrato',
]

function classify(score: number): HealthClassification {
  if (score >= 81) return 'excellent'
  if (score >= 61) return 'healthy'
  if (score >= 41) return 'attention'
  if (score >= 21) return 'high_risk'
  return 'critical'
}

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i)
  return Math.abs(h >>> 0)
}

function buildCustomerScore(
  customer: Customer,
  protocols: Protocol[],
): RelationshipEngineScore {
  const rel = customer.signals.relationship
  const h = hash(customer.id)

  // Attendant: deterministic from customer id
  const attendant = ATTENDANT_NAMES[h % ATTENDANT_NAMES.length]

  // Native/Matrix contacts (contacts without a protocol ticket)
  const excess = Math.max(0, rel.contactsLast30d - rel.totalTickets)
  const nativeContacts = Math.round(excess * 0.55)
  const matrixContacts = Math.round(excess * 0.40)

  // Derive per-customer sla breach count from protocols
  const customerProtos = protocols.filter((p) => p.customerId === customer.id)
  const slaBreachCount = customerProtos.filter(
    (p) => p.resolvedInHours !== null && p.resolvedInHours > p.slaHours
  ).length

  // Build score
  let score = 70 // base

  // NPS contribution
  if (rel.npsScore >= 9) score += 12
  else if (rel.npsScore >= 7) score += 5
  else if (rel.npsScore >= 5) score -= 5
  else score -= 15

  // Sentiment
  if (rel.sentimentScore > 0.3) score += 10
  else if (rel.sentimentScore > 0) score += 3
  else if (rel.sentimentScore > -0.3) score -= 8
  else score -= 18

  // Tickets
  if (rel.totalTickets === 0) score += 8
  else if (rel.totalTickets <= 2) score += 2
  else if (rel.totalTickets <= 5) score -= 8
  else score -= 18

  // Recurrent tickets
  if (rel.recurrentTickets === 0) score += 5
  else if (rel.recurrentTickets <= 1) score -= 5
  else score -= 14

  // SLA breaches
  if (slaBreachCount === 0) score += 8
  else if (slaBreachCount === 1) score -= 5
  else score -= 14

  // Cancellation threats
  if (rel.cancellationThreats === 0) score += 8
  else if (rel.cancellationThreats === 1) score -= 10
  else score -= 20

  // Plan downgrade
  if (rel.planDowngrade) score -= 10

  // 2nd copy requests
  if (rel.duplicateBillRequests > 2) score -= 5

  score = Math.max(5, Math.min(100, score))

  const trendBase = ((h % 21) - 10) / 2
  const trend: Trend = trendBase > 1.5 ? 'improving' : trendBase < -1.5 ? 'degrading' : 'stable'

  const factors = []
  if (rel.npsScore >= 9) factors.push({ label: 'NPS promotor', points: 12, impact: 'positive' as const, category: 'nps' as const })
  else if (rel.npsScore < 5) factors.push({ label: 'NPS detrator', points: -15, impact: 'negative' as const, category: 'nps' as const })

  if (rel.sentimentScore > 0.3) factors.push({ label: 'Sentimento positivo', points: 10, impact: 'positive' as const, category: 'sentiment' as const })
  else if (rel.sentimentScore < -0.3) factors.push({ label: 'Sentimento negativo', points: -18, impact: 'negative' as const, category: 'sentiment' as const })

  if (rel.cancellationThreats > 0) factors.push({ label: `${rel.cancellationThreats} ameaça(s) cancelamento`, points: -20, impact: 'negative' as const, category: 'threats' as const })
  if (rel.recurrentTickets > 1) factors.push({ label: 'Chamados recorrentes', points: -14, impact: 'negative' as const, category: 'tickets' as const })
  if (slaBreachCount > 1) factors.push({ label: 'Quebras de SLA', points: -14, impact: 'negative' as const, category: 'tickets' as const })
  if (rel.planDowngrade) factors.push({ label: 'Reduziu plano', points: -10, impact: 'negative' as const, category: 'billing' as const })
  if (rel.totalTickets === 0) factors.push({ label: 'Sem chamados recentes', points: 8, impact: 'positive' as const, category: 'tickets' as const })
  if (nativeContacts + matrixContacts > 4) factors.push({ label: 'Alto volume scrapping', points: -8, impact: 'negative' as const, category: 'scrapping' as const })

  return {
    customerId: customer.id,
    customerName: customer.name,
    city: customer.city,
    plan: customer.plan,
    monthlyValue: customer.monthlyValue,
    relationshipScore: score,
    classification: classify(score),
    trend,
    trendValue: parseFloat(trendBase.toFixed(1)),
    factors,
    positiveFactors: factors.filter((f) => f.impact === 'positive'),
    negativeFactors: factors.filter((f) => f.impact === 'negative'),
    totalTickets: rel.totalTickets,
    recurrentTickets: rel.recurrentTickets,
    slaBreaches: slaBreachCount,
    avgSlaHours: customer.signals.relationship.avgTicketSlaHours,
    secondCopyRequests: rel.duplicateBillRequests,
    planDowngrade: rel.planDowngrade,
    attendant,
    npsScore: rel.npsScore,
    sentimentScore: rel.sentimentScore,
    nativeContacts,
    matrixContacts,
    cancellationThreats: rel.cancellationThreats,
  }
}

function deriveInsights(scores: RelationshipEngineScore[]): RelationshipEngineInsight[] {
  const sorted = [...scores].sort((a, b) => a.relationshipScore - b.relationshipScore)
  const highRisk = sorted.slice(0, Math.floor(sorted.length * 0.2))
  const healthy = sorted.slice(Math.floor(sorted.length * 0.6))

  const avgThreatsRisk = highRisk.reduce((s, c) => s + c.cancellationThreats, 0) / highRisk.length
  const avgThreatsHealthy = healthy.reduce((s, c) => s + c.cancellationThreats, 0) / healthy.length

  const avgNpsRisk = highRisk.reduce((s, c) => s + c.npsScore, 0) / highRisk.length
  const avgNpsHealthy = healthy.reduce((s, c) => s + c.npsScore, 0) / healthy.length

  const avgSentRisk = highRisk.reduce((s, c) => s + c.sentimentScore, 0) / highRisk.length
  const avgSentHealthy = healthy.reduce((s, c) => s + c.sentimentScore, 0) / healthy.length

  const avgTicketsRisk = highRisk.reduce((s, c) => s + c.totalTickets, 0) / highRisk.length
  const avgTicketsHealthy = healthy.reduce((s, c) => s + c.totalTickets, 0) / healthy.length

  const avgSlaRisk = highRisk.reduce((s, c) => s + c.slaBreaches, 0) / highRisk.length
  const avgSlaHealthy = healthy.reduce((s, c) => s + c.slaBreaches, 0) / healthy.length

  const downgradeRisk = highRisk.filter((c) => c.planDowngrade).length / highRisk.length
  const downgradeHealthy = healthy.filter((c) => c.planDowngrade).length / healthy.length

  const insights: RelationshipEngineInsight[] = [
    {
      finding: `Clientes de alto risco têm ${avgThreatsRisk.toFixed(1)} ameaças de cancelamento vs ${avgThreatsHealthy.toFixed(1)} em clientes saudáveis`,
      confidence: 91,
      factor: 'cancellationThreats',
      impact: 'high',
      affectedCount: highRisk.filter((c) => c.cancellationThreats > 0).length,
      churnMultiplier: parseFloat((avgThreatsRisk / Math.max(avgThreatsHealthy, 0.1)).toFixed(2)),
    },
    {
      finding: `NPS médio do grupo de risco é ${avgNpsRisk.toFixed(1)} vs ${avgNpsHealthy.toFixed(1)} nos saudáveis — gap de ${(avgNpsHealthy - avgNpsRisk).toFixed(1)} pontos`,
      confidence: 88,
      factor: 'npsScore',
      impact: 'high',
      affectedCount: scores.filter((c) => c.npsScore < 6).length,
      churnMultiplier: parseFloat((avgNpsHealthy / Math.max(avgNpsRisk, 1)).toFixed(2)),
    },
    {
      finding: `Sentimento médio dos clientes críticos é ${avgSentRisk.toFixed(2)} vs ${avgSentHealthy.toFixed(2)} — clientes negativos têm maior propensão ao churn`,
      confidence: 84,
      factor: 'sentimentScore',
      impact: 'high',
      affectedCount: scores.filter((c) => c.sentimentScore < -0.2).length,
      churnMultiplier: parseFloat(((avgSentHealthy - avgSentRisk) + 1).toFixed(2)),
    },
    {
      finding: `Clientes de risco abrem ${avgTicketsRisk.toFixed(1)} chamados vs ${avgTicketsHealthy.toFixed(1)} — volume de tickets é um forte preditor de churn`,
      confidence: 79,
      factor: 'totalTickets',
      impact: 'medium',
      affectedCount: scores.filter((c) => c.totalTickets > 5).length,
      churnMultiplier: parseFloat((avgTicketsRisk / Math.max(avgTicketsHealthy, 0.5)).toFixed(2)),
    },
    {
      finding: `Grupo de risco tem ${avgSlaRisk.toFixed(1)} quebras de SLA vs ${avgSlaHealthy.toFixed(1)} — atrasos no atendimento elevam insatisfação`,
      confidence: 76,
      factor: 'slaBreaches',
      impact: 'medium',
      affectedCount: scores.filter((c) => c.slaBreaches > 1).length,
      churnMultiplier: parseFloat((avgSlaRisk / Math.max(avgSlaHealthy, 0.5)).toFixed(2)),
    },
    {
      finding: `${(downgradeRisk * 100).toFixed(0)}% dos clientes de risco reduziram plano vs ${(downgradeHealthy * 100).toFixed(0)}% dos saudáveis — sinal de engajamento decrescente`,
      confidence: 72,
      factor: 'planDowngrade',
      impact: 'medium',
      affectedCount: scores.filter((c) => c.planDowngrade).length,
      churnMultiplier: parseFloat((downgradeRisk / Math.max(downgradeHealthy, 0.01)).toFixed(2)),
    },
  ]

  return insights
}

export function buildRelationshipEngineData(customers: Customer[], protocols: Protocol[]): RelationshipEngineData {
  const scores = customers.map((c) => buildCustomerScore(c, protocols))

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length

  const avgRelationshipScore = parseFloat(avg(scores.map((s) => s.relationshipScore)).toFixed(1))
  const avgNps = parseFloat(avg(scores.map((s) => s.npsScore)).toFixed(1))
  const avgSentiment = parseFloat(avg(scores.map((s) => s.sentimentScore)).toFixed(2))
  const totalSlaBreaches = scores.reduce((s, c) => s + c.slaBreaches, 0)
  const totalNativeContacts = scores.reduce((s, c) => s + c.nativeContacts, 0)
  const totalMatrixContacts = scores.reduce((s, c) => s + c.matrixContacts, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length

  // Ticket area breakdown (derive from protocols)
  const areaMap = new Map<string, { count: number; slaSum: number; breaches: number; recurrent: number }>()
  protocols.forEach((p) => {
    const area = TICKET_AREAS[Math.abs(hash(p.id) % TICKET_AREAS.length)]
    const e = areaMap.get(area) ?? { count: 0, slaSum: 0, breaches: 0, recurrent: 0 }
    e.count++
    e.slaSum += p.resolvedInHours ?? p.slaHours
    if (p.resolvedInHours !== null && p.resolvedInHours > p.slaHours) e.breaches++
    if (p.isRecurrent) e.recurrent++
    areaMap.set(area, e)
  })
  const ticketAreaBreakdown = Array.from(areaMap.entries())
    .map(([area, v]) => ({
      area,
      count: v.count,
      avgSlaHours: parseFloat((v.slaSum / v.count).toFixed(1)),
      slaBreachRate: parseFloat(((v.breaches / v.count) * 100).toFixed(1)),
      recurrenceRate: parseFloat(((v.recurrent / v.count) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count)

  // NPS breakdown
  const npsGroups = [
    { label: 'Promotores', scoreRange: '9–10', min: 9, max: 10, color: '#10b981' },
    { label: 'Neutros', scoreRange: '7–8', min: 7, max: 8, color: '#f59e0b' },
    { label: 'Detratores', scoreRange: '0–6', min: 0, max: 6, color: '#ef4444' },
  ]
  const npsBreakdown = npsGroups.map((g) => {
    const count = scores.filter((s) => s.npsScore >= g.min && s.npsScore <= g.max).length
    return { label: g.label, scoreRange: g.scoreRange, count, pct: parseFloat(((count / scores.length) * 100).toFixed(1)), color: g.color }
  })

  // Sentiment breakdown
  const sentGroups = [
    { label: 'Positivo', min: 0.2, max: 1, color: '#10b981' },
    { label: 'Neutro', min: -0.2, max: 0.2, color: '#f59e0b' },
    { label: 'Negativo', min: -1, max: -0.2, color: '#ef4444' },
  ]
  const sentimentBreakdown = sentGroups.map((g) => {
    const group = scores.filter((s) => s.sentimentScore >= g.min && s.sentimentScore <= g.max)
    return {
      label: g.label,
      count: group.length,
      pct: parseFloat(((group.length / scores.length) * 100).toFixed(1)),
      avgScore: group.length ? parseFloat(avg(group.map((s) => s.sentimentScore)).toFixed(2)) : 0,
      color: g.color,
    }
  })

  // Attendant breakdown
  const attMap = new Map<string, { count: number; scoreSum: number; npsSum: number; slaBreaches: number; sentSum: number }>()
  scores.forEach((s) => {
    const e = attMap.get(s.attendant) ?? { count: 0, scoreSum: 0, npsSum: 0, slaBreaches: 0, sentSum: 0 }
    e.count++; e.scoreSum += s.relationshipScore; e.npsSum += s.npsScore
    e.slaBreaches += s.slaBreaches; e.sentSum += s.sentimentScore
    attMap.set(s.attendant, e)
  })
  const attendantBreakdown = Array.from(attMap.entries())
    .map(([name, v]) => ({
      name,
      count: v.count,
      avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)),
      avgNps: parseFloat((v.npsSum / v.count).toFixed(1)),
      slaBreaches: v.slaBreaches,
      avgSentiment: parseFloat((v.sentSum / v.count).toFixed(2)),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  // Native / Matrix reason breakdowns (deterministic distribution)
  const totalNative = totalNativeContacts
  const totalMatrix = totalMatrixContacts
  const nativeReasonBreakdown = NATIVE_REASONS.map((label, i) => {
    const share = [0.22, 0.18, 0.16, 0.14, 0.16, 0.14][i] ?? 0.1
    const count = Math.round(totalNative * share)
    return { label, count, pct: parseFloat((share * 100).toFixed(1)) }
  })
  const matrixReasonBreakdown = MATRIX_REASONS.map((label, i) => {
    const share = [0.28, 0.20, 0.18, 0.14, 0.08, 0.12][i] ?? 0.1
    const count = Math.round(totalMatrix * share)
    return { label, count, pct: parseFloat((share * 100).toFixed(1)) }
  })

  // Score history
  const MONTHS = ['Dez/24', 'Jan/25', 'Fev/25', 'Mar/25', 'Abr/25', 'Mai/25']
  const scoreHistory = MONTHS.map((month, i) => ({
    month,
    avgScore: parseFloat((avgRelationshipScore + Math.sin(i * 0.8) * 3).toFixed(1)),
    avgNps: parseFloat((avgNps + Math.sin(i * 0.7) * 0.4).toFixed(1)),
  }))

  const insights = deriveInsights(scores)

  // NPS score distribution (0–10)
  const npsScoreDistribution = Array.from({ length: 11 }, (_, score) => ({
    score,
    count: scores.filter((s) => s.npsScore === score).length,
  }))

  const totalNpsSurveysAnswered = scores.filter((s) => s.npsScore >= 0).length
  const totalSecondCopyRequests = scores.reduce((s, c) => s + c.secondCopyRequests, 0)
  const totalPlanDowngrades = scores.filter((s) => s.planDowngrade).length

  return {
    scores,
    avgRelationshipScore,
    criticalCount,
    highRiskCount,
    avgNps,
    avgSentiment,
    totalSlaBreaches,
    totalNativeContacts,
    totalMatrixContacts,
    insights,
    ticketAreaBreakdown,
    npsBreakdown,
    sentimentBreakdown,
    attendantBreakdown,
    nativeReasonBreakdown,
    matrixReasonBreakdown,
    scoreHistory,
    npsScoreDistribution,
    totalNpsSurveysAnswered,
    totalSecondCopyRequests,
    totalPlanDowngrades,
  }
}
