// ─────────────────────────────────────────────────────────────────────────
// Definição de "receita em risco", num lugar só — a mesma frase aparece no
// dashboard e na tela preditiva.
//
// Nome de indicador raramente basta. "Receita em risco" já foi lida como
// prejuízo a realizar, quando é exposição ponderada: mensalidade × risco, não
// previsão de perda. Sem a definição na tela, o número vira slide sem a letra
// miúda e volta como pergunta na reunião seguinte.
// ─────────────────────────────────────────────────────────────────────────

export const RECEITA_RISCO_DEF =
  'Mensalidade do plano × probabilidade de churn, somada apenas para quem está em Crítico ou Alto Risco. ' +
  'É exposição ponderada, não previsão de perda: ninguém vai perder exatamente esse valor. ' +
  'Serve para priorizar quem atender primeiro, não para projeção financeira. ' +
  'Contratos não faturados (cortesia, adequação de condomínio) entram com receita zero.'

export const RECEITA_RISCO_ANUAL_DEF =
  'A receita mensal em risco multiplicada por 12. Não considera reajuste, upgrade nem sazonalidade — ' +
  'é a mesma exposição ponderada do indicador mensal, apenas anualizada para comparação.'
