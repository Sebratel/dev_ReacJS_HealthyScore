import type {
  FinancialEngineConfig,
  FinancialIndicatorConfig,
  FinancialIndicatorKey,
} from '@/types'

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
      description: 'Pontuação quando o contrato possui faturas pagas em atraso ou em aberto vencidas.',
      mode: 'manual',
      points: -25,
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
      description: 'Pontuação quando o contrato possui faturas pagas até o vencimento.',
      mode: 'manual',
      points: 8,
      query: "SELECT count(*) FROM financial_receipt_titles frt2\nJOIN financial_receivable_titles frt ON frt.id = frt2.financial_receivable_title_id\nWHERE frt.contract_id = :contractId AND frt2.client_paid_date <= frt.expiration_date;",
    },
    paymentMethod: {
      key: 'paymentMethod',
      label: 'Forma de Pagamento',
      description: 'Pontuação por forma de pagamento (tipo de contrato) — valores sincronizados do banco.',
      mode: 'manual',
      points: 0,
      indices: [], // preenchido dinamicamente via syncPaymentForms
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
