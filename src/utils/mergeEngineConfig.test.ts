// ─────────────────────────────────────────────────────────────────────────
// Config salva não pode apagar indicador quando a forma muda no código.
//
// O caso real: o Financeiro passou de "presença" (um `points`) para "faixa"
// (`indices`). Toda config gravada antes disso — o localStorage de cada
// usuário e o official-config.json do volume — continuou sem `indices`. Como o
// merge trocava o indicador INTEIRO pelo salvo, a engine procurava a faixa,
// não achava, e o indicador sumia da tela pontuando zero. Sem erro nenhum.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { mergeEngineConfig } from './mergeEngineConfig'
import { DEFAULT_FINANCIAL_CONFIG } from '@/features/financial-engine/financialConfig'
import { buildEngineScores } from '@/features/financial-engine/financialEngine'
import type { RealClient } from '@/types'

// Como a config do Financeiro era gravada ANTES das faixas.
const CONFIG_ANTIGA = {
  indicators: {
    overdueBills: { key: 'overdueBills', label: 'Faturas Atrasadas', description: '', mode: 'manual', points: -25, query: '' },
    trustReleases: { key: 'trustReleases', label: 'Liberações por Confiança', description: '', mode: 'manual', points: -15, query: '' },
    renegotiations: { key: 'renegotiations', label: 'Renegociações', description: '', mode: 'manual', points: -20, query: '' },
    onTimePayments: { key: 'onTimePayments', label: 'Faturas pagas no prazo', description: '', mode: 'manual', points: 8, query: '' },
    paymentMethod: {
      key: 'paymentMethod', label: 'Forma de Pagamento', description: '', mode: 'manual', points: 0, query: '',
      indices: [
        { key: 'PF - MENSAL - E-MAIL', label: 'PF - MENSAL - E-MAIL', points: -7 },
        { key: 'Sebratel - Contrato Corporativo', label: 'Sebratel - Contrato Corporativo', points: -3 },
      ],
    },
  },
} as never

describe('mergeEngineConfig', () => {
  const merged = mergeEngineConfig(DEFAULT_FINANCIAL_CONFIG, CONFIG_ANTIGA)

  it('a config antiga NÃO apaga as faixas novas', () => {
    for (const chave of ['overdueBills', 'trustReleases', 'renegotiations', 'onTimePayments'] as const) {
      const ind = merged.indicators[chave]
      expect(ind.indices, `${chave} ficou sem faixas`).toBeDefined()
      expect(ind.indices!.length, `${chave} com faixas vazias`).toBeGreaterThan(0)
    }
  })

  it('REGRESSÃO: com config antiga, os indicadores continuam pontuando', () => {
    // Era isto que sumia da tela.
    const c = {
      clientId: 'X', contractNumber: 'X', name: 'X', city: '', neighborhood: '', plan: '',
      monthlyValue: 100, paymentForm: 'PF - MENSAL - E-MAIL',
      onTimeInvoices: 0, lateInvoices: 0, overdueInvoices: 0, totalInvoices: 0,
      renegotiations: 2, trustReleases: 0, equipment: [], onuStatusCounts: {},
      finWorstLateDays: 45, finWorstLateKey: 'd45',
      finOnTimeKey: 'antes', finRenegKey: 'rc:rc2', finTrustKey: 'nunca',
    } as unknown as RealClient

    const [s] = buildEngineScores([c], merged)
    const atraso = s.indicators.find((i) => i.key === 'overdueBills')!
    const reneg = s.indicators.find((i) => i.key === 'renegotiations')!

    expect(atraso.points, 'faixa de atraso não pontuou').toBe(-50)
    expect(reneg.points, 'recorrência não pontuou').toBe(-40)
    expect(s.classification).toBe('critical')
  })

  it('a nota ajustada no salvo sobrevive', () => {
    const pm = merged.indicators.paymentMethod.indices!
    expect(pm.find((i) => i.key === 'PF - MENSAL - E-MAIL')!.points).toBe(-7)
  })

  it('o rótulo e a descrição vêm do CÓDIGO, não do salvo', () => {
    // O salvo tem descrição vazia; a do código explica a regra nova.
    expect(merged.indicators.overdueBills.description).not.toBe('')
    expect(merged.indicators.overdueBills.description).toBe(
      DEFAULT_FINANCIAL_CONFIG.indicators.overdueBills.description,
    )
  })

  it('índice que só existe no salvo é preservado', () => {
    // Formas de pagamento vêm do banco, não do código: descartá-las apagaria
    // notas que alguém ajustou nas 16 formas fora da planilha.
    const pm = merged.indicators.paymentMethod.indices!
    const extra = pm.find((i) => i.key === 'Sebratel - Contrato Corporativo')
    expect(extra, 'forma dinâmica sumiu').toBeDefined()
    expect(extra!.points).toBe(-3)
  })

  it('sem nada salvo, devolve o default intacto', () => {
    expect(mergeEngineConfig(DEFAULT_FINANCIAL_CONFIG, null)).toBe(DEFAULT_FINANCIAL_CONFIG)
    expect(mergeEngineConfig(DEFAULT_FINANCIAL_CONFIG, undefined)).toBe(DEFAULT_FINANCIAL_CONFIG)
  })
})
