import type { HealthClassification } from '@/types'

export type HealthPalette = Record<HealthClassification, string>

/**
 * Paleta das faixas de health resolvida a partir dos tokens CSS.
 *
 * É uma FUNÇÃO (e não um objeto constante) porque os valores mudam com o tema:
 * os tons do claro perdem contraste sobre as superfícies escuras. SVG e Recharts
 * recebem cor por atributo de apresentação, onde `var(--x)` não é resolvido pelo
 * navegador — por isso precisamos do valor concreto.
 *
 * Fonte de verdade dos valores: `styles/globals.css`.
 */
const VAR_BY_CLASS: Record<HealthClassification, string> = {
  critical: '--color-risk-critical',
  high_risk: '--color-risk-high',
  attention: '--color-risk-medium',
  healthy: '--color-risk-low',
  excellent: '--color-health-excellent',
}

export function readHealthColors(): HealthPalette {
  const styles = getComputedStyle(document.documentElement)
  const palette = {} as HealthPalette
  for (const [cls, varName] of Object.entries(VAR_BY_CLASS) as [HealthClassification, string][]) {
    const triplet = styles.getPropertyValue(varName).trim()
    palette[cls] = triplet ? `rgb(${triplet})` : 'currentColor'
  }
  return palette
}

/** Versão translúcida de uma cor da paleta — substitui a concatenação `${hex}15`. */
export function softenColor(color: string, alpha: number): string {
  const triplet = color.match(/^rgb\(([^)]+)\)$/)?.[1]
  return triplet ? `rgb(${triplet} / ${alpha})` : color
}

export const HEALTH_LABELS: Record<HealthClassification, string> = {
  critical: 'Crítico',
  high_risk: 'Alto Risco',
  attention: 'Atenção',
  healthy: 'Saudável',
  excellent: 'Excelente',
}
