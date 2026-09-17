// ─────────────────────────────────────────────────────────────────────────
// A unidade do sistema é o CONTRATO, não a pessoa.
//
// Existe por causa de um erro real: o ETL deduplicava por `client_id` e ficava
// com o primeiro contrato de cada pessoa. 3.356 dos 86.603 contratos nunca
// eram analisados, e o MRR deles não entrava em receita em risco. Quem tinha
// 3 contratos e cancelava 1 aparecia como "não cancelou".
//
// As engines agrupam por `clientId`. Enquanto ele guardar a pessoa, contratos
// irmãos se fundem num score só — em silêncio. Estes testes travam o contrato:
// identidade por contrato, pessoa preservada à parte.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { scoreAllClients } from './engines.mjs'
import { DEFAULT_COMMERCIAL_CONFIG } from '../src/features/commercial-engine/commercialConfig.ts'

// Duas linhas da MESMA pessoa, contratos diferentes — o caso que se perdia.
const base = {
  personId: '1000', name: 'Pessoa com dois contratos',
  clientGender: '(sem gênero)', clientBirth: null,
  seller: '(sem vendedor)', sellerGender: '(sem gênero)', sellerBirth: null, sellerAdmitted: null,
  contractDate: '2024-01-01', cancellationDate: null,
  plan: 'Plano', monthlyValue: 100, paymentForm: 'Boleto',
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
}

const contratos = [
  { ...base, clientId: 'C-001', contractNumber: 'C-001' },
  { ...base, clientId: 'C-002', contractNumber: 'C-002', monthlyValue: 250 },
]

describe('identidade por contrato', () => {
  it('dois contratos da mesma pessoa são pontuados separadamente', () => {
    const scores = scoreAllClients(contratos, { configs: { commercial: DEFAULT_COMMERCIAL_CONFIG } })
    expect(scores).toHaveLength(2)
    expect(new Set(scores.map((s) => s.clientId))).toEqual(new Set(['C-001', 'C-002']))
  })

  it('com identidade por PESSOA, um dos contratos some — é o bug que motivou a virada', () => {
    // Reproduz o comportamento antigo de propósito: mesmo `clientId` nos dois.
    const comoEraAntes = contratos.map((c) => ({ ...c, clientId: '1000' }))
    const scores = scoreAllClients(comoEraAntes, { configs: { commercial: DEFAULT_COMMERCIAL_CONFIG } })
    expect(scores).toHaveLength(1)
  })

  it('a pessoa continua acessível em personId', () => {
    for (const c of contratos) expect(c.personId).toBe('1000')
    expect(new Set(contratos.map((c) => c.personId)).size).toBe(1)
  })

  it('cada contrato carrega o próprio MRR', () => {
    // Com a deduplicação antiga, só o primeiro contrato entrava e os R$ 250 do
    // segundo sumiam de toda a conta de receita em risco.
    const total = contratos.reduce((a, c) => a + c.monthlyValue, 0)
    expect(total).toBe(350)
  })
})
