-- ─────────────────────────────────────────────────────────────────────────
-- Provedores de IA gerenciados pela tela (padrão trazido do Datahub).
--
-- A alternativa era a chave no .env da stack: trocar de modelo ou rotacionar a
-- chave exigiria editar a stack e redeployar, e só quem tem acesso ao servidor
-- conseguiria. Aqui o provedor é cadastrado na tela e a chave é cifrada em
-- repouso (AES-256-GCM, server/crypto.mjs).
--
-- A chave NUNCA volta numa resposta da API — nem mascarada de forma
-- reversível. A tela mostra só os últimos 4 caracteres (`key_hint`), guardados
-- em claro de propósito: serve para reconhecer ("é a que termina em 4f2a?")
-- sem expor o segredo.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists ai_providers (
  id             bigint unsigned not null auto_increment primary key,
  nome           varchar(120) not null,

  -- 'anthropic' | 'openai' | 'gemini'. 'openai' fala o dialeto Chat
  -- Completions, então cobre também Azure OpenAI, Groq, OpenRouter e
  -- servidores locais compatíveis — basta trocar a base_url. É por isso que o
  -- campo se chama `kind` e não "fornecedor".
  kind           varchar(30)  not null,
  modelo         varchar(120) not null,

  api_key_enc    text         null,        -- AES-256-GCM (iv:tag:ciphertext em base64)
  key_hint       varchar(8)   null,        -- últimos 4 caracteres, só reconhecimento
  base_url       varchar(255) null,        -- endpoint alternativo

  -- max_tokens generoso de propósito: resposta cortada no meio é o modo de
  -- falha mais comum e mais confuso para quem usa.
  max_tokens     int unsigned not null default 16000,
  -- Nível de esforço ('low' | 'medium' | 'high' | 'xhigh' | 'max'). Texto
  -- livre para não exigir migration a cada nível novo.
  effort         varchar(20)  null,

  ativo          tinyint(1)   not null default 1,
  padrao         tinyint(1)   not null default 0,
  -- NULL quando não é padrão; 1 quando é. UNIQUE ignora NULL → no máximo um
  -- padrão, garantido pelo banco. Uma corrida entre duas telas vira erro de
  -- constraint em vez de dois provedores "padrão" ao mesmo tempo.
  padrao_unico   tinyint(1)   generated always as (if(padrao = 1, 1, null)) stored,

  -- Resultado do último teste de conexão — o que diz se o cadastro presta.
  ultimo_teste_em      datetime     null,
  ultimo_teste_ok      tinyint(1)   null,
  ultimo_teste_erro    text         null,
  ultimo_teste_ms      int unsigned null,

  criado_por     varchar(160) not null,
  criado_em      datetime     not null default current_timestamp,
  atualizado_em  datetime     not null default current_timestamp on update current_timestamp,
  unique key uk_ai_provider_nome (nome),
  unique key uk_ai_provider_padrao (padrao_unico),
  key ix_ai_provider_ativo (ativo)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
