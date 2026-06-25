import { useMemo } from 'react'
import type { HealthClassification } from '@/types'
import { realClients } from '@/data/realClients'
import { useAppStore } from '@/store/appStore'
import { buildFinancialEngineData } from '@/features/financial-engine/financialEngine'
import { buildCommercialEngineData } from '@/features/commercial-engine/commercialEngine'
import { buildConnectionEngineData } from '@/features/connection-engine/connectionEngine'
import { buildNetworkEngineData } from '@/features/network-engine/networkEngine'
import { buildFieldEngineData } from '@/features/field-engine/fieldEngine'
import { buildInstallationEngineData } from '@/features/installation-engine/installationEngine'
import { buildRelationshipEngineData } from '@/features/relationship-engine/relationshipEngine'

// Subconjunto comum a todos os *EngineScore — o que o dashboard/IA realmente consomem.
export interface EngineScoreLite {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  healthScore: number
  churnRisk: number
  revenueRisk: number
  classification: HealthClassification
}

export interface EngineSummary {
  key: string
  label: string
  route: string
  analyzed: number
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
  distribution: Record<HealthClassification, number>
  scores: EngineScoreLite[]
}

type EngineDataLike = {
  scores: EngineScoreLite[]
  avgHealthScore: number
  avgChurnRisk: number
  totalRevenueRisk: number
  criticalCount: number
  highRiskCount: number
}

const EMPTY_DIST = (): Record<HealthClassification, number> => ({
  excellent: 0, healthy: 0, attention: 0, high_risk: 0, critical: 0,
})

function summarize(key: string, label: string, route: string, data: EngineDataLike): EngineSummary {
  const distribution = EMPTY_DIST()
  for (const s of data.scores) distribution[s.classification]++
  return {
    key,
    label,
    route,
    analyzed: data.scores.length,
    avgHealthScore: data.avgHealthScore,
    avgChurnRisk: data.avgChurnRisk,
    totalRevenueRisk: data.totalRevenueRisk,
    criticalCount: data.criticalCount,
    highRiskCount: data.highRiskCount,
    distribution,
    scores: data.scores.map((s) => ({
      customerId: s.customerId,
      customerName: s.customerName,
      city: s.city,
      plan: s.plan,
      monthlyValue: s.monthlyValue,
      healthScore: s.healthScore,
      churnRisk: s.churnRisk,
      revenueRisk: s.revenueRisk,
      classification: s.classification,
    })),
  }
}

// Hook reativo: lê os 7 configs do store e recalcula o resumo de cada engine
// usando exatamente os mesmos filtros de cliente de cada página de engine.
export function useEngineSummaries(): EngineSummary[] {
  const financialConfig = useAppStore((s) => s.financialConfig)
  const commercialConfig = useAppStore((s) => s.commercialConfig)
  const connectionConfig = useAppStore((s) => s.connectionConfig)
  const networkConfig = useAppStore((s) => s.networkConfig)
  const fieldConfig = useAppStore((s) => s.fieldConfig)
  const installationConfig = useAppStore((s) => s.installationConfig)
  const relationshipConfig = useAppStore((s) => s.relationshipConfig)

  return useMemo(() => {
    const financialClients = realClients.filter((c) => c.totalInvoices > 0 || c.trustReleases > 0 || c.renegotiations > 0)
    const connectionClients = realClients.filter((c) => c.equipment.length > 0)
    const networkClients = realClients.filter((c) => c.netMassiveCount > 0)
    const fieldClients = realClients.filter((c) => c.protocolCount > 0)
    const installationClients = realClients.filter((c) => c.installProtocols > 0)
    const relationshipClients = realClients.filter((c) => c.relProtocolCount > 0)

    return [
      summarize('financial', 'Financeiro', '/financeiro', buildFinancialEngineData(financialClients, financialConfig)),
      summarize('commercial', 'Comercial', '/engine-comercial', buildCommercialEngineData(realClients, commercialConfig)),
      summarize('connection', 'Conexão', '/engine-conexao', buildConnectionEngineData(connectionClients, connectionConfig)),
      summarize('network', 'Rede', '/engine-rede', buildNetworkEngineData(networkClients, networkConfig)),
      summarize('field', 'Campo', '/manutencao', buildFieldEngineData(fieldClients, fieldConfig)),
      summarize('installation', 'Instalação', '/engine-instalacao', buildInstallationEngineData(installationClients, installationConfig)),
      summarize('relationship', 'Relacionamento', '/engine-relacionamento', buildRelationshipEngineData(relationshipClients, relationshipConfig)),
    ]
  }, [financialConfig, commercialConfig, connectionConfig, networkConfig, fieldConfig, installationConfig, relationshipConfig])
}

// ─── Risco combinado por cliente (usado pela IA Preditiva) ──────────────
export interface ClientRisk {
  customerId: string
  customerName: string
  city: string
  plan: string
  monthlyValue: number
  overallHealth: number          // média dos health scores dos engines em que aparece
  overallChurnRisk: number       // 100 - overallHealth
  classification: HealthClassification
  revenueRisk: number            // churnRisk% × MRR
  enginesPresent: number
  byEngine: { key: string; label: string; healthScore: number; classification: HealthClassification }[]
}

function classify(v: number): HealthClassification {
  if (v >= 81) return 'excellent'
  if (v >= 61) return 'healthy'
  if (v >= 41) return 'attention'
  if (v >= 21) return 'high_risk'
  return 'critical'
}

// Agrega os scores de todos os engines por cliente e devolve um ranking de risco.
export function buildClientRiskRanking(summaries: EngineSummary[]): ClientRisk[] {
  const map = new Map<string, ClientRisk & { _sum: number }>()
  for (const eng of summaries) {
    for (const s of eng.scores) {
      let entry = map.get(s.customerId)
      if (!entry) {
        entry = {
          customerId: s.customerId,
          customerName: s.customerName,
          city: s.city,
          plan: s.plan,
          monthlyValue: s.monthlyValue,
          overallHealth: 0,
          overallChurnRisk: 0,
          classification: 'healthy',
          revenueRisk: 0,
          enginesPresent: 0,
          byEngine: [],
          _sum: 0,
        }
        map.set(s.customerId, entry)
      }
      entry._sum += s.healthScore
      entry.enginesPresent++
      entry.byEngine.push({ key: eng.key, label: eng.label, healthScore: s.healthScore, classification: s.classification })
    }
  }

  const out: ClientRisk[] = []
  for (const e of map.values()) {
    const overallHealth = Math.round(e._sum / Math.max(1, e.enginesPresent))
    const overallChurnRisk = 100 - overallHealth
    out.push({
      customerId: e.customerId,
      customerName: e.customerName,
      city: e.city,
      plan: e.plan,
      monthlyValue: e.monthlyValue,
      overallHealth,
      overallChurnRisk,
      classification: classify(overallHealth),
      revenueRisk: (overallChurnRisk / 100) * e.monthlyValue,
      enginesPresent: e.enginesPresent,
      byEngine: e.byEngine,
    })
  }
  return out.sort((a, b) => a.overallHealth - b.overallHealth)
}
