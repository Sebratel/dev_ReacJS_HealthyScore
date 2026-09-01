import { useMemo } from 'react'
import { readChartTokens, type ChartTokens } from '@/utils/chartTokens'
import { useThemeMode } from './useThemeMode'

/** Cores de gráfico do tema ativo, recalculadas quando o tema alterna. */
export function useChartTokens(): ChartTokens {
  const mode = useThemeMode()
  return useMemo(() => readChartTokens(), [mode])
}
