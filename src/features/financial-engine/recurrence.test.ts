// ─────────────────────────────────────────────────────────────────────────
// A regra que o Financeiro definiu: recorrente é MÊS CONSECUTIVO.
//
// O caso que motivou tudo: a planilha traz "4 renegociações em 12 meses" como
// eventual (−25) E como recorrente (−50). Contagem e janela são idênticas —
// só o padrão separa, e é ele que estes testes travam.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { classifyRecurrence, recurrenceKeyOf, rungOf } from './recurrence'
import {
  TRUST_EVENTUAL, TRUST_RECORRENTE, RENEG_EVENTUAL, RENEG_RECORRENTE,
} from './financialConfig'

const RENEG = { eventual: RENEG_EVENTUAL, recorrente: RENEG_RECORRENTE }
const TRUST = { eventual: TRUST_EVENTUAL, recorrente: TRUST_RECORRENTE }

describe('classifyRecurrence', () => {
  it('sem evento nenhum é "nunca", não eventual de zero', () => {
    expect(classifyRecurrence([]).kind).toBe('nunca')
    expect(classifyRecurrence(null).kind).toBe('nunca')
    expect(classifyRecurrence(undefined).kind).toBe('nunca')
  })

  it('meses espalhados são eventuais, por mais que sejam', () => {
    // 4 eventos ao longo de um ano, nunca em meses seguidos.
    const r = classifyRecurrence(['2026-01', '2026-04', '2026-07', '2026-10'])
    expect(r.kind).toBe('eventual')
    expect(r.meses).toBe(4)
    expect(r.maiorSequencia).toBe(1)
  })

  it('dois meses seguidos já é recorrente', () => {
    const r = classifyRecurrence(['2026-03', '2026-04'])
    expect(r.kind).toBe('recorrente')
    expect(r.maiorSequencia).toBe(2)
  })

  it('a virada do ano conta como consecutiva', () => {
    // Dezembro → janeiro é mês seguinte; comparar só o número do mês diria 12 → 1.
    const r = classifyRecurrence(['2025-12', '2026-01'])
    expect(r.kind).toBe('recorrente')
    expect(r.maiorSequencia).toBe(2)
  })

  it('pula um mês e volta: não é consecutivo', () => {
    const r = classifyRecurrence(['2026-01', '2026-03'])
    expect(r.kind).toBe('eventual')
  })

  it('repetição no MESMO mês não cria recorrência', () => {
    // Três desbloqueios na mesma semana são um aperto só.
    const r = classifyRecurrence(['2026-05', '2026-05', '2026-05'])
    expect(r.kind).toBe('eventual')
    expect(r.meses).toBe(1)
  })

  it('ordem de entrada não importa', () => {
    const a = classifyRecurrence(['2026-07', '2026-03', '2026-04'])
    expect(a.kind).toBe('recorrente')
    expect(a.meses).toBe(3)
  })

  it('acha a maior sequência, não a primeira', () => {
    // 01 sozinho, depois 05-06-07 seguidos.
    const r = classifyRecurrence(['2026-01', '2026-05', '2026-06', '2026-07'])
    expect(r.maiorSequencia).toBe(3)
  })
})

describe('o caso que a planilha não resolvia sozinha', () => {
  it('4 meses espalhados e 4 meses seguidos dão notas MUITO diferentes', () => {
    const espalhado = recurrenceKeyOf(['2026-01', '2026-04', '2026-07', '2026-10'], RENEG)
    const seguido = recurrenceKeyOf(['2026-01', '2026-02', '2026-03', '2026-04'], RENEG)

    expect(espalhado.kind).toBe('eventual')
    expect(seguido.kind).toBe('recorrente')

    const pts = (k: string | null, kind: string) =>
      (kind === 'recorrente' ? RENEG_RECORRENTE : RENEG_EVENTUAL)
        .find((d) => `${kind === 'recorrente' ? 'rc' : 'ev'}:${d.key}` === k)!.defaultPoints

    expect(pts(espalhado.key, 'eventual')).toBe(-25)
    expect(pts(seguido.key, 'recorrente')).toBe(-50)
  })

  it('o exemplo do Financeiro: 2 renegociações, espalhadas × seguidas', () => {
    const espalhado = recurrenceKeyOf(['2026-02', '2026-06'], RENEG)
    const seguido = recurrenceKeyOf(['2026-02', '2026-03'], RENEG)
    expect(espalhado.key).toBe('ev:ev2')   // −15
    expect(seguido.key).toBe('rc:rc2')     // −40
  })
})

describe('escadas', () => {
  it('nunca usou não entra em escada nenhuma', () => {
    const r = recurrenceKeyOf([], TRUST)
    expect(r.key).toBe('nunca')
  })

  it('o degrau sobe com os meses e nunca afrouxa', () => {
    for (const escada of [TRUST_EVENTUAL, TRUST_RECORRENTE, RENEG_EVENTUAL, RENEG_RECORRENTE]) {
      for (let m = 2; m <= 20; m++) {
        expect(
          rungOf(escada, m).defaultPoints,
          `mês ${m} pontua melhor que ${m - 1}`,
        ).toBeLessThanOrEqual(rungOf(escada, m - 1).defaultPoints)
      }
    }
  })

  it('recorrente é sempre pior que eventual com os mesmos meses', () => {
    for (let m = 2; m <= 15; m++) {
      expect(rungOf(RENEG_RECORRENTE, m).defaultPoints)
        .toBeLessThan(rungOf(RENEG_EVENTUAL, m).defaultPoints)
      expect(rungOf(TRUST_RECORRENTE, m).defaultPoints)
        .toBeLessThan(rungOf(TRUST_EVENTUAL, m).defaultPoints)
    }
  })
})
