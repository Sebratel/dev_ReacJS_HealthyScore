// ─────────────────────────────────────────────────────────────────────────
// Classificação do motivo de cancelamento em GRUPOS acionáveis.
//
// O ELLEVEN grava o motivo como texto livre concatenado ("Cancelamento de
// contrato - Desistência - Justificativa: ..."), com dezenas de variações. Sem
// agrupar, qualquer leitura de "quem cancelou" mistura coisas que não têm nada
// a ver entre si — e a mais grave é a venda que nunca virou cliente.
//
// Medido em agosto/2026 (2.525 cancelamentos): 856 deles (34%) eram contratos
// que morreram ANTES da instalação — mediana de 4 dias entre venda e
// cancelamento, e 100% sem nenhuma fatura emitida. Tratar isso como churn
// distorce tenure, ticket e qualquer persona.
// ─────────────────────────────────────────────────────────────────────────

export type MotiveGroup =
  | 'preInstall'    // vendeu, não instalou (desistência, falta de contato, inviabilidade)
  | 'involuntary'   // corte por inadimplência
  | 'coverage'      // mudou para onde não atendemos
  | 'voluntary'     // saiu por vontade própria: insatisfação, concorrência, desuso
  | 'other'         // falecimento, duplicidade administrativa, não informado

export const MOTIVE_GROUP_ORDER: MotiveGroup[] = [
  'voluntary', 'involuntary', 'coverage', 'preInstall', 'other',
]

export const MOTIVE_GROUP_LABEL: Record<MotiveGroup, string> = {
  voluntary: 'Saída voluntária',
  involuntary: 'Inadimplência',
  coverage: 'Perda de cobertura',
  preInstall: 'Não chegou a instalar',
  other: 'Outros / administrativo',
}

export const MOTIVE_GROUP_HINT: Record<MotiveGroup, string> = {
  voluntary: 'Insatisfação, concorrência ou desuso. É o grupo em que retenção consegue agir.',
  involuntary: 'Corte por falta de pagamento. Age-se antes, com cobrança e renegociação.',
  coverage: 'Mudou para endereço sem atendimento. Não é evitável por retenção.',
  preInstall: 'Contrato morreu antes da instalação — nunca foi cliente. Não é churn.',
  other: 'Falecimento, contrato duplicado e casos sem motivo informado.',
}

/** Retenção só consegue agir sobre estes; os demais entram no total mas não na meta. */
export const ACTIONABLE_GROUPS: MotiveGroup[] = ['voluntary', 'involuntary']

// A ordem importa: 'preInstall' é testado primeiro porque o prefixo genérico
// "Cancelamento de contrato" cobre justamente os abortos de instalação.
export function motiveGroupOf(motive: string | null | undefined): MotiveGroup {
  const m = (motive ?? '').toLowerCase()
  if (!m.trim()) return 'other'
  if (m.startsWith('cancelamento de contrato')) return 'preInstall'
  if (m.includes('desistiu de instalar') || m.includes('inviabilidade técnica')) return 'preInstall'
  if (m.includes('falta de pagamento') || m.includes('sem condições de pagar')) return 'involuntary'
  if (m.includes('não pagava mensalidade')) return 'involuntary'
  if (m.includes('mudou para um local') || m.includes('fora de cobertura')) return 'coverage'
  if (m.includes('insatisfação') || m.includes('concorrência') || m.includes('outra operadora')) return 'voluntary'
  if (m.includes('não utiliza mais') || m.includes('se nega a informar')) return 'voluntary'
  return 'other'
}
