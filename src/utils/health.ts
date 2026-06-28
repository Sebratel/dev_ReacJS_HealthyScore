import type { HealthClassification } from '@/types'

export interface HealthThresholds {
  excellent: number
  healthy: number
  attention: number
  high_risk: number
}

// Limiares padrão de health score. Regra de negócio: abaixo de `high_risk`
// (60) o cliente já é considerado CRÍTICO. Editável no sistema em /configuracoes.
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  excellent: 91,
  healthy: 81,
  attention: 71,
  high_risk: 60,
}

// Espelho "vivo" dos limiares, mantido em sincronia com o useAppStore (a fonte
// de verdade persistida). Existe para que scoreToHealthClass continue sendo uma
// função simples — usada em engines, gráficos e gauges — sem precisar receber os
// limiares como argumento em cada chamada. Atualizado por applyHealthThresholds.
let active: HealthThresholds = { ...DEFAULT_HEALTH_THRESHOLDS }

export function applyHealthThresholds(t: HealthThresholds) {
  active = t
}

export function getHealthThresholds(): HealthThresholds {
  return active
}

export function scoreToHealthClass(v: number, t: HealthThresholds = active): HealthClassification {
  if (v >= t.excellent) return 'excellent'
  if (v >= t.healthy) return 'healthy'
  if (v >= t.attention) return 'attention'
  if (v >= t.high_risk) return 'high_risk'
  return 'critical'
}
