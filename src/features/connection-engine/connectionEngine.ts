import type {
  RealClient, EngineIndicatorBreakdown,
  ConnectionEngineScore, ConnectionEngineData, ConnectionScoreFactor,
  ConnectionEngineConfig, ConnectionIndicatorKey, ConnectionIndicatorSummary,
} from '@/types'
import {
  DEFAULT_CONNECTION_CONFIG, CONNECTION_INDICATOR_ORDER, ONU_INDICATOR_KEYS, ONU_STATUS_OF,
  RX_POWER_RANGES, DISTANCE_RANGES, TEMPERATURE_RANGES, WIFI_RSSI_RANGES,
  CPE_MEMORY_RANGES, CPE_TEMPERATURE_RANGES, bucketByMax, wifiGenerationOf,
} from './connectionConfig'
import { scoreToHealthClass } from '@/utils/health'
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)))

// ─── Chave do índice que casa com cada indicador de enlace ─────
// String vazia = sem dado para esse cliente → o indicador não pontua (nem a
// favor nem contra). É o que separa "cliente com sinal bom" de "cliente sem
// leitura óptica", que antes se confundiriam num zero.
const lanKeyOf = (mbps: number | null | undefined): string => {
  if (mbps == null || mbps <= 0) return 'sem_link'
  if (mbps >= 1000) return '1000'
  if (mbps >= 100) return '100'
  return '10'
}

export const linkKeysOf = (c: RealClient): Partial<Record<ConnectionIndicatorKey, string>> => ({
  // A potência é sempre negativa; o bucket roda sobre o módulo para a escala
  // ficar crescente (−27 dBm → 27 → faixa "ruim").
  opticalPower: c.connRxPower != null ? bucketByMax(Math.abs(c.connRxPower), RX_POWER_RANGES).key : '',
  lanSpeed: c.connLanMbps !== undefined ? lanKeyOf(c.connLanMbps) : '',
  wifiGeneration: c.connCpeModel ? wifiGenerationOf(c.connCpeModel) : '',
  onuStatusNow: c.connOnuStatus || '',
  fiberDistance: c.connFiberDistanceM != null ? bucketByMax(c.connFiberDistanceM, DISTANCE_RANGES).key : '',
  onuTemperature: c.connOnuTempC != null ? bucketByMax(c.connOnuTempC, TEMPERATURE_RANGES).key : '',
  // Wi-Fi: mediana (não o pior dispositivo — ver WIFI_RSSI_RANGES), sobre o
  // módulo, como a potência óptica.
  wifiRssi: c.connWifiRssi != null ? bucketByMax(Math.abs(c.connWifiRssi), WIFI_RSSI_RANGES).key : '',
  cpeMemory: c.connCpeMemPct != null ? bucketByMax(c.connCpeMemPct, CPE_MEMORY_RANGES).key : '',
  cpeTemperature: c.connCpeTempC != null ? bucketByMax(c.connCpeTempC, CPE_TEMPERATURE_RANGES).key : '',
})

// ─── Score por cliente — 100% real + config ────────────────────
// Equipamento: o cliente soma a nota de cada MODELO distinto que possui.
// Enlace: casa um índice por chave (faixa de sinal, velocidade da porta, …).
// Status ONU (quedas de PPPoE): presença — pontua uma vez quando o status
// ocorreu no período (contagens em c.onuStatusCounts, banco AutoISP).
function scoreClient(c: RealClient, config: ConnectionEngineConfig) {
  const factors: ConnectionScoreFactor[] = []
  const byKey: Partial<Record<ConnectionIndicatorKey, number>> = {}
  let v = 100
  const eq = config.indicators.equipment

  if (eq && eq.mode === 'manual') {
    for (const model of c.equipment) {
      const idx = eq.indices.find((i) => i.key === model)
      if (idx && idx.points) {
        factors.push({ label: model, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
        v += idx.points
        byKey.equipment = (byKey.equipment ?? 0) + idx.points
      }
    }
  }

  // Enlace — mesma mecânica do network engine: casa um índice por chave.
  const keys = linkKeysOf(c)
  for (const [key, matchKey] of Object.entries(keys) as [ConnectionIndicatorKey, string][]) {
    const ind = config.indicators[key]
    if (!ind || ind.mode !== 'manual' || !matchKey) continue
    const idx = ind.indices.find((i) => i.key === matchKey)
    if (idx && idx.points) {
      factors.push({ label: `${ind.label}: ${idx.label}`, points: idx.points, impact: idx.points >= 0 ? 'positive' : 'negative' })
      byKey[key] = (byKey[key] ?? 0) + idx.points
      v += idx.points
    }
  }

  const counts = c.onuStatusCounts ?? {}
  for (const key of ONU_INDICATOR_KEYS) {
    const ind = config.indicators[key]
    if (!ind || ind.mode !== 'manual' || !ind.points) continue
    const n = counts[ONU_STATUS_OF[key]] ?? 0
    if (n > 0) {
      factors.push({ label: ind.label, points: ind.points, impact: ind.points >= 0 ? 'positive' : 'negative' })
      v += ind.points
      byKey[key] = ind.points
    }
  }

  const healthScore = clamp(v)
  const churnRisk = clamp(100 - healthScore)
  return {
    healthScore,
    churnRisk,
    revenueRisk: (churnRisk / 100) * c.monthlyValue,
    classification: scoreToHealthClass(healthScore),
    factors,
    positive: factors.filter((f) => f.impact === 'positive'),
    negative: factors.filter((f) => f.impact === 'negative'),
    byKey,
  }
}

// Valor legível de cada indicador de enlace no detalhamento do cliente.
const linkDisplay = (c: RealClient, key: ConnectionIndicatorKey, matchKey: string, labelOfIndex: (k: string) => string): string => {
  switch (key) {
    case 'opticalPower': return c.connRxPower != null ? `${c.connRxPower.toFixed(2)} dBm` : 'Sem leitura'
    case 'lanSpeed': return c.connLanMbps ? `${c.connLanMbps} Mbps` : labelOfIndex(matchKey)
    case 'wifiGeneration': return `${labelOfIndex(matchKey)}${c.connCpeModel ? ` · ${c.connCpeModel}` : ''}`
    case 'fiberDistance': return c.connFiberDistanceM != null ? `${(c.connFiberDistanceM / 1000).toFixed(2)} km` : 'Sem leitura'
    case 'onuTemperature': return c.connOnuTempC != null ? `${c.connOnuTempC.toFixed(1)} °C` : 'Sem leitura'
    // Mostra a mediana com o pior aparelho ao lado: é o que o técnico precisa
    // para saber se o problema é a casa toda ou um aparelho longe do roteador.
    case 'wifiRssi': return c.connWifiRssi == null ? 'Sem leitura'
      : `${c.connWifiRssi.toFixed(0)} dBm (mediana de ${c.connWifiDevices ?? 0} aparelho(s)`
        + `${c.connWifiWorstRssi != null ? `, pior ${c.connWifiWorstRssi.toFixed(0)}` : ''})`
    case 'cpeMemory': return c.connCpeMemPct != null ? `${c.connCpeMemPct.toFixed(0)}%` : 'Sem leitura'
    case 'cpeTemperature': return c.connCpeTempC != null ? `${c.connCpeTempC.toFixed(1)} °C` : 'Sem leitura'
    default: return labelOfIndex(matchKey)
  }
}

export function buildEngineScores(clients: RealClient[], config: ConnectionEngineConfig): ConnectionEngineScore[] {
  return clients.map((c) => {
    const s = scoreClient(c, config)
    const counts = c.onuStatusCounts ?? {}
    const keys = linkKeysOf(c)
    // Detalhamento: equipamento sempre; enlace quando há leitura; status de ONU
    // só quando OCORREU no período — listar os 6 status zerados por cliente só
    // polui a leitura.
    const indicators = CONNECTION_INDICATOR_ORDER.filter((key) => config.indicators[key]).flatMap((key): EngineIndicatorBreakdown[] => {
      const ind = config.indicators[key]
      if (key === 'equipment') {
        return [{ key, label: ind.label, value: c.equipment.length ? c.equipment.join(', ') : 'Sem equipamento', points: s.byKey[key] ?? 0 }]
      }
      const matchKey = keys[key]
      if (matchKey !== undefined) {
        if (!matchKey) return []
        const labelOfIndex = (k: string) => ind.indices.find((i) => i.key === k)?.label ?? k
        return [{ key, label: ind.label, value: linkDisplay(c, key, matchKey, labelOfIndex), points: s.byKey[key] ?? 0 }]
      }
      const n = counts[ONU_STATUS_OF[key as keyof typeof ONU_STATUS_OF]] ?? 0
      if (n === 0) return []
      return [{ key, label: ind.label, value: `${n} evento(s)`, points: s.byKey[key] ?? 0 }]
    })
    return {
      customerId: c.clientId,
      customerName: c.name,
      contractNumber: c.contractNumber,
      city: c.city,
      plan: c.plan,
      monthlyValue: c.monthlyValue,
      equipment: c.equipment,
      onuStatusCounts: counts,
      onuDrops: (counts.power_fail ?? 0) + (counts.loss_signal ?? 0),
      rxPower: c.connRxPower ?? null,
      lanMbps: c.connLanMbps ?? null,
      wifiGen: keys.wifiGeneration || '',
      cpeModel: c.connCpeModel || '',
      onuStatus: c.connOnuStatus || '',
      fiberDistanceM: c.connFiberDistanceM ?? null,
      onuTempC: c.connOnuTempC ?? null,
      wifiRssi: c.connWifiRssi ?? null,
      wifiWorstRssi: c.connWifiWorstRssi ?? null,
      wifiDevices: c.connWifiDevices ?? null,
      cpeMemPct: c.connCpeMemPct ?? null,
      cpeTempC: c.connCpeTempC ?? null,
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

function buildIndicatorSummary(config: ConnectionEngineConfig): ConnectionIndicatorSummary[] {
  return CONNECTION_INDICATOR_ORDER.filter((key) => config.indicators[key]).map((key) => {
    const ind = config.indicators[key]
    return {
      key, label: ind.label, mode: ind.mode,
      totalIndices: ind.dynamic ? ind.indices.length : (ind.indices.length || 1),
      configuredCount: ind.indices.length
        ? ind.indices.filter((i) => i.points !== 0).length
        : (ind.points ? 1 : 0),
    }
  })
}

export function buildConnectionEngineData(
  clients: RealClient[],
  config: ConnectionEngineConfig = DEFAULT_CONNECTION_CONFIG,
): ConnectionEngineData {
  const scores = buildEngineScores(clients, config)
  const n = Math.max(1, scores.length)

  const avgHealthScore = scores.reduce((a, s) => a + s.healthScore, 0) / n
  const avgChurnRisk = scores.reduce((a, s) => a + s.churnRisk, 0) / n
  const totalRevenueRisk = scores.reduce((a, s) => a + s.revenueRisk, 0)
  const criticalCount = scores.filter((s) => s.classification === 'critical').length
  const highRiskCount = scores.filter((s) => s.classification === 'high_risk').length
  const withEquipment = scores.filter((s) => s.equipment.length > 0).length

  // Cidade
  const cityMap = new Map<string, { scoreSum: number; riskSum: number; count: number }>()
  scores.forEach((s) => {
    const e = cityMap.get(s.city) ?? { scoreSum: 0, riskSum: 0, count: 0 }
    e.scoreSum += s.healthScore; e.riskSum += s.churnRisk; e.count++
    cityMap.set(s.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({ city, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)), avgRisk: parseFloat((v.riskSum / v.count).toFixed(1)), count: v.count }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  // Modelo (cada cliente conta para cada modelo distinto que possui)
  const modelMap = new Map<string, { scoreSum: number; count: number }>()
  scores.forEach((s) => {
    for (const model of s.equipment) {
      const e = modelMap.get(model) ?? { scoreSum: 0, count: 0 }
      e.scoreSum += s.healthScore; e.count++
      modelMap.set(model, e)
    }
  })
  const modelBreakdown = Array.from(modelMap.entries())
    .map(([model, v]) => ({ model, count: v.count, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)) }))
    .sort((a, b) => b.count - a.count).slice(0, 12)

  // ── Qualidade do enlace ──
  // Uma distribuição por indicador, na ordem em que os índices foram
  // configurados (assim "Boa → No limite" sai em ordem de gravidade, não por
  // frequência). Só entram clientes COM leitura.
  const distOf = (key: ConnectionIndicatorKey, keyOf: (s: ConnectionEngineScore) => string) => {
    const ind = config.indicators[key]
    const acc = new Map<string, { count: number; scoreSum: number }>()
    scores.forEach((s) => {
      const k = keyOf(s)
      if (!k) return
      const e = acc.get(k) ?? { count: 0, scoreSum: 0 }
      e.count++; e.scoreSum += s.healthScore
      acc.set(k, e)
    })
    return (ind?.indices ?? [])
      .filter((i) => acc.has(i.key))
      .map((i) => {
        const v = acc.get(i.key)!
        return { key: i.key, label: i.label, count: v.count, avgScore: parseFloat((v.scoreSum / v.count).toFixed(1)) }
      })
  }

  const withLink = scores.filter((s) => s.rxPower != null).length
  const rxSum = scores.reduce((a, s) => a + (s.rxPower ?? 0), 0)
  // Wi-Fi tem denominador PRÓPRIO: só ~20% dos CPEs reportam RSSI, então a
  // média sobre o total da aba diria que o Wi-Fi da base é ótimo.
  const withWifiRssi = scores.filter((s) => s.wifiRssi != null).length
  const rssiSum = scores.reduce((a, s) => a + (s.wifiRssi ?? 0), 0)

  return {
    scores,
    avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
    avgChurnRisk: parseFloat(avgChurnRisk.toFixed(1)),
    totalRevenueRisk,
    criticalCount,
    highRiskCount,
    withEquipment,
    indicatorSummary: buildIndicatorSummary(config),
    cityBreakdown,
    modelBreakdown,
    withLink,
    avgRxPower: withLink ? parseFloat((rxSum / withLink).toFixed(2)) : null,
    poorSignalCount: scores.filter((s) => s.rxPower != null && s.rxPower < -26).length,
    cappedLanCount: scores.filter((s) => s.lanMbps != null && s.lanMbps > 0 && s.lanMbps < 1000).length,
    legacyWifiCount: scores.filter((s) => s.wifiGen === 'n').length,
    rxPowerBreakdown: distOf('opticalPower', (s) => (s.rxPower != null ? bucketByMax(Math.abs(s.rxPower), RX_POWER_RANGES).key : '')),
    lanSpeedBreakdown: distOf('lanSpeed', (s) => (s.lanMbps !== null ? lanKeyOf(s.lanMbps) : '')),
    wifiGenBreakdown: distOf('wifiGeneration', (s) => s.wifiGen),
    withWifiRssi,
    avgWifiRssi: withWifiRssi ? parseFloat((rssiSum / withWifiRssi).toFixed(1)) : null,
    poorWifiCount: scores.filter((s) => s.wifiRssi != null && s.wifiRssi < -72).length,
    wifiRssiBreakdown: distOf('wifiRssi', (s) => (s.wifiRssi != null ? bucketByMax(Math.abs(s.wifiRssi), WIFI_RSSI_RANGES).key : '')),
  }
}
