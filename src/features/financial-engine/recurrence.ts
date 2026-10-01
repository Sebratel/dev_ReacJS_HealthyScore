// ─────────────────────────────────────────────────────────────────────────
// Recorrência financeira — "eventual" × "recorrente".
//
// A regra, definida pelo Financeiro: **recorrente é mês consecutivo**. Dois
// desbloqueios espalhados no ano são um cliente que teve dois apertos; dois em
// meses seguidos são um cliente que entrou num ciclo. A planilha pune o segundo
// caso muito mais (−40 contra −15, na renegociação) e é essa a diferença.
//
// O que NÃO distingue os dois: contagem e janela. A planilha traz
// "4 renegociações em 12 meses" como eventual (−25) E como recorrente (−50) —
// mesma contagem, mesma janela. Só o padrão separa.
//
// A escada é escolhida por MESES DISTINTOS com evento, não por número de
// eventos: três desbloqueios no mesmo mês são um aperto só, e contá-los como
// três puniria o cliente por ter ligado três vezes na mesma semana.
// ─────────────────────────────────────────────────────────────────────────

export type RecurrenceKind = 'nunca' | 'eventual' | 'recorrente'

export interface RecurrenceResult {
  kind: RecurrenceKind
  /** Meses distintos (YYYY-MM) em que houve pelo menos um evento. */
  meses: number
  /** Maior sequência de meses consecutivos com evento. 1 = nunca repetiu. */
  maiorSequencia: number
  /** Chave da faixa, para casar com os índices da config. */
  key: string | null
}

/** 'YYYY-MM' → índice absoluto de mês, para saber quem é vizinho de quem. */
function mesIndex(ym: string): number {
  const [a, m] = ym.split('-').map(Number)
  return a * 12 + (m - 1)
}

/**
 * Classifica a recorrência a partir dos meses em que houve evento.
 *
 * @param mesesComEvento lista de 'YYYY-MM' (pode vir repetida e fora de ordem)
 */
export function classifyRecurrence(mesesComEvento: string[] | null | undefined): RecurrenceResult {
  const unicos = Array.from(new Set((mesesComEvento ?? []).filter(Boolean))).sort()
  if (!unicos.length) return { kind: 'nunca', meses: 0, maiorSequencia: 0, key: 'nunca' }

  // Maior corrida de meses consecutivos.
  let maior = 1
  let atual = 1
  for (let i = 1; i < unicos.length; i++) {
    atual = mesIndex(unicos[i]) - mesIndex(unicos[i - 1]) === 1 ? atual + 1 : 1
    if (atual > maior) maior = atual
  }

  return {
    kind: maior >= 2 ? 'recorrente' : 'eventual',
    meses: unicos.length,
    maiorSequencia: maior,
    key: null, // preenchido por quem conhece a escada (ver abaixo)
  }
}

/** Degrau da escada: o primeiro cujo teto cobre `meses`. */
export interface Degrau { key: string; label: string; ateMeses: number; defaultPoints: number }

export function rungOf(degraus: Degrau[], meses: number): Degrau {
  return degraus.find((d) => meses <= d.ateMeses) ?? degraus[degraus.length - 1]
}

/**
 * Classifica e já devolve a chave da faixa, dadas as duas escadas.
 * `nunca` tem chave própria: não ter usado é um fato, não o degrau zero de uma
 * escada de punição — e a planilha dá +50 para ele.
 */
export function recurrenceKeyOf(
  mesesComEvento: string[] | null | undefined,
  escadas: { eventual: Degrau[]; recorrente: Degrau[] },
): RecurrenceResult {
  const r = classifyRecurrence(mesesComEvento)
  if (r.kind === 'nunca') return r
  // A chave sai PREFIXADA ('ev:' / 'rc:') porque é ela que casa com o índice da
  // config. As duas escadas têm degraus de mesmo nome (rc3 e ev3 existem nas
  // duas), então sem o prefixo um eventual poderia pegar a nota de um recorrente.
  const recorrente = r.kind === 'recorrente'
  const escada = recorrente ? escadas.recorrente : escadas.eventual
  return { ...r, key: `${recorrente ? 'rc' : 'ev'}:${rungOf(escada, r.meses).key}` }
}
