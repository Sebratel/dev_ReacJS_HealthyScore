import type {
  FinancialEngineConfig,
  FinancialIndicatorConfig,
  FinancialIndicatorKey,
} from '@/types'

// ─── Faixas de atraso (planilha "Ajustes no Health Score", aba Financeiro) ──
// `maxDias` é o teto INCLUSIVO da faixa. A faixa vale pela PIOR fatura paga em
// atraso no período: quem atrasou 45 dias uma vez e pagou em dia o resto do ano
// não é um pagador em dia — e a nota que interessa à retenção é a do pior
// episódio, não a da média, que dilui justamente o caso grave.
//
// Volume medido em 12 meses (faturas pagas), para nenhuma faixa ficar oca:
// D+1a5 130.614 · D+6a8 76.045 · D+9a15 93.477 · D+16a20 7.792 ·
// D+21a30 5.445 · D+31a45 1.518 · D+46+ 545.
export interface FinRange { key: string; label: string; maxDias: number; defaultPoints: number }

export const LATE_RANGES: FinRange[] = [
  { key: 'd5', label: 'Pagou até 5 dias após o vencimento', maxDias: 5, defaultPoints: -20 },
  { key: 'd8', label: 'Pagou entre 6 e 8 dias', maxDias: 8, defaultPoints: -25 },
  { key: 'd15', label: 'Pagou entre 9 e 15 dias', maxDias: 15, defaultPoints: -35 },
  { key: 'd20', label: 'Pagou entre 16 e 20 dias', maxDias: 20, defaultPoints: -40 },
  { key: 'd30', label: 'Pagou entre 21 e 30 dias', maxDias: 30, defaultPoints: -45 },
  { key: 'd45', label: 'Pagou entre 31 e 45 dias', maxDias: 45, defaultPoints: -50 },
  { key: 'd45p', label: 'Pagou depois de 45 dias', maxDias: Infinity, defaultPoints: -50 },
]

// Faturas pagas SEM atraso. A planilha separa as duas, e a diferença é real:
// quem paga antes do vencimento é um perfil distinto de quem paga no dia.
export const ON_TIME_INDICES: [string, string, number][] = [
  ['antes', 'Paga antes do vencimento', 50],
  ['no_dia', 'Paga no dia do vencimento', 40],
]

// Formas de pagamento com nota fixa. As chaves são os títulos REAIS de
// `contract_types` — conferidos no banco, não traduzidos da planilha.
//
// Cuidado ao ler: "Pix automático" tem a melhor nota e alcança 484 contratos
// (0,6% da base). Ele quase não move o score de ninguém hoje.
//
// As 16 formas restantes (Rede Brasil, Telefonia, Corporativo, Cortesia…, cerca
// de 5.100 contratos) NÃO estão na planilha e ficam em zero até alguém decidir.
// Zero aqui significa "não pontua", não "é neutro por análise".
export const PAYMENT_METHOD_INDICES: [string, string, number][] = [
  ['PF - ANUAL - PIX AUTOMÁTICO', 'Anual · Pix automático', 50],
  ['PF - MENSAL - E-MAIL', 'Mensal · E-mail', 40],
  ['PF - ANUAL - DIGITAL', 'Anual · Digital', 20],
  ['PF - ANUAL - E-MAIL', 'Anual · E-mail', -5],
  ['PF - ANUAL - CORREIO', 'Anual · Correio', -10],
]

const idx = (rows: [string, string, number][]) => rows.map(([key, label, points]) => ({ key, label, points }))

// Ordem de exibição dos indicadores no modal de configuração
export const FINANCIAL_INDICATOR_ORDER: FinancialIndicatorKey[] = [
  'overdueBills',
  'trustReleases',
  'renegotiations',
  'onTimePayments',
  'paymentMethod',
]

// Configuração padrão. As pontuações manuais são aplicadas por "presença"
// (quando o indicador aparece no contrato). Os índices de "Forma de Pagamento"
// começam vazios e são preenchidos dinamicamente em runtime a partir das
// formas de pagamento ATIVAS no banco (store.syncPaymentForms).
export const DEFAULT_FINANCIAL_CONFIG: FinancialEngineConfig = {
  indicators: {
    overdueBills: {
      key: 'overdueBills',
      label: 'Faturas Atrasadas',
      description: 'Faixa da PIOR fatura paga em atraso no período. Quem atrasou 45 dias uma vez não é pagador em dia — a média diluiria justamente o episódio que importa.',
      mode: 'manual',
      points: 0,
      indices: LATE_RANGES.map((r) => ({ key: r.key, label: r.label, points: r.defaultPoints })),
      query: "SELECT count(*) FROM financial_receivable_titles frt\nWHERE frt.contract_id = :contractId AND frt.title LIKE '%FAT%'\n  AND (paga após vencimento OU em aberto vencida);",
    },
    trustReleases: {
      key: 'trustReleases',
      label: 'Liberações por Confiança',
      description: 'Pontuação quando houve desbloqueio financeiro por confiança no contrato.',
      mode: 'manual',
      points: -15,
      query: "SELECT count(*) FROM contract_events ce\nWHERE ce.contract_id = :contractId\n  AND ce.description ILIKE 'Desbloqueio Financeiro%';",
    },
    renegotiations: {
      key: 'renegotiations',
      label: 'Renegociações',
      description: 'Pontuação quando o contrato possui títulos renegociados.',
      mode: 'manual',
      points: -20,
      query: "SELECT count(*) FROM financial_receivable_titles frt\nWHERE frt.contract_id = :contractId AND frt.renegotiated = 'True';",
    },
    onTimePayments: {
      key: 'onTimePayments',
      label: 'Faturas pagas no prazo',
      description: 'Comportamento predominante entre as faturas pagas sem atraso: antes do vencimento ou no próprio dia.',
      mode: 'manual',
      points: 0,
      indices: idx(ON_TIME_INDICES),
      query: "SELECT count(*) FROM financial_receipt_titles frt2\nJOIN financial_receivable_titles frt ON frt.id = frt2.financial_receivable_title_id\nWHERE frt.contract_id = :contractId AND frt2.client_paid_date <= frt.expiration_date;",
    },
    paymentMethod: {
      key: 'paymentMethod',
      label: 'Forma de Pagamento',
      description: 'Pontuação por forma de pagamento (tipo de contrato). As cinco da planilha vêm com nota; as demais entram em zero via syncPaymentForms, aguardando decisão.',
      mode: 'manual',
      points: 0,
      indices: idx(PAYMENT_METHOD_INDICES),
      query: 'SELECT pf.title FROM contract_types pf JOIN contracts c ON c.contract_type_id = pf.id;',
    },
  },
}

// Clona a config padrão (evita mutação acidental do objeto exportado)
export function cloneDefaultFinancialConfig(): FinancialEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_FINANCIAL_CONFIG.indicators).map(([k, v]) => [
        k,
        { ...v, indices: v.indices ? v.indices.map((i) => ({ ...i })) : undefined },
      ]),
    ) as Record<FinancialIndicatorKey, FinancialIndicatorConfig>,
  }
}
