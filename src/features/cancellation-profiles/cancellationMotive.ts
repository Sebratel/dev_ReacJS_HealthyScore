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

// ─── Classificação por CÓDIGO do evento (autoritativa) ─────────
// `contract_events` + `contract_event_types.code` é o registro estruturado do
// motivo. O `cancellation_motive` de `contracts` é texto livre concatenado e
// só serve de reserva para contrato sem evento registrado.
const GROUP_BY_CODE: Record<string, MotiveGroup> = {
  // Inadimplência e aperto financeiro
  'IND.CAN.001': 'involuntary', // Inadimplência
  'IND.CAN.021': 'involuntary', // Inadimplência SEM MENSALIDADE PAGA
  'OTR.CAN.021': 'involuntary', // Inadimplência Sinistro Enchente RS 2024
  'FNC.CAN.007': 'involuntary', // Dificuldade Financeira
  // Saiu por vontade própria
  'CNC.CAN.013': 'voluntary',   // Concorrência
  'INS.CAN.004': 'voluntary',   // Insatisfação
  'OTR.CAN.002': 'voluntary',   // Cliente não utiliza mais o serviço
  'OTR.CAN.020': 'voluntary',   // Não quis informar
  // Deixou de ter atendimento no endereço
  'MDE.CAN.008': 'coverage',    // Mudança de Endereço
  'OTR.CAN.018': 'coverage',    // Fora de Cobertura
  'OTR.CAN.019': 'coverage',    // Desativação de POP
  'OTR.CAN.003': 'coverage',    // Perdeu Visada
  '3.04': 'coverage',           // Cliente Ativo Sem Viabilidade
  // Morreu antes da instalação — a query da coorte já corta pelo v_stage,
  // mas o de-para fica porque o código também é usado fora dela.
  'OTR.CAN.015': 'preInstall',  // Falta de Contato
  'NIN.CAN.005': 'preInstall',  // Desistência
  'FNC.CAN.016': 'preInstall',  // Endereço com pendência
  'OTR.CAN.012': 'preInstall',  // Inviabilidade Técnica
  'FNC.CAN.017': 'preInstall',  // CPF com Pendência
  'FNC.CAN.019': 'preInstall',  // Sem comprovante de Endereço
  'OTR.CAN.014': 'preInstall',  // Área Restrita
  'OTR.CAN.006': 'preInstall',  // Contrato duplicado
  // Administrativo / força maior
  'OTR.CAN.009': 'other',       // Falecimento
  'OTR.CAN.010': 'other',       // Empresarial
  'OTR.CAN.011': 'other',       // Cortesia / Permuta
  'OTR.CAN.017': 'other',       // ENCHENTE
  'FNC.CAN.018': 'other',       // JUDICIAL
  'FNC.CAN.020': 'other',       // Contratos em Lote (VENDA OPERAÇÃO)
  'CNC.CAN.014': 'other',       // "Outros" — título genérico demais para inferir
  '3.05': 'other', '3.06': 'other', '3.07': 'other', // custos de troca/migração
}

/** Grupo a partir do código do evento. `null` quando o código é desconhecido. */
export function motiveGroupOfCode(code: string | null | undefined): MotiveGroup | null {
  const k = (code ?? '').trim()
  return k ? (GROUP_BY_CODE[k] ?? null) : null
}

// A ordem importa: 'preInstall' é testado primeiro porque o prefixo genérico
// "Cancelamento de contrato" cobre justamente os abortos de instalação.
export function motiveGroupOf(motive: string | null | undefined, code?: string | null): MotiveGroup {
  // O código manda quando existe; o texto livre é o plano B.
  const porCodigo = motiveGroupOfCode(code)
  if (porCodigo) return porCodigo
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
