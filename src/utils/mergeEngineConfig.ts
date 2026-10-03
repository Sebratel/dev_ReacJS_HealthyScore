// ─────────────────────────────────────────────────────────────────────────
// Mescla a config SALVA sobre o DEFAULT do código.
//
// Existe por causa de um erro real: a config salva substituía o indicador
// INTEIRO. Quando o Financeiro passou a pontuar por faixa, toda config gravada
// antes disso (localStorage de cada usuário e o official-config.json do
// volume) continuou sem `indices` — a engine procurava a faixa, não achava, e
// os indicadores sumiam da tela pontuando zero.
//
// A regra: a ESTRUTURA é sempre do código (quais índices existem, rótulo,
// descrição, query); do salvo vêm só os VALORES que alguém ajustou. Assim,
// mudar a forma de um indicador no código nunca mais depende de ninguém
// limpar cache ou resetar a config oficial.
// ─────────────────────────────────────────────────────────────────────────

interface Index { key: string; label: string; points: number }
// Propositalmente frouxo: cada engine tem o seu tipo de indicador (chaves e
// modos diferentes), e o merge só precisa de `mode`, `points` e `indices`.
// Amarrar mais faria cada engine precisar de um merge próprio.
type Indicator = { mode?: unknown; points?: number; indices?: Index[] }
interface EngineConfig { indicators: Record<string, unknown> }

/**
 * Índices do default com as notas do salvo por cima.
 *
 * Índice que só existe no salvo é PRESERVADO no fim: é o caso das listas
 * dinâmicas (formas de pagamento, cidades, modelos de equipamento), que vêm do
 * banco e não do código — descartá-las apagaria notas que alguém ajustou.
 */
function mergeIndices(def: Index[], saved?: Index[]): Index[] {
  const porChave = new Map((saved ?? []).map((i) => [i.key, i]))
  const base = def.map((i) => {
    const s = porChave.get(i.key)
    return s ? { ...i, points: s.points } : i
  })
  const soNoSalvo = (saved ?? []).filter((s) => !def.some((d) => d.key === s.key))
  return [...base, ...soNoSalvo]
}

export function mergeEngineConfig<T extends EngineConfig>(def: T, saved?: Partial<T> | null): T {
  if (!saved?.indicators) return def
  const indicators: Record<string, unknown> = { ...def.indicators }

  for (const chave of Object.keys(def.indicators)) {
    const d = def.indicators[chave] as Indicator
    const s = (saved.indicators as Record<string, unknown>)[chave] as Indicator | undefined
    if (!s) continue

    const temFaixas = Array.isArray(d.indices)
    indicators[chave] = {
      ...d,
      mode: s.mode ?? d.mode,
      // Indicador de FAIXA ignora `points` ao pontuar; manter o do salvo só
      // guardaria lixo da forma antiga. Indicador de presença usa, então o
      // valor ajustado vale.
      points: temFaixas ? d.points : (s.points ?? d.points),
      ...(temFaixas ? { indices: mergeIndices(d.indices as Index[], s.indices) } : {}),
    }
  }

  return { ...def, indicators } as T
}
