// Poda dos configs enviados ao backend (/api/dashboard e /api/engine).
//
// Os indicadores dinâmicos (vendedor, bairro, valor, técnicos, modelos…) trazem
// um índice por valor distinto da base — a esmagadora maioria com points === 0.
// O scoring do servidor sempre resolve um índice ausente como 0 (usa
// `indices.find(...)?.points`), então remover os índices zerados é NEUTRO no
// resultado e derruba o corpo do POST de MBs para poucos KB na base completa.
//
// IMPORTANTE: retorna uma CÓPIA — nunca muta o config do store (a UI renderiza
// a lista completa de índices).

interface IndexEntry { key: string; label?: string; points: number }
interface Indicator { indices?: IndexEntry[]; [k: string]: unknown }
interface EngineConfig { indicators: Record<string, Indicator> }

// Poda um único config de engine (mantém índices com points ≠ 0).
export function pruneEngineConfig<T>(config: T): T {
  const c = config as unknown as EngineConfig
  if (!c || typeof c !== 'object' || !c.indicators) return config
  const indicators: Record<string, Indicator> = {}
  for (const [k, ind] of Object.entries(c.indicators)) {
    indicators[k] = Array.isArray(ind?.indices)
      ? { ...ind, indices: ind.indices.filter((i) => i && i.points !== 0) }
      : ind
  }
  return { ...c, indicators } as unknown as T
}

// Poda um mapa { engineKey -> config } (payload do /api/dashboard).
export function pruneEngineConfigs(configs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(configs)) out[k] = pruneEngineConfig(v)
  return out
}
