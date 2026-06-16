import { format, subDays } from 'date-fns'
import type { Customer, CancellationRecord, CancellationData, CancellationInsight, CancellationEngineScore, HealthClassification } from '@/types'

const MOTOBOY_NAMES = ['Rafael Souza', 'Leandro Lima', 'Anderson Pereira', 'Fábio Costa', 'Rodrigo Nunes']

const CANCELLATION_REASONS = [
  'Preço — oferta concorrente',
  'Instabilidade de conexão',
  'Mudança de endereço',
  'Dificuldade financeira',
  'Atendimento insatisfatório',
  'Velocidade abaixo do contratado',
  'Serviço não utilizado',
  'Falecimento / encerramento',
]

export const COMPETITOR_NAMES = [
  'NetFibra RS', 'VelocyNet', 'FibraCity', 'ConectaBr',
  'TurboPix', 'AgilNet', 'InterNet RS', 'ConnectRS',
]

const NON_PREVENTABLE_REASONS = ['Mudança de endereço', 'Falecimento / encerramento', 'Serviço não utilizado']

const PLAN_SEVERITY: Record<string, number> = {
  'Fibra 100MB': 85, 'Fibra 200MB': 72, 'Fibra 300MB': 58, 'Fibra 500MB': 42, 'Fibra 1GB': 28,
}

function scoreToClass(s: number): HealthClassification {
  if (s >= 81) return 'excellent'
  if (s >= 61) return 'healthy'
  if (s >= 41) return 'attention'
  if (s >= 21) return 'high_risk'
  return 'critical'
}

function buildEngineScore(records: CancellationRecord[]): CancellationEngineScore {
  const total = records.length
  if (total === 0) {
    return { overallScore: 0, classification: 'critical', motivoScore: 0, servicoScore: 0, devolucaoScore: 0, motoboyTempoScore: 0, motoboyVisitasScore: 0, motoboyScore: 0, clienteScore: 0, competidorScore: 0 }
  }

  // Motivo Score: % de motivos não-preventáveis (não é culpa da empresa)
  const nonPreventable = records.filter((r) => NON_PREVENTABLE_REASONS.includes(r.reason)).length
  const motivoScore = Math.round(15 + (nonPreventable / total) * 55)

  // Serviço Score: quão leve é o impacto pelo plano cancelado (menor plano = menos grave)
  const servicoScore = Math.round(records.reduce((s, r) => s + (PLAN_SEVERITY[r.plan] ?? 55), 0) / total)

  // Devolução Score: taxa de retorno × velocidade
  const returned = records.filter((r) => r.equipmentReturned)
  const returnRate = returned.length / total
  const avgReturnDays = returned.length > 0
    ? returned.reduce((s, r) => s + (r.equipmentReturnDays ?? 8), 0) / returned.length
    : 12
  const speedFactor = Math.max(0.35, 1 - avgReturnDays / 18)
  const devolucaoScore = Math.round(Math.min(95, returnRate * 80 + speedFactor * 25))

  // Motoboy Tempo Score: quanto mais rápido melhor
  const avgMotoboyDays = records.reduce((s, r) => s + r.motoboyDays, 0) / total
  const motoboyTempoScore = Math.round(Math.max(10, 100 - (avgMotoboyDays / 12) * 90))

  // Motoboy Visitas Score: quanto menos visitas melhor
  const avgVisits = records.reduce((s, r) => s + r.motoboyVisits, 0) / total
  const motoboyVisitasScore = Math.round(Math.max(15, 100 - ((avgVisits - 1) / 2) * 75))

  // Motoboy Score: combinado tempo + visitas
  const motoboyScore = Math.round(motoboyTempoScore * 0.55 + motoboyVisitasScore * 0.45)

  // Cliente Score: perfil de quem cancelou (quanto menor o contrato/receita, menos crítico)
  const avgContractMonths = records.reduce((s, r) => s + r.contractMonths, 0) / total
  const avgMonthlyValue = records.reduce((s, r) => s + r.monthlyValue, 0) / total
  const clienteScore = Math.round(Math.max(20, 100 - (avgContractMonths / 36) * 38 - (avgMonthlyValue / 200) * 28))

  // Competidor Score: taxa de identificação do destino (intel capturada)
  const identified = records.filter((r) => r.competitorName !== null).length
  const competidorScore = Math.round(20 + (identified / total) * 65)

  // Overall
  const overallScore = Math.round(
    devolucaoScore * 0.30 +
    motoboyScore * 0.25 +
    competidorScore * 0.15 +
    motivoScore * 0.15 +
    servicoScore * 0.10 +
    clienteScore * 0.05,
  )

  return {
    overallScore: Math.min(100, overallScore),
    classification: scoreToClass(overallScore),
    motivoScore, servicoScore, devolucaoScore,
    motoboyTempoScore, motoboyVisitasScore, motoboyScore,
    clienteScore, competidorScore,
  }
}

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i)
  return Math.abs(h >>> 0)
}

export function buildCancellationData(customers: Customer[]): CancellationData {
  // Simulate ~35% of high-churn customers as cancelled
  const cancelled = customers
    .filter((c) => c.churnScore >= 55)
    .sort((a, b) => b.churnScore - a.churnScore)
    .slice(0, 175)

  const records: CancellationRecord[] = cancelled.map((c) => {
    const h = hash(c.id)
    const daysAgo = 3 + (h % 175)
    const motoboyDays = 1 + (h % 8)
    const motoboyVisits = 1 + (h % 3)
    const returned = c.derivedRisks.equipmentReturn.probability < 55
    // ~25% have no identified competitor
    const compIdx = h % (COMPETITOR_NAMES.length + 3)
    const competitorName = compIdx < COMPETITOR_NAMES.length ? COMPETITOR_NAMES[compIdx] : null

    return {
      id: `CANC-${c.id}`,
      customerId: c.id,
      customerName: c.name,
      city: c.city,
      neighborhood: c.neighborhood,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      contractMonths: c.contractMonths,
      cancellationDate: format(subDays(new Date(), daysAgo), 'yyyy-MM-dd'),
      reason: CANCELLATION_REASONS[h % CANCELLATION_REASONS.length],
      equipmentReturned: returned,
      equipmentReturnDays: returned ? motoboyDays + (h % 4) : null,
      motoboyDays,
      motoboyVisits,
      motoboyCollaborator: MOTOBOY_NAMES[h % MOTOBOY_NAMES.length],
      competitorName,
      churnScore: c.churnScore,
      revenueAtRisk: c.monthlyValue * 12,
    }
  })

  const total = records.length
  const returnedCount = records.filter((r) => r.equipmentReturned).length
  const avgMotoboyDays = records.reduce((s, r) => s + r.motoboyDays, 0) / total
  const totalRevenueAtRisk = records.reduce((s, r) => s + r.revenueAtRisk, 0)

  // Reason breakdown
  const reasonMap = new Map<string, number>()
  records.forEach((r) => reasonMap.set(r.reason, (reasonMap.get(r.reason) ?? 0) + 1))
  const reasonBreakdown = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count, pct: parseFloat(((count / total) * 100).toFixed(1)) }))
    .sort((a, b) => b.count - a.count)

  // Plan breakdown
  const planMap = new Map<string, { count: number; monthsSum: number; revenue: number }>()
  records.forEach((r) => {
    const e = planMap.get(r.plan) ?? { count: 0, monthsSum: 0, revenue: 0 }
    e.count++; e.monthsSum += r.contractMonths; e.revenue += r.revenueAtRisk
    planMap.set(r.plan, e)
  })
  const planBreakdown = Array.from(planMap.entries())
    .map(([plan, v]) => ({
      plan, count: v.count,
      avgMonths: parseFloat((v.monthsSum / v.count).toFixed(1)),
      revenue: v.revenue,
    }))
    .sort((a, b) => b.count - a.count)

  // Motoboy breakdown
  const motoMap = new Map<string, { count: number; daysSum: number; returned: number }>()
  records.forEach((r) => {
    const e = motoMap.get(r.motoboyCollaborator) ?? { count: 0, daysSum: 0, returned: 0 }
    e.count++; e.daysSum += r.motoboyDays
    if (r.equipmentReturned) e.returned++
    motoMap.set(r.motoboyCollaborator, e)
  })
  const motoboyBreakdown = Array.from(motoMap.entries())
    .map(([name, v]) => ({
      name, count: v.count,
      avgDays: parseFloat((v.daysSum / v.count).toFixed(1)),
      returnedCount: v.returned,
      returnRate: parseFloat(((v.returned / v.count) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.returnRate - a.returnRate)

  // Competitor breakdown
  const compMap = new Map<string, number>()
  records.forEach((r) => {
    const key = r.competitorName ?? 'Não identificado'
    compMap.set(key, (compMap.get(key) ?? 0) + 1)
  })
  const competitorBreakdown = Array.from(compMap.entries())
    .map(([name, count]) => ({ name, count, pct: parseFloat(((count / total) * 100).toFixed(1)) }))
    .sort((a, b) => b.count - a.count)

  // City breakdown
  const cityMap = new Map<string, { count: number; returned: number; daysSum: number }>()
  records.forEach((r) => {
    const e = cityMap.get(r.city) ?? { count: 0, returned: 0, daysSum: 0 }
    e.count++; e.daysSum += r.motoboyDays
    if (r.equipmentReturned) e.returned++
    cityMap.set(r.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({
      city, count: v.count,
      returnRate: parseFloat(((v.returned / v.count) * 100).toFixed(1)),
      avgMotoboyDays: parseFloat((v.daysSum / v.count).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count)

  // Monthly trend (last 6 months, simulated distribution)
  const MONTHS = ['Dez/24', 'Jan/25', 'Fev/25', 'Mar/25', 'Abr/25', 'Mai/25']
  const base = Math.round(total / 6)
  const returnRate = returnedCount / total
  const monthlyTrend = MONTHS.map((month, i) => {
    const count = base + Math.round(Math.sin(i * 0.9) * 8)
    return { month, count, returned: Math.round(count * returnRate) }
  })

  const returnPct = Math.round((returnedCount / total) * 100)
  const priceReason = reasonBreakdown.find(r => r.reason === 'Preço — oferta concorrente')
  const topComp = competitorBreakdown.find(c => c.name !== 'Não identificado') ?? competitorBreakdown[0]
  const topCity = cityBreakdown[0]
  const worstMotoboy = [...motoboyBreakdown].sort((a, b) => a.returnRate - b.returnRate)[0]
  const preventableCount = (reasonBreakdown.find(r => r.reason === 'Dificuldade financeira')?.count ?? 0)
    + (reasonBreakdown.find(r => r.reason === 'Instabilidade de conexão')?.count ?? 0)

  const insights: CancellationInsight[] = [
    {
      finding: `"Preço — oferta concorrente" representa ${priceReason?.pct ?? 0}% dos cancelamentos — clientes em planos acima de R$129,90 têm risco 1,8× maior de migração para operadoras com pacotes mais baratos.`,
      confidence: 87, factor: 'price_competition', impact: 'high',
      affectedCount: priceReason?.count ?? 0, churnMultiplier: 1.8,
    },
    {
      finding: `Taxa de devolução de equipamento em ${returnPct}% expõe a empresa a custo estimado de R$380 por unidade não recuperada — processo de logística reversa requer reestruturação urgente.`,
      confidence: 92, factor: 'equipment_return', impact: returnPct < 60 ? 'high' : 'medium',
      affectedCount: total - returnedCount, churnMultiplier: 1.4,
    },
    {
      finding: `${topComp?.name ?? 'Concorrente líder'} absorveu ${topComp?.count ?? 0} clientes cancelados (${topComp?.pct ?? 0}%) — diferencial de preço abaixo em planos equivalentes é o principal vetor de migração identificado pelo modelo.`,
      confidence: 83, factor: 'competitor_destination', impact: 'high',
      affectedCount: topComp?.count ?? 0, churnMultiplier: 1.6,
    },
    {
      finding: `${topCity?.city ?? ''} lidera cancelamentos com taxa de devolução de ${topCity?.returnRate ?? 0}% — correlação com presença de concorrentes locais e histórico de instabilidade de rede nessa região.`,
      confidence: 78, factor: 'city_concentration', impact: 'medium',
      affectedCount: topCity?.count ?? 0, churnMultiplier: 1.5,
    },
    {
      finding: `Colaborador ${worstMotoboy?.name ?? ''} apresenta a menor taxa de devolução (${worstMotoboy?.returnRate ?? 0}%) com tempo médio de ${worstMotoboy?.avgDays ?? 0}d — treinamento e incentivo podem reduzir custo operacional em até 23%.`,
      confidence: 74, factor: 'motoboy_performance', impact: 'medium',
      affectedCount: worstMotoboy?.count ?? 0, churnMultiplier: 1.3,
    },
    {
      finding: `Dificuldade financeira e instabilidade de conexão somam ${preventableCount} cancelamentos potencialmente evitáveis — ações preventivas de cobrança flexível e manutenção proativa podem reduzir churn em até 15%.`,
      confidence: 81, factor: 'preventable_churn', impact: 'high',
      affectedCount: preventableCount, churnMultiplier: 1.5,
    },
  ]

  return {
    records, totalCancellations: total,
    equipmentReturnedCount: returnedCount,
    equipmentPendingCount: total - returnedCount,
    avgMotoboyDays: parseFloat(avgMotoboyDays.toFixed(1)),
    totalRevenueAtRisk,
    reasonBreakdown, planBreakdown, motoboyBreakdown, competitorBreakdown, cityBreakdown, monthlyTrend,
    insights,
    engineScore: buildEngineScore(records),
  }
}
