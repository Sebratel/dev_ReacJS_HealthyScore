/**
 * Ponte entre os tokens CSS e as bibliotecas que recebem COR POR PROP
 * (Recharts, SVG inline). Fonte de verdade continua sendo `styles/globals.css`
 * — aqui só lemos as variáveis já resolvidas para o tema ativo, em vez de
 * repetir os hex espalhados pelas telas.
 */
export type ChartTokens = {
  axis: string
  axisStrong: string
  grid: string
  track: string
  riskLow: string
  riskMedium: string
  riskHigh: string
  riskCritical: string
  healthExcellent: string
  primary: string
  secondary: string
  onSurface: string
  onSurfaceVariant: string
  surface: string
  surfaceCard: string
  /** Rampa categórica (identidade sem ordem). Use `categorical[i % length]`. */
  categorical: string[]
}

const CATEGORICAL_SLOTS = 8

function read(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Tokens declarados como triplet RGB viram `rgb(r g b)`, utilizável em SVG. */
function readRgb(name: string): string {
  const triplet = read(name)
  return triplet ? `rgb(${triplet})` : 'transparent'
}

export function readChartTokens(): ChartTokens {
  return {
    axis: read('--chart-axis'),
    axisStrong: read('--chart-axis-strong'),
    grid: read('--chart-grid'),
    track: read('--chart-track'),
    riskLow: readRgb('--color-risk-low'),
    riskMedium: readRgb('--color-risk-medium'),
    riskHigh: readRgb('--color-risk-high'),
    riskCritical: readRgb('--color-risk-critical'),
    healthExcellent: readRgb('--color-health-excellent'),
    primary: readRgb('--color-primary'),
    secondary: readRgb('--color-secondary'),
    onSurface: readRgb('--color-on-surface'),
    onSurfaceVariant: readRgb('--color-on-surface-variant'),
    surface: readRgb('--color-surface'),
    surfaceCard: readRgb('--color-surface-container-lowest'),
    categorical: Array.from({ length: CATEGORICAL_SLOTS }, (_, i) => readRgb(`--color-data-${i + 1}`)),
  }
}
