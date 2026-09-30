// ─────────────────────────────────────────────────────────────────────────
// Faixas do Financeiro — a tabela da planilha "Ajustes no Health Score".
//
// Trava os cortes porque eles vieram de fora: se alguém mexer num `maxDias`
// sem mexer na planilha, o score passa a dizer outra coisa que o Financeiro
// nunca aprovou. Um teste que falha aqui é uma conversa, não um bug.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { lateKeyOf, buildEngineScores } from './financialEngine'
import {
  DEFAULT_FINANCIAL_CONFIG, LATE_RANGES, PAYMENT_METHOD_INDICES,
} from './financialConfig'
import type { RealClient } from '@/types'

const contrato = (over: Partial<RealClient> = {}): RealClient => ({
  clientId: 'C1', personId: '1', name: 'Contrato', clientGender: '(sem gênero)', clientBirth: null,
  seller: '(sem vendedor)', sellerGender: '(sem gênero)', sellerBirth: null, sellerAdmitted: null,
  contractNumber: 'C1', contractDate: '2024-01-01', cancellationDate: null,
  plan: 'Plano', monthlyValue: 100, paymentForm: 'PF - MENSAL - E-MAIL',
  city: 'Cidade', neighborhood: 'Bairro',
  onTimeInvoices: 0, lateInvoices: 0, overdueInvoices: 0, totalInvoices: 0,
  renegotiations: 0, trustReleases: 0, equipment: [], onuStatusCounts: {},
  protocolCount: 0, scheduleCount: 0, slaLateCount: 0, avgSlaDays: 0, reasons: [], technicians: [],
  installProtocols: 0, installScheduleCount: 0, installSlaLateCount: 0, installAvgSlaDays: 0,
  installSaleToScheduleDays: 0, installTechnicians: [],
  relProtocolCount: 0, relRecurrenceDays: 0, relAvgOverageHours: 0, relCancelThreats: 0,
  relTypes: [], relAttendants: [],
  netSite: '', netConcentrator: '', netAccessPoint: '', netSplitter: '', netSplitterCode: '',
  netSlot: '', netPon: '', netMassiveCount: 0, netAvgOfflineMin: 0, netAvgOverageMin: 0,
  ...over,
} as RealClient)

describe('lateKeyOf — dias de atraso na faixa certa', () => {
  it('sem atraso não tem faixa', () => {
    expect(lateKeyOf(null)).toBeNull()
    expect(lateKeyOf(undefined)).toBeNull()
    expect(lateKeyOf(0)).toBeNull()
    expect(lateKeyOf(-3)).toBeNull() // pagou adiantado
  })

  it('cada corte da planilha cai onde deve', () => {
    expect(lateKeyOf(1)).toBe('d5')
    expect(lateKeyOf(5)).toBe('d5')
    expect(lateKeyOf(6)).toBe('d8')
    expect(lateKeyOf(8)).toBe('d8')
    expect(lateKeyOf(9)).toBe('d15')
    expect(lateKeyOf(15)).toBe('d15')
    expect(lateKeyOf(16)).toBe('d20')
    expect(lateKeyOf(20)).toBe('d20')
    expect(lateKeyOf(21)).toBe('d30')
    expect(lateKeyOf(30)).toBe('d30')
    expect(lateKeyOf(31)).toBe('d45')
    expect(lateKeyOf(45)).toBe('d45')
    expect(lateKeyOf(46)).toBe('d45p')
    expect(lateKeyOf(400)).toBe('d45p')
  })

  it('as faixas não deixam buraco nem se sobrepõem', () => {
    // Todo dia de 1 a 60 cai em exatamente uma faixa conhecida.
    const chaves = new Set(LATE_RANGES.map((r) => r.key))
    for (let d = 1; d <= 60; d++) {
      const k = lateKeyOf(d)
      expect(k, `dia ${d} sem faixa`).not.toBeNull()
      expect(chaves.has(k!), `dia ${d} caiu em faixa desconhecida: ${k}`).toBe(true)
    }
  })

  it('a punição nunca afrouxa quando o atraso aumenta', () => {
    const pontos = (d: number) =>
      LATE_RANGES.find((r) => r.key === lateKeyOf(d))!.defaultPoints
    for (let d = 2; d <= 60; d++) {
      expect(pontos(d), `dia ${d} pontua melhor que ${d - 1}`).toBeLessThanOrEqual(pontos(d - 1))
    }
  })
})

describe('pontuação por faixa', () => {
  const pontosDe = (c: RealClient, chave: string) =>
    buildEngineScores([c], DEFAULT_FINANCIAL_CONFIG)[0].indicators.find((i) => i.key === chave)!.points

  it('o atraso pontua pela faixa, não pela quantidade de faturas', () => {
    // Uma fatura com 40 dias de atraso pesa mais que dez com 3 dias.
    const grave = contrato({ finWorstLateDays: 40, finWorstLateKey: lateKeyOf(40), lateInvoices: 1 })
    const leve = contrato({ finWorstLateDays: 3, finWorstLateKey: lateKeyOf(3), lateInvoices: 10 })
    expect(pontosDe(grave, 'overdueBills')).toBeLessThan(pontosDe(leve, 'overdueBills'))
    expect(pontosDe(grave, 'overdueBills')).toBe(-50)
    expect(pontosDe(leve, 'overdueBills')).toBe(-20)
  })

  it('sem leitura de atraso não pontua — ausência de dado não é bom pagamento', () => {
    const semDado = contrato({ finWorstLateDays: null, finWorstLateKey: null })
    expect(pontosDe(semDado, 'overdueBills')).toBe(0)
  })

  it('pagar antes do vencimento vale mais que pagar no dia', () => {
    const antes = contrato({ finOnTimeKey: 'antes', finPaidBefore: 10, finPaidOnDay: 1 })
    const noDia = contrato({ finOnTimeKey: 'no_dia', finPaidBefore: 1, finPaidOnDay: 10 })
    expect(pontosDe(antes, 'onTimePayments')).toBe(50)
    expect(pontosDe(noDia, 'onTimePayments')).toBe(40)
  })

  it('as cinco formas de pagamento da planilha pontuam como pedido', () => {
    for (const [chave, , esperado] of PAYMENT_METHOD_INDICES) {
      const c = contrato({ paymentForm: chave })
      expect(pontosDe(c, 'paymentMethod'), `forma ${chave}`).toBe(esperado)
    }
  })

  it('forma de pagamento fora da planilha fica em zero, não em negativo', () => {
    // 16 formas (Rede Brasil, Telefonia, Cortesia…) não foram decididas.
    // Zero é "não pontua", e é diferente de um palpite.
    const c = contrato({ paymentForm: 'Sebratel - Contrato Corporativo' })
    expect(pontosDe(c, 'paymentMethod')).toBe(0)
  })
})
