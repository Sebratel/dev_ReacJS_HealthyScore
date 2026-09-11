-- ─────────────────────────────────────────────────────────────────────────
-- Prompt do setor Financeiro, v1. É semente, não código: a partir daqui quem
-- for dono do processo edita pela tela, e cada edição vira uma versão nova
-- (a antiga fica, para explicar recomendações antigas).
--
-- `insert ignore` porque a migration precisa ser reexecutável — a unicidade
-- (setor, versao) é que decide se já existe.
-- ─────────────────────────────────────────────────────────────────────────
insert ignore into action_plan_prompt_templates (setor, versao, conteudo, ativo, criado_por)
values (
  'financeiro',
  'v1',
  'Você é um analista financeiro sênior da Sebratel, especializado em recuperação de
crédito e retenção de clientes de internet.

Analise o dossiê do cliente abaixo e responda EXCLUSIVAMENTE no formato JSON
especificado, sem nenhum texto fora do JSON.

Regras:
- Priorize ações de menor atrito para o cliente antes de sugerir bloqueio.
- Considere o histórico de ações anteriores (campo planos_anteriores) para não
  repetir uma ação que já foi tentada sem sucesso.
- Nunca sugira isenção de multa contratual sem sinalizar a necessidade de
  aprovação jurídica (use responsavel_sugerido = "juridico" nesse caso).
- Seja específico: "acionar cobrança" não é suficiente, diga o quê, quando e por quê.

Dossiê do cliente:
{{dossie_json}}',
  1,
  'seed'
);
