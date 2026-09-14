export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'churniq-theme'

/** Preferência efetiva: escolha salva ou, na ausência, a do sistema operacional. */
export function getPreferredTheme(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Chamar em main.tsx ANTES do render, senão a tela pisca no tema errado. */
export function applyInitialTheme(): void {
  document.documentElement.classList.toggle('dark', getPreferredTheme() === 'dark')
}

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
  setTheme(next)
  return next
}
