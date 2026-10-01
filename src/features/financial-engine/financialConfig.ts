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
  ['antes', 'Paga antes do vencimento', 0],   // planilha: +50
  ['no_dia', 'Paga no dia do vencimento', 0], // planilha: +40
]

// ─── Por que não há pontuação POSITIVA aqui ────────────────────────────────
// A planilha trabalha numa escala de +50 a −50. Esta engine começa em 100 e só
// desconta, então ponto positivo não premia ninguém (já estão no teto) — ele
// CANCELA punição. Medido: um contrato com 45 dias de atraso (−50) somado a
// "nunca renegociou" (+50), "nunca usou confiança" (+50) e "paga antes" (+50)
// fechava em 100, "excelente", empatado com um cliente impecável.
//
// Correção: todo valor POSITIVO da planilha vira 0; os negativos ficam como a
// área escreveu. Assim nenhum número aqui é invenção minha — é o da planilha ou
// zero. Traduzir as distâncias (deslocar tudo em −50) foi tentado e medido:
// jogava 54,5% da base em "crítico", porque os 60 pontos de span da forma de
// pagamento foram calibrados para outra agregação e sozinhos desmontam a escala.
//
// PREÇO desta escolha, que precisa de decisão da área: as distinções no topo
// somem. "Paga antes" e "paga no dia" ficam ambos em 0; Pix, Mensal e Digital
// também. A ordem entre os RUINS é preservada, que é o que move retenção.
//
// Honrar o +50 de verdade exigiria a engine agregar por média ponderada em vez
// de descontar de 100 — mudança de modelo, não de config, e que afetaria a
// comparabilidade com o histórico congelado.
//
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
  ['PF - ANUAL - PIX AUTOMÁTICO', 'Anual · Pix automático', 0],  // planilha: +50
  ['PF - MENSAL - E-MAIL', 'Mensal · E-mail', 0],                // planilha: +40
  ['PF - ANUAL - DIGITAL', 'Anual · Digital', 0],                // planilha: +20
  ['PF - ANUAL - E-MAIL', 'Anual · E-mail', -5],                 // planilha: −5
  ['PF - ANUAL - CORREIO', 'Anual · Correio', -10],              // planilha: −10
]

// ─── Recorrência: desbloqueio por confiança e renegociação ──────────────────
// "Recorrente" = houve evento em MESES CONSECUTIVOS (regra do Financeiro). O
// degrau dentro de cada escada vem dos MESES DISTINTOS com evento — três
// desbloqueios no mesmo mês são um aperto só, e contá-los como três puniria o
// cliente por ter ligado três vezes na mesma semana.
//
// `nunca` não é o degrau zero da escada: é um fato com nota positiva (+50).
import type { Degrau } from './recurrence'

export const TRUST_NEVER_POINTS = 0 // planilha: +50 — ver nota sobre escala
export const TRUST_EVENTUAL: Degrau[] = [
  { key: 'ev1', label: 'Eventual · 1 mês com desbloqueio', ateMeses: 1, defaultPoints: -5 },
  { key: 'ev2', label: 'Eventual · 2 meses', ateMeses: 2, defaultPoints: -10 },
  { key: 'ev3', label: 'Eventual · 3 meses', ateMeses: 3, defaultPoints: -15 },
  { key: 'ev4', label: 'Eventual · 4 meses', ateMeses: 4, defaultPoints: -20 },
  { key: 'ev5p', label: 'Eventual · 5 meses ou mais', ateMeses: Infinity, defaultPoints: -25 },
]
export const TRUST_RECORRENTE: Degrau[] = [
  { key: 'rc3', label: 'Recorrente · até 3 meses', ateMeses: 3, defaultPoints: -30 },
  { key: 'rc6', label: 'Recorrente · até 6 meses', ateMeses: 6, defaultPoints: -35 },
  { key: 'rc9', label: 'Recorrente · até 9 meses', ateMeses: 9, defaultPoints: -40 },
  { key: 'rc12', label: 'Recorrente · até 12 meses', ateMeses: 12, defaultPoints: -45 },
  { key: 'rc12p', label: 'Recorrente · mais de 12 meses', ateMeses: Infinity, defaultPoints: -50 },
]

export const RENEG_NEVER_POINTS = 0 // planilha: +50 — ver nota sobre escala
export const RENEG_EVENTUAL: Degrau[] = [
  { key: 'ev1', label: 'Eventual · 1 mês com renegociação', ateMeses: 1, defaultPoints: -10 },
  { key: 'ev2', label: 'Eventual · 2 meses', ateMeses: 2, defaultPoints: -15 },
  { key: 'ev3', label: 'Eventual · 3 meses', ateMeses: 3, defaultPoints: -20 },
  { key: 'ev4p', label: 'Eventual · 4 meses ou mais', ateMeses: Infinity, defaultPoints: -25 },
]
export const RENEG_RECORRENTE: Degrau[] = [
  { key: 'rc2', label: 'Recorrente · 2 meses seguidos', ateMeses: 2, defaultPoints: -40 },
  { key: 'rc3', label: 'Recorrente · 3 meses', ateMeses: 3, defaultPoints: -45 },
  { key: 'rc4p', label: 'Recorrente · 4 meses ou mais', ateMeses: Infinity, defaultPoints: -50 },
]

// Uma escada vira índices da config: `nunca` primeiro, depois eventual, depois
// recorrente — a ordem em que a tela mostra, do melhor para o pior.
const escadaIndices = (nunca: number, rotuloNunca: string, ev: Degrau[], rc: Degrau[]) => [
  { key: 'nunca', label: rotuloNunca, points: nunca },
  ...ev.map((d) => ({ key: `ev:${d.key}`, label: d.label, points: d.defaultPoints })),
  ...rc.map((d) => ({ key: `rc:${d.key}`, label: d.label, points: d.defaultPoints })),
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
      description: 'Nunca usou vale +50. Quem usou cai numa de duas escadas: eventual (meses espalhados) ou recorrente (meses consecutivos). O degrau vem dos meses distintos com desbloqueio.',
      mode: 'manual',
      points: 0,
      indices: escadaIndices(TRUST_NEVER_POINTS, 'Nunca usou', TRUST_EVENTUAL, TRUST_RECORRENTE),
      query: "SELECT count(*) FROM contract_events ce\nWHERE ce.contract_id = :contractId\n  AND ce.description ILIKE 'Desbloqueio Financeiro%';",
    },
    renegotiations: {
      key: 'renegotiations',
      label: 'Renegociações',
      description: 'Nunca solicitou vale +50. Quem solicitou cai em eventual (meses espalhados) ou recorrente (meses consecutivos) — dois meses seguidos pesam quase o triplo de dois espalhados.',
      mode: 'manual',
      points: 0,
      indices: escadaIndices(RENEG_NEVER_POINTS, 'Nunca solicitou', RENEG_EVENTUAL, RENEG_RECORRENTE),
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
