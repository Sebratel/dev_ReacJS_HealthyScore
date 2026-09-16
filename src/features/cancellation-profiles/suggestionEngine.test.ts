// ─────────────────────────────────────────────────────────────────────────
// Guarda de cobertura das sugestões de IA.
//
// Existe por causa de um erro real: o painel de Conexão ganhou nove
// indicadores de enlace (potência óptica, RSSI, memória do CPE…) e nenhum
// apareceu nas sugestões, porque a lista de descritores era escrita à mão. O
// sintoma é silencioso — não quebra nada, só deixa de sugerir.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildSuggestions } from './suggestionEngine'
import {
  CONNECTION_INDICATOR_ORDER, DEFAULT_CONNECTION_CONFIG,
} from '@/features/connection-engine/connectionConfig'
import type { RealClient } from '@/types'

// Cliente mínimo no shape que as engines consomem.
function cliente(over: Partial<RealClient> = {}): RealClient {
  return {
    clientId: 'x', name: 'Cliente', clientGender: '(sem gênero)', clientBirth: null,
    seller: '(sem vendedor)', sellerGender: '(sem gênero)', sellerBirth: null, sellerAdmitted: null,
    contractNumber: 'x', contractDate: '2024-01-01', cancellationDate: null, cancellationMotive: null,
    plan: 'Plano', monthlyValue: 100, paymentForm: 'Boleto', city: 'Cidade', neighborhood: 'Bairro',
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
  } as RealClient
}

// Listas dinâmicas vazias para QUALQUER chave: enumerar à mão faria o teste
// quebrar toda vez que uma lista nova entrasse, por um motivo que nada tem a
// ver com o que ele mede.
const LISTAS = new Proxy({}, { get: () => [] }) as never

describe('cobertura dos indicadores de Conexão nas sugestões', () => {
  // Leitura ruim de enlace nos cancelados, boa nos ativos: é o contraste que
  // faz o indicador ter lift e aparecer na lista.
  const cancelados = Array.from({ length: 60 }, () =>
    cliente({
      connRxPower: -28, connLanMbps: 100, connCpeModel: 'F670L', connOnuStatus: 'loss_signal',
      connFiberDistanceM: 18000, connOnuTempC: 72, connWifiRssi: -82, connCpeMemPct: 93, connCpeTempC: 68,
    } as Partial<RealClient>)
  )
  const ativos = Array.from({ length: 60 }, () =>
    cliente({
      connRxPower: -18, connLanMbps: 1000, connCpeModel: 'F6600P', connOnuStatus: 'OK',
      connFiberDistanceM: 2000, connOnuTempC: 45, connWifiRssi: -55, connCpeMemPct: 40, connCpeTempC: 40,
    } as Partial<RealClient>)
  )

  const res = buildSuggestions(ativos, cancelados, LISTAS)
  const grupo = res.groups.find((g) => g.engineKey === 'connection')
  const sugeridos = new Set(grupo?.indicators.map((i) => i.indicatorKey) ?? [])

  it('a engine de Conexão produz sugestões', () => {
    expect(grupo).toBeDefined()
    expect(sugeridos.size).toBeGreaterThan(0)
  })

  it('todo indicador de ENLACE do painel aparece nas sugestões', () => {
    // `equipment` e os status de PPPoE ficam de fora deste caso porque o
    // cliente sintético não tem equipamento nem eventos de ONU acumulados.
    const enlace = CONNECTION_INDICATOR_ORDER.filter(
      (k) => k !== 'equipment' && !k.startsWith('onu') || k === 'onuStatusNow' || k === 'onuTemperature'
    )
    const faltando = enlace.filter((k) => !sugeridos.has(k))
    expect(
      faltando,
      `indicador(es) do painel de Conexão sem descritor de sugestão: ${faltando.join(', ')}`
    ).toEqual([])
  })

  it('o rótulo da sugestão vem do config, não de texto solto', () => {
    const porChave = new Map(
      Object.entries(DEFAULT_CONNECTION_CONFIG.indicators).map(([k, v]) => [k, v.label])
    )
    for (const ind of grupo?.indicators ?? []) {
      const esperado = porChave.get(ind.indicatorKey)
      if (esperado) expect(ind.indicatorLabel).toBe(esperado)
    }
  })
})
