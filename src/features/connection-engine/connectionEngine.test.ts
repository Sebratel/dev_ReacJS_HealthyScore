import { describe, it, expect } from 'vitest'
import type { RealClient } from '@/types'
import { buildEngineScores, linkKeysOf } from './connectionEngine'
import { cloneDefaultConnectionConfig } from './connectionConfig'

// Cliente mínimo: só o que a engine de conexão lê. Sem nenhum sinal, o score
// tem que ficar em 100 — é o que prova que "sem leitura" não pontua.
const client = (over: Partial<RealClient> = {}): RealClient => ({
  clientId: '1', name: 'Teste', contractNumber: '123', city: 'Serra',
  plan: 'TOP', monthlyValue: 100, equipment: [],
  protocolCount: 0,
  ...over,
} as unknown as RealClient)

const scoreOf = (c: Partial<RealClient>) =>
  buildEngineScores([client(c)], cloneDefaultConnectionConfig())[0]

describe('Wi-Fi na casa (RSSI)', () => {
  it('não pontua quem não tem leitura — "sem RSSI" nunca é "Wi-Fi bom"', () => {
    const s = scoreOf({})
    expect(s.wifiRssi).toBeNull()
    expect(s.healthScore).toBe(100)
    // E o indicador nem aparece no detalhamento, para não sugerir medição.
    expect(s.indicators.find((i) => i.key === 'wifiRssi')).toBeUndefined()
  })

  it('pontua pela MEDIANA, não pelo pior aparelho', () => {
    // Mesma "pior leitura" (−85), medianas opostas. Se a engine olhasse o pior,
    // os dois teriam o mesmo desconto — e o indicador estaria medindo quantos
    // aparelhos a casa tem, não a qualidade do Wi-Fi.
    const casaBoa = scoreOf({ connWifiRssi: -52, connWifiWorstRssi: -85, connWifiDevices: 6 })
    const casaRuim = scoreOf({ connWifiRssi: -83, connWifiWorstRssi: -85, connWifiDevices: 2 })
    expect(casaBoa.healthScore).toBe(100)
    expect(casaRuim.healthScore).toBeLessThan(casaBoa.healthScore)
  })

  it('cai na faixa certa e desconta mais conforme piora', () => {
    expect(linkKeysOf(client({ connWifiRssi: -55 })).wifiRssi).toBe('boa')
    expect(linkKeysOf(client({ connWifiRssi: -64 })).wifiRssi).toBe('aceitavel')
    expect(linkKeysOf(client({ connWifiRssi: -70 })).wifiRssi).toBe('fraca')
    expect(linkKeysOf(client({ connWifiRssi: -74 })).wifiRssi).toBe('ruim')
    expect(linkKeysOf(client({ connWifiRssi: -88 })).wifiRssi).toBe('critica')

    const fraca = scoreOf({ connWifiRssi: -70 })
    const ruim = scoreOf({ connWifiRssi: -74 })
    const critica = scoreOf({ connWifiRssi: -88 })
    expect(ruim.healthScore).toBeLessThan(fraca.healthScore)
    expect(critica.healthScore).toBeLessThan(ruim.healthScore)
  })

  it('mostra mediana, quantidade de aparelhos e o pior no detalhamento', () => {
    const s = scoreOf({ connWifiRssi: -74, connWifiWorstRssi: -88, connWifiDevices: 4 })
    const ind = s.indicators.find((i) => i.key === 'wifiRssi')
    expect(ind?.value).toContain('-74 dBm')
    expect(ind?.value).toContain('4 aparelho(s)')
    expect(ind?.value).toContain('pior -88')
  })
})

describe('Saúde do CPE', () => {
  it('memória alta desconta; memória normal não', () => {
    expect(scoreOf({ connCpeMemPct: 45 }).healthScore).toBe(100)
    expect(scoreOf({ connCpeMemPct: 95 }).healthScore).toBeLessThan(100)
  })

  it('temperatura do CPE é independente da temperatura da ONU', () => {
    // São sinais diferentes: o módulo óptico (onu_infos) e o roteador inteiro
    // (TR-069). Um quente não implica o outro, e ambos podem descontar.
    const soCpe = scoreOf({ connCpeTempC: 70 })
    const soOnu = scoreOf({ connOnuTempC: 70 })
    const ambos = scoreOf({ connCpeTempC: 70, connOnuTempC: 70 })
    expect(soCpe.healthScore).toBeLessThan(100)
    expect(soOnu.healthScore).toBeLessThan(100)
    expect(ambos.healthScore).toBeLessThan(Math.min(soCpe.healthScore, soOnu.healthScore))
  })
})
