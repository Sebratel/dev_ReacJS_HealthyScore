-- ─────────────────────────────────────────────────────────────────────────
-- Módulo Planos de Ação — o ciclo completo de uma recomendação:
--
--   rodada → dossiê → recomendação da IA → decisão do gestor → tarefa → efeito
--
-- Sobre os identificadores de cliente e contrato: eles NÃO são chaves
-- estrangeiras. Cliente e contrato vivem no ELLEVEN (PostgreSQL de terceiro,
-- que o ETL só lê); apontar FK para lá é impossível. Guardamos o identificador
-- e, junto, o dossiê congelado — que é o registro do que de fato foi visto no
-- momento da decisão, e não muda quando a base muda.
-- ─────────────────────────────────────────────────────────────────────────

-- Prompt versionado por setor. Só um ativo por setor de cada vez: o índice
-- único parcial (emulado com uma coluna gerada) faz o banco garantir isso, em
-- vez de confiar que a aplicação lembre.
create table if not exists action_plan_prompt_templates (
  id             bigint unsigned not null auto_increment primary key,
  setor          varchar(40)  not null,
  versao         varchar(20)  not null,
  conteudo       mediumtext   not null,
  ativo          tinyint(1)   not null default 0,
  -- NULL quando inativo; o setor quando ativo. UNIQUE ignora NULLs no MariaDB,
  -- então isto permite N inativos e no máximo 1 ativo por setor.
  setor_ativo    varchar(40)  generated always as (if(ativo = 1, setor, null)) stored,
  criado_por     varchar(160) not null,
  criado_em      datetime     not null default current_timestamp,
  unique key uk_prompt_setor_versao (setor, versao),
  unique key uk_prompt_um_ativo_por_setor (setor_ativo)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- Uma rodada de geração: um conjunto de clientes de um setor, num critério.
create table if not exists action_plan_runs (
  id                bigint unsigned not null auto_increment primary key,
  setor             varchar(40)  not null,
  criterio_selecao  json         not null,
  qtd_clientes      int unsigned not null default 0,
  iniciado_por      varchar(160) not null,
  -- pendente → gerando → concluida | concluida_com_falhas | falha
  status            varchar(30)  not null default 'pendente',
  erro              text         null,
  criado_em         datetime     not null default current_timestamp,
  concluido_em      datetime     null,
  key ix_runs_setor_criado (setor, criado_em)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- Snapshot estruturado do cliente usado como entrada da IA. Congelado: é o
-- que justifica a recomendação, mesmo depois que a base mudar.
create table if not exists action_plan_dossiers (
  id                      bigint unsigned not null auto_increment primary key,
  run_id                  bigint unsigned not null,
  cliente_id              varchar(60)  not null,
  contrato_id             varchar(60)  null,
  dados_agregados         json         not null,
  health_score_no_momento decimal(6,2) null,
  classificacao           varchar(30)  null,
  criado_em               datetime     not null default current_timestamp,
  constraint fk_dossier_run foreign key (run_id) references action_plan_runs (id) on delete cascade,
  unique key uk_dossier_run_cliente (run_id, cliente_id),
  key ix_dossier_cliente (cliente_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- Saída da IA. Fica gravada mesmo quando falha na validação de schema — é
-- assim que se descobre que o prompt regrediu. O status separa o que pode ser
-- mostrado ao gestor do que não pode.
create table if not exists action_plan_recommendations (
  id                  bigint unsigned not null auto_increment primary key,
  dossier_id          bigint unsigned not null,
  prompt_template_id  bigint unsigned not null,
  modelo_ia           varchar(80)  not null,
  provider_id         bigint unsigned null,
  -- valida | falha_schema | falha_provedor
  status              varchar(30)  not null default 'valida',
  resposta            json         null,
  resposta_bruta      mediumtext   null,
  erro_validacao      text         null,
  tokens_entrada      int unsigned null,
  tokens_saida        int unsigned null,
  tokens_usados       int unsigned null,
  duracao_ms          int unsigned null,
  tentativa           int unsigned not null default 1,
  criado_em           datetime     not null default current_timestamp,
  constraint fk_rec_dossier foreign key (dossier_id) references action_plan_dossiers (id) on delete cascade,
  constraint fk_rec_prompt  foreign key (prompt_template_id) references action_plan_prompt_templates (id),
  key ix_rec_status (status),
  key ix_rec_dossier (dossier_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- Decisão humana. Uma recomendação tem no máximo uma decisão vigente — quem
-- reabrir, sobrescreve. `acoes_editadas` guarda o que o gestor de fato aprovou
-- (pode diferir do que a IA sugeriu), e é dele que nascem as tarefas.
create table if not exists action_plan_approvals (
  id                 bigint unsigned not null auto_increment primary key,
  recommendation_id  bigint unsigned not null,
  gestor_id          varchar(160) not null,
  -- em_revisao | aprovado | rejeitado
  status             varchar(30)  not null,
  acoes_editadas     json         null,
  comentario         text         null,
  decidido_em        datetime     null,
  criado_em          datetime     not null default current_timestamp,
  constraint fk_approval_rec foreign key (recommendation_id) references action_plan_recommendations (id) on delete cascade,
  unique key uk_approval_rec (recommendation_id),
  key ix_approval_status (status)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- Ação aprovada virada tarefa real. `cliente_id` é desnormalizado de
-- propósito: "meus planos anteriores para este cliente" é a consulta mais
-- frequente do módulo (alimenta o próprio dossiê) e não deve exigir 4 joins.
create table if not exists action_plan_tasks (
  id                bigint unsigned not null auto_increment primary key,
  approval_id       bigint unsigned not null,
  cliente_id        varchar(60)  not null,
  contrato_id       varchar(60)  null,
  setor             varchar(40)  not null,
  titulo            varchar(255) not null,
  descricao         text         null,
  prioridade        varchar(20)  null,
  responsavel_area  varchar(40)  null,
  responsavel_id    varchar(160) null,
  prazo             date         null,
  -- em_execucao | concluido | cancelado
  status            varchar(30)  not null default 'em_execucao',
  concluido_em      datetime     null,
  criado_em         datetime     not null default current_timestamp,
  constraint fk_task_approval foreign key (approval_id) references action_plan_approvals (id) on delete cascade,
  key ix_task_cliente (cliente_id),
  key ix_task_responsavel (responsavel_id, status),
  key ix_task_status_prazo (status, prazo)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- Fecha o ciclo: o health score do cliente antes e depois da ação.
-- `config_versao` registra COM QUAL RÉGUA a medição foi feita — sem isso, uma
-- troca de pesos entre o antes e o depois viraria "efeito da ação".
create table if not exists action_plan_outcomes (
  id                   bigint unsigned not null auto_increment primary key,
  task_id              bigint unsigned not null,
  health_score_antes   decimal(6,2) null,
  health_score_depois  decimal(6,2) null,
  classificacao_antes  varchar(30)  null,
  classificacao_depois varchar(30)  null,
  dias_decorridos      int          null,
  config_versao        varchar(80)  null,
  observacao           text         null,
  avaliado_em          datetime     not null default current_timestamp,
  constraint fk_outcome_task foreign key (task_id) references action_plan_tasks (id) on delete cascade,
  unique key uk_outcome_task (task_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
