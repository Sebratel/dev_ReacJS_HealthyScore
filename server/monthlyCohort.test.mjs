import { describe, it, expect } from 'vitest'
import { fimDoMes, mesesEntre, wilson95, pontoMensal, resumirSerie } from './monthlyCohort.mjs'

describe('fimDoMes', () => {
  it('pega o último dia de meses de 30, 31 e 28 dias', () => {
    expect(fimDoMes('2026-04')).toBe('2026-04-30')
    expect(fimDoMes('2026-08')).toBe('2026-08-31')
    expect(fimDoMes('2026-02')).toBe('2026-02-28')
  })
  it('acerta fevereiro de ano bissexto', () => {
    expect(fimDoMes('2024-02')).toBe('2024-02-29')
  })
  it('não escorrega para o dia anterior por fuso', () => {
    // O bug clássico: new Date(ano, mes, 0) em fuso negativo devolve o dia 30.
    for (const ym of ['2026-01', '2026-03', '2026-05', '2026-07', '2026-12']) {
      expect(fimDoMes(ym).slice(0, 7)).toBe(ym)
    }
  })
})

describe('mesesEntre', () => {
  it('inclui as duas pontas', () => {
    expect(mesesEntre('2026-03', '2026-06')).toEqual(['2026-03', '2026-04', '2026-05', '2026-06'])
  })
  it('vira o ano', () => {
    expect(mesesEntre('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
  it('mês único devolve ele mesmo', () => {
    expect(mesesEntre('2026-05', '2026-05')).toEqual(['2026-05'])
  })
})

describe('wilson95', () => {
  it('devolve null sem amostra', () => {
    expect(wilson95(0, 0)).toBeNull()
  })
  it('intervalo é largo com n pequeno e estreito com n grande', () => {
    const poucos = wilson95(5, 10)
    const muitos = wilson95(500, 1000)
    expect(poucos.high - poucos.low).toBeGreaterThan(muitos.high - muitos.low)
  })
})

// Base de 10 contratos: 2 críticos (1 sai), 2 alto risco (1 sai), 6 saudáveis
// (1 sai). Números escolhidos para as contas fecharem na mão.
const scored = [
  { contractNumber: 'C1', classification: 'critical', enginesPresent: 4 },
  { contractNumber: 'C2', classification: 'critical', enginesPresent: 4 },
  { contractNumber: 'H1', classification: 'high_risk', enginesPresent: 3 },
  { contractNumber: 'H2', classification: 'high_risk', enginesPresent: 3 },
  { contractNumber: 'S1', classification: 'healthy', enginesPresent: 2 },
  { contractNumber: 'S2', classification: 'healthy', enginesPresent: 2 },
  { contractNumber: 'S3', classification: 'healthy', enginesPresent: 2 },
  { contractNumber: 'S4', classification: 'healthy', enginesPresent: 2 },
  { contractNumber: 'S5', classification: 'healthy', enginesPresent: 2 },
  { contractNumber: 'S6', classification: 'healthy', enginesPresent: 2 },
]
const cancelDepois = new Map([
  ['C1', { mrr: 100 }],
  ['H1', { mrr: 50 }],
  ['S1', { mrr: 10 }],
])

describe('pontoMensal', () => {
  const p = pontoMensal({ mes: '2026-05', scored, cancelDepois, conexoesInicio: 9, conexoesFim: 11, janelaDesfecho: '2026-06' })

  it('conta base, saídas e MRR perdido', () => {
    expect(p.contratosAtivos).toBe(10)
    expect(p.cancelamentos).toBe(3)
    expect(p.mrrPerdido).toBe(160)
    expect(p.taxaCancelamento).toBe(30)
  })

  it('mantém conexões e contratos como denominadores separados', () => {
    expect(p.conexoesInicio).toBe(9)
    expect(p.conexoesFim).toBe(11)
    expect(p.contratosAtivos).toBe(10)
  })

  it('rotula o ponto pelo mês dos cancelamentos, não pelo da nota', () => {
    // No dia 1º de junho publica-se "o indicador de junho"? Não: publica-se o
    // de MAIO, se maio for o mês que fechou. Aqui a nota congela em 31/05 e os
    // cancelamentos observados são os de junho, então o rótulo é junho.
    expect(p.mesIndicador).toBe('2026-06')
    expect(p.notaCongeladaEm).toBe('2026-05-31')
    // A nota tem que ser anterior às saídas que ela é cobrada de prever.
    expect(p.notaCongeladaEm < `${p.mesIndicador}-01`).toBe(true)
  })

  it('recall é sobre quem saiu, não sobre a base', () => {
    // 2 dos 3 que saíram estavam sinalizados (C1 e H1).
    expect(p.recall).toBeCloseTo(66.7, 1)
  })

  it('lift compara a cobertura com o tamanho do balde', () => {
    // Balde de alerta = 4 de 10 = 40%. Recall 66,7% → lift 1,67.
    expect(p.taxaSinalizada).toBe(40)
    expect(p.lift).toBeCloseTo(1.67, 2)
  })

  it('taxa por classificação usa a base daquela faixa como denominador', () => {
    const crit = p.porClassificacao.find((x) => x.classificacao === 'critical')
    expect(crit.naBase).toBe(2)
    expect(crit.cancelaram).toBe(1)
    expect(crit.taxa).toBe(50)
    const saud = p.porClassificacao.find((x) => x.classificacao === 'healthy')
    expect(saud.taxa).toBeCloseTo(16.67, 2)
  })

  it('lista todas as classes, mesmo as vazias', () => {
    expect(p.porClassificacao).toHaveLength(5)
    const exc = p.porClassificacao.find((x) => x.classificacao === 'excellent')
    expect(exc.naBase).toBe(0)
    expect(exc.taxa).toBeNull()
  })

  it('mês sem nenhuma saída não quebra e não inventa taxa', () => {
    const vazio = pontoMensal({ mes: '2026-05', scored, cancelDepois: new Map(), conexoes: null, janelaDesfecho: '2026-06' })
    expect(vazio.cancelamentos).toBe(0)
    expect(vazio.taxaCancelamento).toBe(0)
    expect(vazio.recall).toBeNull()
    expect(vazio.lift).toBeNull()
  })

  it('exclui quem tem sinal de menos e conta a exclusão à parte', () => {
    // Dois contratos pontuados só pela comercial: não entram nas taxas, mas
    // aparecem em semSinalSuficiente — e a saída de um deles é registrada,
    // senão a cobertura do score pareceria melhor do que é.
    const comFracos = [
      ...scored,
      { contractNumber: 'F1', classification: 'excellent', enginesPresent: 1 },
      { contractNumber: 'F2', classification: 'excellent', enginesPresent: 1 },
    ]
    const cancel = new Map([...cancelDepois, ['F1', { mrr: 20 }]])
    const p = pontoMensal({ mes: '2026-05', scored: comFracos, cancelDepois: cancel, janelaDesfecho: '2026-06' })

    expect(p.contratosAtivos).toBe(10)
    expect(p.semSinalSuficiente).toBe(2)
    expect(p.cancelamentosSemSinal).toBe(1)
    // A saída do F1 não entra nas taxas nem infla a base saudável.
    expect(p.cancelamentos).toBe(3)
    const exc = p.porClassificacao.find((x) => x.classificacao === 'excellent')
    expect(exc.naBase).toBe(0)
  })

  it('minEngines configurável muda quem entra', () => {
    const p = pontoMensal({ mes: '2026-05', scored, cancelDepois, janelaDesfecho: '2026-06', minEngines: 4 })
    // Só C1 e C2 têm 4 engines.
    expect(p.contratosAtivos).toBe(2)
    expect(p.semSinalSuficiente).toBe(8)
    expect(p.minEngines).toBe(4)
  })

  it('decis ordenam do pior para o melhor e são imunes à deriva de limiar', () => {
    // 100 contratos com nota de 1 a 100. Quem sai são as 10 piores notas.
    // Se o decil estiver certo, o decil 1 pega tudo e o 10 não pega nada —
    // independente de onde os limiares absolutos estejam.
    const cem = Array.from({ length: 100 }, (_, i) => ({
      contractNumber: `D${i}`, overall: i + 1,
      classification: i < 50 ? 'critical' : 'excellent', enginesPresent: 3,
    }))
    const saem = new Map(Array.from({ length: 10 }, (_, i) => [`D${i}`, { mrr: 0 }]))
    const p = pontoMensal({ mes: '2026-05', scored: cem, cancelDepois: saem, janelaDesfecho: '2026-06' })

    expect(p.porDecil).toHaveLength(10)
    expect(p.porDecil[0].decil).toBe(1)
    expect(p.porDecil[0].n).toBe(10)
    expect(p.porDecil[0].taxa).toBe(100)
    expect(p.porDecil[9].taxa).toBe(0)
    // Taxa geral 10%, decil 1 em 100% → 10x.
    expect(p.liftDecil1).toBe(10)
  })

  it('base pequena demais não inventa decil', () => {
    const p = pontoMensal({ mes: '2026-05', scored, cancelDepois, janelaDesfecho: '2026-06' })
    expect(p.porDecil).toEqual([])
    expect(p.liftDecil1).toBeNull()
  })

  it('cancelamento em lote sai das taxas mas fica visível', () => {
    // C2 (crítico) e S2 (saudável) saem por venda de operação. Nenhum dos dois
    // pode contar: o score não tinha como prever, e incluí-los mexeria tanto na
    // taxa da faixa quanto no recall.
    const cancel = new Map([
      ...cancelDepois,
      ['C2', { mrr: 999, code: 'FNC.CAN.020' }],
      ['S2', { mrr: 999, code: 'FNC.CAN.020' }],
    ])
    const p = pontoMensal({ mes: '2026-05', scored, cancelDepois: cancel, janelaDesfecho: '2026-06' })

    expect(p.cancelamentosEmLote).toBe(2)
    expect(p.cancelamentos).toBe(3)
    expect(p.mrrPerdido).toBe(160)
    const crit = p.porClassificacao.find((x) => x.classificacao === 'critical')
    expect(crit.cancelaram).toBe(1)
    expect(p.recall).toBeCloseTo(66.7, 1)
  })

  it('a exclusão em lote vale também para os decis', () => {
    const cem = Array.from({ length: 100 }, (_, i) => ({
      contractNumber: `D${i}`, overall: i + 1, classification: 'healthy', enginesPresent: 3,
    }))
    // As 10 piores saem de verdade; 10 das melhores saem por venda de operação.
    const saem = new Map([
      ...Array.from({ length: 10 }, (_, i) => [`D${i}`, { mrr: 0 }]),
      ...Array.from({ length: 10 }, (_, i) => [`D${90 + i}`, { mrr: 0, code: 'FNC.CAN.020' }]),
    ])
    const p = pontoMensal({ mes: '2026-05', scored: cem, cancelDepois: saem, janelaDesfecho: '2026-06' })
    expect(p.porDecil[0].taxa).toBe(100)
    // Sem a exclusão o último decil marcaria 100% e o lift desabaria.
    expect(p.porDecil[9].taxa).toBe(0)
    expect(p.liftDecil1).toBe(10)
  })

  it('base vazia não estoura', () => {
    const vazio = pontoMensal({ mes: '2026-05', scored: [], cancelDepois, conexoes: null, janelaDesfecho: '2026-06' })
    expect(vazio.contratosAtivos).toBe(0)
    expect(vazio.taxaCancelamento).toBeNull()
  })
})

describe('resumirSerie', () => {
  it('agrega somando numerador e denominador, não tirando média de taxas', () => {
    // Mês grande com taxa baixa + mês pequeno com taxa alta. Média simples das
    // taxas daria ~40%; o certo é ponderar pelo tamanho da base.
    const grande = pontoMensal({
      mes: '2026-05',
      scored: Array.from({ length: 100 }, (_, i) => ({ contractNumber: `G${i}`, classification: 'healthy', enginesPresent: 3 })),
      cancelDepois: new Map([['G0', { mrr: 0 }], ['G1', { mrr: 0 }]]),
      janelaDesfecho: '2026-06',
    })
    const pequeno = pontoMensal({
      mes: '2026-06',
      scored: Array.from({ length: 10 }, (_, i) => ({ contractNumber: `P${i}`, classification: 'healthy', enginesPresent: 3 })),
      cancelDepois: new Map([['P0', { mrr: 0 }], ['P1', { mrr: 0 }], ['P2', { mrr: 0 }], ['P3', { mrr: 0 }], ['P4', { mrr: 0 }], ['P5', { mrr: 0 }], ['P6', { mrr: 0 }], ['P7', { mrr: 0 }]]),
      janelaDesfecho: '2026-07',
    })
    const { resumo } = resumirSerie([grande, pequeno])
    // (2 + 8) / (100 + 10) = 9,09% — e não (2% + 80%) / 2 = 41%.
    expect(resumo.taxaMedia).toBeCloseTo(9.09, 2)
  })

  it('separação mede o pior balde contra o melhor', () => {
    const p = pontoMensal({
      mes: '2026-05',
      scored: [
        ...Array.from({ length: 10 }, (_, i) => ({ contractNumber: `C${i}`, classification: 'critical', enginesPresent: 3 })),
        ...Array.from({ length: 10 }, (_, i) => ({ contractNumber: `E${i}`, classification: 'excellent', enginesPresent: 3 })),
      ],
      cancelDepois: new Map([
        ['C0', { mrr: 0 }], ['C1', { mrr: 0 }], ['C2', { mrr: 0 }], ['C3', { mrr: 0 }],
        ['E0', { mrr: 0 }],
      ]),
      janelaDesfecho: '2026-06',
    })
    const { resumo } = resumirSerie([p])
    // crítico 40%, excelente 10% → separação 4x
    expect(resumo.separacao).toBe(4)
  })

  it('série sem nenhum desfecho devolve resumo nulo em vez de zero', () => {
    const vazio = pontoMensal({ mes: '2026-05', scored, cancelDepois: new Map(), janelaDesfecho: '2026-06' })
    expect(resumirSerie([vazio]).resumo).toBeNull()
  })
})
