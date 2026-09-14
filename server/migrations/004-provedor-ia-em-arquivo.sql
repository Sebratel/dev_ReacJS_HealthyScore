-- ─────────────────────────────────────────────────────────────────────────
-- O provedor de IA sai do banco e vira arquivo no volume (data/ia.json).
--
-- A 002 criou uma TABELA de provedores, no padrão do Datahub: vários cadastros
-- e um marcado como padrão. A referência da casa para esta tela é o
-- comercial_pbi, que guarda UM provedor ativo num JSON ao lado das outras
-- configs de runtime — e é o desenho certo aqui por dois motivos:
--
--   • "qual é o padrão hoje?" é uma pergunta que não deveria existir num
--     módulo que precisa saber, sem ambiguidade, com que modelo cada plano foi
--     gerado;
--   • em arquivo, a tela do provedor continua funcionando quando o banco do
--     módulo está fora — que é justamente quando alguém vai querer configurar.
--
-- `provider_id` sai junto: a identidade do que gerou cada recomendação já está
-- em `modelo_ia`, que é o que interessa numa auditoria.
-- ─────────────────────────────────────────────────────────────────────────
drop table if exists ai_providers;

alter table action_plan_recommendations drop column if exists provider_id;
