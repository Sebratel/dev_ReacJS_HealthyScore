import { useMemo } from 'react'
import { readHealthColors, type HealthPalette } from '@/utils/healthColors'
import { useThemeMode } from './useThemeMode'

/** Paleta das faixas de health do tema ativo, recalculada quando o tema alterna. */
export function useHealthColors(): HealthPalette {
  const mode = useThemeMode()
  return useMemo(() => readHealthColors(), [mode])
}
