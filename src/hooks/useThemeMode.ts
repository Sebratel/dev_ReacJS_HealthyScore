import { useEffect, useState } from 'react'
import type { ThemeMode } from '@/utils/theme'

/**
 * Tema atual observando a classe `dark` no <html>.
 *
 * Necessário porque componentes que passam COR POR PROP (Recharts, SVG inline)
 * não são alcançados por classe do Tailwind e precisam reagir ao tema em runtime.
 */
export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setMode(root.classList.contains('dark') ? 'dark' : 'light')
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return mode
}
