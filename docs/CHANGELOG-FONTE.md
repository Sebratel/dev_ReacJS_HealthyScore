# Health Score — material de origem para changelog

**Produto:** Health Score (plataforma de saúde da base e previsão de cancelamento — Sebratel)
**Janela coberta:** 18/08/2026 a 17/09/2026
**Volume:** 40 commits · 185 arquivos · +11.893 / −2.089 linhas
**Estado do repositório:** `main` em `2c31d31`. `origin/main` em `2d925a3` (1 commit local ainda não enviado). `origin/staging` em `d3f8435` — **atrasada em 4 commits**, incluindo toda a virada para contrato.

---

## Como usar este arquivo

Este é o material **bruto e verificado** do que mudou no período, escrito para ser
entregue a outra IA que vai redigir o changelog final para os usuários da plataforma.

Cada item traz três coisas: **o que mudou**, **por que importa para quem usa** e
**o impacto medido**. Os números são reais, extraídos das mensagens de commit e
conferidos no código — não são estimativas.

Três orientações para quem for redigir:

1. **O público são os usuários internos da plataforma** (diretoria, retenção,
   financeiro, comercial, relacionamento) — não os assinantes da Sebratel.
   Se o destino for outro, veja a seção "Dados sensíveis" antes de publicar.
2. **Priorize por impacto na decisão de quem lê**, não por ordem cronológica.
   A seção 1 é a manchete; o resto é corpo.
3. **Não anuncie como concluído o que está na seção 8.**

---

## Dados sensíveis — decidir antes de publicar

O período tem correções que mexem em números que já circularam em reunião. Eles
são o que torna o changelog interessante, e também o que não pode vazar para fora
da empresa. Se o changelog for circular **apenas dentro da Sebratel**, use tudo.
Se puder sair da empresa, **remova ou arredonde**:

- Tamanho da base (86.713 contratos) e contagem de assinantes
- MRR da base (R$ 9,79 milhões) e receita em risco
- Taxas de churn mensais (1,70% a 2,02%) e o pico de junho
- Valores de contratos de cortesia (R$ 54.253)
- Nomes de clientes citados como exemplo (Brigada Militar, condomínios)

O restante — melhorias de tela, novos indicadores, novas funcionalidades — é
seguro em qualquer público.

---

## 1. MANCHETE: a unidade da plataforma passou a ser o CONTRATO

O maior ganho do período, e o que mais muda o que aparece na tela. Vale abrir o
changelog com isso.

### O problema que existia

A plataforma tratava **pessoa** como unidade. Na carga de dados, quando um
assinante tinha vários contratos, só o primeiro era mantido — os demais eram
descartados e nunca analisados.

Consequências reais, todas medidas:

- **3.466 contratos nunca eram avaliados.** Não tinham nota, não entravam em
  ranking e a receita deles ficava fora do cálculo de receita em risco.
- **Quem tinha 3 contratos e cancelava 1 aparecia como "não cancelou".**
- Contratos irmãos ficavam **sem dados de rede e sem quedas de conexão**, em
  silêncio, porque o índice interno era 1:1 com a pessoa.

### O que mudou

- A base passa de **83.247 para 86.713 contratos** — 3.466 a mais sob análise
- **3.041 assinantes têm mais de um contrato** (o maior deles tem 28)
- Cada contrato agora tem nota própria, entra em ranking e conta como saída
  quando cancela
- Os indicadores do painel passam a se chamar **"Contratos Ativos"** e
  **"Contratos em Risco"**; o KPI ganhou **ticket médio** no lugar da contagem
  de pessoas
- Toda contagem da plataforma (sidebar, rodapé das engines, cobertura,
  paginação, "Contratos Críticos") passou a ser de contratos

Onde a tela mostra de fato o **nome da pessoa**, o rótulo continua "Cliente" —
trocar descreveria errado o que está ali. O mesmo vale para frases que são
sobre a pessoa mesmo ("Gênero do cliente", "Wi-Fi na casa do cliente").

### Dois cuidados que acompanharam a mudança

- **O histórico não se perdeu.** Os pontos de nota gravados antes da virada
  estavam indexados pelo identificador antigo. O sistema passou a reconhecer os
  dois formatos — sem isso, a linha do tempo de todo contrato apareceria vazia,
  e o passado não dá para regravar.
- **Falha latente corrigida no cálculo de nota.** A memória de resultados era
  identificada por um critério que não distinguia populações do mesmo tamanho;
  duas coortes diferentes podiam receber a mesma nota. Agora a identificação é
  por impressão digital da população.

**Commits:** `f1acbd4` (16/09), `2d925a3` (17/09), `2c31d31` (17/09)

> **Nota para quem redigir:** dois conjuntos de números circulam nos commits
> (86.713/3.466/3.041/28 e 86.603/3.356/2.838/25), de execuções diferentes da
> carga. **Use o primeiro**, que é o mais recente.

---

## 2. Assertividade: a plataforma acerta? (11 commits)

O maior bloco do período. A pergunta "o Health Score realmente antecipa quem vai
cancelar?" ganhou uma resposta medida, comparável mês a mês e reconciliada com o
relatório oficial da diretoria.

### 2.1 O indicador de assertividade nasceu (03/09)

Responde **"dos que cancelaram, quantos a plataforma já sinalizava?"** — e
responde sem se enganar. Pontuar hoje um cliente já cancelado usaria dados que
só existem *porque* ele cancelou (faturas acumuladas, retirada de equipamento,
quedas depois do corte). O cálculo usa exclusivamente histórico congelado: pega
a foto de uma data passada, fica só com quem estava ativo ali, e pergunta quem
cancelou depois.

A definição do indicador ficou **na tela**, não só no código — "assertividade"
é o tipo de métrica que vira slide sem a letra miúda.

**Commits:** `5a65ed2`, `603f376`

### 2.2 A leitura foi invertida para a pergunta que a operação faz (03/09)

O card abria com cobertura ("26,4% dos que saíram já estavam marcados"), que é a
pergunta **inversa** da que a operação faz. Agora o destaque é a taxa de saída
por classificação, sempre ao lado da média da base — porque "crítico 7,2%"
isolado não diz nada; o que diz é **"2,8x a média"**.

Numerador e denominador aparecem em todo lugar (95 de 1.319, não só 7,2%), para
ninguém precisar confiar no percentual.

**Commit:** `603f376`

### 2.3 Quem nunca foi cliente saiu da conta (08/09)

A base de cancelados trazia todo contrato marcado como cancelado. Na janela de
2 anos isso eram 67.124 registros — e **27.654 deles (41%) nunca foram
instalados**: endereço com pendência, falta de contato, desistência,
inviabilidade técnica. Venda que morreu antes da instalação entrava como
"cancelamento" e distorcia tempo de casa, ticket e qualquer perfil montado em
cima.

**Impacto: a coorte cai de 67.124 para 38.410.** Agosto/2026 sai de 2.525 para
1.598 cancelamentos.

Junto: o motivo do cancelamento passou a vir do **código estruturado do evento**
em vez de heurística sobre texto livre. Cobertura de 100% da coorte, com os 41
códigos existentes mapeados.

**Commit:** `ee9e36c`

### 2.4 A medição virou mensal, por contrato e comparável (12/09 a 15/09)

A medição antiga congelava a base numa data e perguntava quem cancelou "até
hoje". Três defeitos herdados: a janela crescia sozinha (o número subia com o
tempo sem nada melhorar), dois meses nunca eram comparáveis entre si, e dependia
de existir foto congelada.

A nova reconstrói a base ativa no último dia de cada mês, pontua com as mesmas
engines do app e observa quem cancelou no mês seguinte. Janela fechada e
comparável.

Decisões que mudaram o número:

- **Chave por contrato**, não por pessoa (mesma virada da seção 1, aplicada
  primeiro aqui)
- **Janela de sinal deslizante de 180 dias.** Com início fixo, a assertividade
  parecia subir de 5,6% para 19% ao longo da série — era só acúmulo de
  histórico, não melhora
- **Leitura por decil.** A assertividade parecia subir de 9,5% para 18,3%; era
  deriva de cadastro do ERP (protocolos quase dobraram com a base crescendo 5%),
  não cliente mais arriscado. Por decil o tamanho do grupo é sempre 10% e a
  deriva não afeta

**Resultado da série limpa (mar–jul/2026):** taxa mensal estável entre 1,70% e
2,02%, **separação de 13,3x** entre a melhor e a pior faixa, e gradiente
monotônico — crítico 9,31% → alto risco 7,17% → atenção 4,36% → saudável 2,83%
→ excelente 0,70%. **A nota ordena risco corretamente.**

**Commits:** `2de3562`, `7827e1a`, `608b6c7`, `cdadf4b`

### 2.5 Roda sozinha e publica no dia 1º (14/09)

Antes era só manual. Agora a apuração roda automaticamente no dia 1º, publica
o indicador do mês que fechou e **acumula a série** em vez de sobrescrever
(rodar um mês não apaga o histórico; reexecutar o mesmo mês é seguro).

Dois defeitos corrigidos no caminho: uma cadeia de tarefas que, ao encontrar um
passo desligado, **desligava todos os seguintes em silêncio**; e um formato
antigo de registro que fazia o mesmo mês ser gravado duas vezes.

**Commit:** `608b6c7`

### 2.6 A tela mostra o mês em curso (15/09)

- **Mês em curso como leitura principal**, com as duas pontas da janela
  amarradas na mesma data — para não contar cancelamento de um dia que o
  denominador ainda não enxerga
- Mês aberto vem **marcado como parcial e fora do agregado**: só parte dele teve
  chance de gerar saída, e somar puxaria a média para baixo
- Histórico dos **últimos 3 meses fechados** em cartões menores, clicáveis
- As duas leituras aparecem lado a lado ("dos que saíram, quantos estavam em
  crítico?" e "dos críticos, quantos saíram?"), com a distinção escrita na tela
  — são fáceis de trocar uma pela outra numa reunião

**Commit:** `6a5e8ac`

### 2.7 Reconciliação com o relatório oficial (15/09 e 16/09)

A tela dizia 1.426 para julho e o fluxo validado pela diretoria dizia 1.460. Os
dois estavam certos, medindo coisas diferentes — mas a tela perdia a discussão
por não mostrar a ponte. A decomposição exata agora aparece.

Além disso, **cancelamento em lote por venda de operação saiu do total**: é
decisão da empresa, não saída de cliente, e nenhum score pode prever.

**Impacto: junho/2026 cai de 2.522 (2,99%) para 1.488 (1,77%)** e a série fica
estável. O pico que parecia deterioração era **um evento único**. O número
continua contado à parte, para não sumir sem rastro.

O card ganhou um rodapé explicando os três motivos pelos quais este número não
bate com o e-mail oficial — escrito na tela porque **quem compara os dois
números sem explicação conclui que um deles está errado**, e aí o sistema
inteiro perde credibilidade.

**Commits:** `d8307e5`, `6b4c112`

---

## 3. Engine de Conexão: 9 indicadores novos (4 commits)

A aba de Conexão pontuava só o modelo do equipamento e as quedas acumuladas.
Faltava a foto de **como o cliente está conectado agora**, que é onde mora boa
parte da insatisfação que vira cancelamento.

### 3.1 Qualidade do enlace (01/09)

Seis indicadores novos, todos configuráveis: **potência óptica** (atenuação em
dBm), **velocidade negociada da porta LAN**, **geração do Wi-Fi (ac/ax)**,
**status atual da ONU**, **distância da fibra** e **temperatura da ONU**.

A população da engine passou a incluir quem tem leitura de enlace — antes, o
cliente com sinal péssimo e sem equipamento cadastrado ficava fora da engine
inteira.

**Commit:** `39303a4`

### 3.2 O Wi-Fi de dentro da casa (13/09)

O sinal óptico dizia que a fibra chegava bem e o cliente continuava reclamando
de internet ruim. Faltava o outro lado: o Wi-Fi dentro da casa.

Três indicadores: **sinal do Wi-Fi (RSSI)**, **memória do roteador** e
**temperatura do roteador**.

A decisão central foi agregar pela **mediana** dos aparelhos, não pelo pior:
pelo pior, o indicador marcaria 15% das casas com 1 aparelho e 77% das com 6+ —
mediria quantos aparelhos a casa tem, não a qualidade do Wi-Fi (toda casa com 6
aparelhos tem um celular no quintal). Pela mediana a marcação fica estável em
10–15% em qualquer quantidade.

**Cobertura de ~20% dos contratos**, dependente do firmware do equipamento. Quem
não tem leitura não pontua e aparece como "–", com denominador próprio nos
agregados.

**Commit:** `e99c477`

### 3.3 As sugestões automáticas passaram a cobrir os 9 (16/09)

Os indicadores novos não apareciam nas sugestões de pontuação porque a lista era
escrita à mão. Agora deriva da definição da própria engine — indicador novo no
painel entra sozinho. A classificação em faixas reusa os mesmos cortes da
pontuação: duplicar faria sugestão e nota discordarem em silêncio.

**Commit:** `a20d5d3`

### 3.4 Investigação: dá para saber o Wi-Fi de quem já cancelou? (16/09)

Resposta medida: **não, retroativamente não dá.** Dos 45.042 equipamentos que
pararam de responder, 34.385 (76%) já estão sem cliente vinculado — o aparelho
foi recolhido e o vínculo desfeito. Em outros 9.693 o vínculo mudou depois da
última leitura, então usar o dado atual atribuiria o Wi-Fi de quem saiu ao novo
dono.

Conclusão prática: o que responde à pergunta é o Wi-Fi de 30–60 dias **antes** da
saída, e esse só existe se for congelado daqui para frente — o que motivou o
item 6.2.

**Commit:** `665ff69`

---

## 4. Planos de Ação com IA — módulo novo (5 commits)

Fecha o ciclo que faltava: até aqui a plataforma dizia quem estava mal e parava
aí.

### 4.1 O módulo (11/09)

Fase 1, no setor Financeiro. O fluxo completo:

> seleção (mesmo ranking do Financeiro) → dossiê congelado → IA propõe →
> **o gestor decide** → tarefa com prazo → reavaliação automática em 30 dias

Decisões que valem aparecer no changelog:

- **A IA propõe, o gestor decide.** Nenhuma ação é aplicada automaticamente.
- **Duas barreiras na saída da IA.** O formato é exigido na origem e revalidado
  antes de gravar. Resposta reprovada fica registrada para auditoria e **nunca
  aparece ao gestor como válida** — plano malformado com cara de bom é o modo
  de falha perigoso aqui.
- **O antes e o depois saem da mesma régua.** O "antes" fica congelado no
  dossiê; o "depois" é recalculado pela mesma engine, e fica registrado qual
  régua foi usada. Sem isso, mudar pesos entre um momento e outro apareceria
  como efeito da ação.
- **A confiança declarada pelo modelo é rotulada como tal na tela**, nunca como
  medida de acerto.

**Commit:** `ec5860f`

### 4.2 Provedor de IA configurável pela tela (14/09)

A chave de IA é cadastrada **pela tela**, cifrada, sem passar por arquivo de
configuração. A tela lista **os modelos que aquela chave realmente alcança**,
consultando o provedor — digitar o nome do modelo de cabeça é a origem do
"modelo inexistente" que só aparece na primeira geração.

Três provedores suportados (Anthropic, OpenAI e compatíveis, Gemini) mais o modo
simulado. Sem provedor configurado, o módulo roda simulado e **diz isso em
letras claras**. A chave nunca volta em resposta nem em arquivo — só os quatro
últimos caracteres.

**Commit:** `ebb601d`

### 4.3 Três correções de qualidade da geração (14/09 a 16/09)

- **Teto de resposta ampliado** (8.000 → 16.000). Nos modelos com raciocínio, o
  limite antigo cortava planos no meio.
- **O formato esperado passou a viajar dentro do pedido à IA.** A primeira
  rodada real **falhou nas 30 gerações**: o pedido mandava "responda no formato
  especificado" e nunca mostrava a especificação. O modelo inventava nomes
  razoáveis e o plano vinha bom, mas era descartado inteiro.
- **Ajuste fino no contrato e na compatibilidade com o Gemini**, encontrado
  imprimindo o que de fato sai na requisição em vez de confiar no teste verde.

**Commits:** `4575655`, `5869401`, `3335650`

---

## 5. Previsão de prazo de cancelamento — tela nova (3 commits)

Estima, para contratos ativos em risco, **uma janela para frente** de
cancelamento a partir de hoje. Determinística, ancorada na sobrevivência real
dos cancelados com o mesmo perfil: entre os que passaram do tempo de contrato
atual, mediana e faixa p25–p75 do tempo restante.

- Lista ordenada por urgência (prazo mais curto primeiro)
- Indicadores de ≤30 dias, ≤90 dias e receita em risco
- Filtros por quantidade, classificação, cidade e busca
- Exportação CSV
- **Racional por contrato** em linha expansível

É **faixa de risco, não data garantida** — vale deixar isso explícito no
changelog.

Cada linha ganhou uma **análise em linguagem natural** com efeito de digitação:
enquadramento, os sinais que mais pesam, a janela + confiança e uma recomendação
de ação. É narrativa determinística ancorada nos dados, não texto de IA — o
número vem sempre da estatística.

Acompanha documentação do método, incluindo a explicação medida de por que as
janelas tendem a durar meses, e a limitação assumida (não é Kaplan-Meier).

**Commits:** `0ee6024`, `3697d8f`, `e3f3a9a`

---

## 6. Correções que mudam número já divulgado (2 commits)

Estes dois merecem destaque no changelog: quem concilia os números com outra
fonte **vai notar a diferença**, e é melhor que leia a explicação antes.

### 6.1 Contrato de cortesia entrava como receita que não existe (14/09)

Um cliente de cortesia aparecia com "receita mensal em risco". O preço mora no
produto, não no contrato — então um contrato de cortesia recebia o preço de
tabela do plano, e esse valor virava receita em toda a plataforma. A própria
**SEBRATEL TECNOLOGIA** aparecia na lista de receita a perder, junto com Brigada
Militar e condomínios.

Medido: **205 contratos de cortesia ativos, com 2 faturas emitidas em 24 meses.**
Adequação de Condomínio: 78 contratos, zero faturas.

Agora entram com receita zero. O contrato **continua na base** — tem nota, entra
em ranking e no histórico; só a receita é zero.

**Impacto: o MRR da base cai 0,55%** (R$ 54.253 de R$ 9.835.682). É correção, não
distorção, mas quem concilia esse número com o financeiro vai notar.

Junto, a definição de "receita em risco" foi para a tela, com ícone de ajuda: já
foi lida como prejuízo a realizar, quando é **exposição ponderada** (mensalidade
× risco), não previsão de perda.

**Commit:** `d443eb3`

### 6.2 Score de conexão não é comparável entre quem ficou e quem saiu (16/09)

Descoberta que **impede uma conclusão errada**. Os dados de enlace não chegam
igual nos dois grupos:

| Insumo | Ativos | Cancelados |
|---|---|---|
| Quedas de conexão | 99,2% | 46,4% |
| Potência óptica | 95,1% | 0,0% |
| Sinal de Wi-Fi | 17,3% | 0,0% |

Como "sem dado não pontua", o cancelado não leva descontos que não tinha como
levar: o score médio de Conexão dá **70,8 nos ativos contra 93,2 nos
cancelados**. São 22 pontos de *ausência de medição* — quem saiu aparece com
conexão **melhor** que quem ficou.

O score de Conexão passou a vir marcado como não comparável quando não havia
leitura. Quem for comparar populações usa o campo correto e **não precisa
conhecer a armadilha**.

Junto: os **valores** de enlace passaram a ser congelados no histórico diário
(potência óptica, porta LAN, sinal de Wi-Fi, aparelhos conectados, memória e
temperatura). O score responde "quanto o contrato valia naquele dia"; os valores
respondem "por quê" — e são os únicos que não dá para reconstruir depois.
Responde à pergunta "quem cancelou estava com o Wi-Fi ruim 60 dias antes?"
**daqui para frente**.

**Commit:** `813da8c`

---

## 7. Acesso, interface e infraestrutura (11 commits)

### 7.1 Power user agora vale por setor (16/09)

Até aqui o papel era um só para a plataforma inteira: quem virava power user
mexia no peso de **todas** as engines. Agora cada power user recebe os setores
que responde e **continua vendo todas as telas** — o escopo limita só a escrita.

- "Usuários e Acessos" mostra os setores em chips
- Botão "Configurar" da engine e "Aplicar" das sugestões só aparecem no setor do
  usuário
- Consultas do sistema: lê todas, edita as do seu grupo
- Faixas do Health Score viraram exclusivas do administrador (valem para todo
  setor)
- **Ninguém é rebaixado na atualização**: quem já era power user continua valendo
  por todos os setores

**Commit:** `1863d49`

### 7.2 Tema claro e escuro (01/09)

A interface era escura fixa. Agora há um alternador sol/lua na barra superior e
a preferência **persiste**; sem escolha salva, segue o tema do sistema
operacional. A tela não pisca no tema errado ao abrir.

As cores passaram a sair de uma paleta central, em vez de valores fixos
espalhados — por isso a mudança tocou praticamente toda a interface.

**Commits:** `41c57fc`, `653d2f7` (número do medidor de saúde visível no tema
claro)

### 7.3 Ver e exportar listas completas (21/08 e 26/08)

- **Popup "Piores Health Scores"** no card de Maior Risco: lista ordenada do pior
  para o melhor, com filtros (quantidade, classificação, cidade, busca), tabela
  paginada e **exportação CSV** pronta para Excel em português
- **Seletor de quantidade** no popup "Ver dados" das engines: 50 a 2.000 linhas
  (antes eram 200 fixas), e o CSV exporta a quantidade escolhida

**Commits:** `e07d352`, `1edfa06`

### 7.4 Sidebar diz quando os dados foram carregados (17/09)

"Monitoramento ativo" com ponto pulsando era lido como tempo real. Quem via isso
esperava que um cancelamento da manhã já aparecesse — não aparece, porque a base
é a foto da madrugada.

Agora a sidebar diz que a **carga é diária** e mostra **data e hora da última**.
Dizer quando foi resolve melhor que "uma vez ao dia": se a carga falhar, a data
velha denuncia sozinha.

**Commit:** `2c31d31`

### 7.5 Confiabilidade da carga de dados (31/08)

O sinal de quedas de conexão sumia nas rodadas de madrugada e voltava só no
reprocessamento manual: a consulta pesada estourava o tempo limite com o banco
de origem sob carga, e **a carga engolia a falha em silêncio**.

Agora tenta sozinha de novo (3 tentativas, com espera crescente), com limites de
tempo mais folgados, e **avisa alto quando desiste** em vez de sumir calado.

**Commit:** `d074f34`

### 7.6 Itens internos, sem efeito visível ao usuário

Não precisam entrar no changelog; ficam registrados para completude.

- `7a3e92c` — parou de versionar arquivos gerados e 10,8 MB de dados reais
- `42b258b` — configuração de ambiente de desenvolvimento
- `869e25b` — variáveis da apuração mensal declaradas na configuração da stack
- `5d84435` — restauração de um endpoint removido por engano, mais um teste que
  impede a repetição (o problema só aparecia como erro em tempo de execução)
- `aeea37d` — relatório de perfil de cancelamentos em Markdown, separado por
  motivo, para alimentar construção de persona
- `914f3c3` — o card de login passou a nomear o sistema ("Health Score") em vez
  de repetir a marca da empresa

---

## 8. Pendências — NÃO anunciar como concluído

**A troca de nomenclatura não está 100%.** A varredura de 17/09 converteu os
rótulos que quantificam em 12 arquivos, mas **11 rótulos ainda dizem "Clientes"
descrevendo listas cujas linhas são contratos**:

- Subtítulo do ranking nas 7 engines ("Clientes ordenados por Health Score…")
- "Clientes com Maior Risco" e "Clientes no filtro" no painel
- "Clientes com leitura de RSSI" na engine de Conexão
- "Clientes cancelados com retirada de equipamento" na tela de Retiradas

Se o changelog afirmar "toda contagem da plataforma agora é de contratos", a
frase fica maior que o entregue. Duas saídas: corrigir os 11 antes de publicar,
ou escrever "os principais indicadores e contagens" em vez de "toda contagem".

**Outras pendências:**

- `origin/staging` está **4 commits atrás** de `main` — toda a virada para
  contrato ainda não foi promovida
- Há **1 commit local não enviado** (`2c31d31`)
- Os números do commit de 16/09 divergem entre a mensagem e o comentário no
  código (ver nota da seção 1)

---

## 9. Sugestão de estrutura para o changelog final

Uma ordem que funciona para este período, por impacto em quem lê:

1. **Agora a plataforma enxerga todos os contratos** — o ganho de cobertura
   (seção 1). É o que muda número na tela de todo mundo.
2. **A plataforma passou a medir se acerta** — assertividade (seção 2). É a
   resposta à pergunta que a diretoria faz.
3. **Números corrigidos** — cortesia e comparabilidade (seção 6). Precisa vir
   cedo, antes que alguém concilie e estranhe.
4. **Novidades** — Planos de Ação (4), Previsão (5), indicadores de Conexão (3).
5. **Melhorias de uso** — tema claro, exportações, acesso por setor,
   transparência da carga (7).

Um bloco curto de "o que ainda não é" ajuda a calibrar expectativa: a previsão é
faixa de risco e não data; a assertividade mede ordenação de risco, não
probabilidade calibrada; a cobertura de Wi-Fi é de ~20% da base.

---

## 10. Lista completa dos 40 commits

| Data | Hash | Assunto |
|---|---|---|
| 17/09 | `2c31d31` | Sidebar diz que a carga é diária, e quando foi a última |
| 17/09 | `2d925a3` | Varredura: toda contagem da plataforma passa a ser de contratos |
| 16/09 | `f1acbd4` | A unidade do sistema passa a ser o CONTRATO, não a pessoa |
| 16/09 | `3335650` | Contrato: ações recomendadas voltam à lista da raiz; Gemini sem campo inventado |
| 16/09 | `813da8c` | Histórico congela os valores de enlace e para de comparar régua torta |
| 16/09 | `5869401` | O contrato da resposta passa a viajar dentro do prompt |
| 16/09 | `665ff69` | Conexão: medir se dá para saber o Wi-Fi de quem já cancelou |
| 16/09 | `a20d5d3` | Sugestões de IA passam a cobrir os 9 indicadores de enlace |
| 16/09 | `6b4c112` | Venda de operação sai das duas contas + rodapé da divergência |
| 16/09 | `1863d49` | Power user agora vale por setor |
| 15/09 | `d8307e5` | Assertividade reconcilia com o relatório oficial |
| 15/09 | `869e25b` | Compose: declara as variáveis da coorte mensal |
| 15/09 | `5d84435` | Restaura endpoint da coorte mensal + teste de rotas |
| 15/09 | `cdadf4b` | Assertividade passa a ser a leitura mensal |
| 15/09 | `6a5e8ac` | Churn do mês na tela: mês em curso + 3 meses fechados |
| 14/09 | `608b6c7` | Coorte mensal roda sozinha no dia 1º |
| 14/09 | `7827e1a` | Coorte mensal: medir por decil, tirar cancelamento em lote |
| 14/09 | `4575655` | Teto de tokens padrão vai a 16000 |
| 14/09 | `ebb601d` | Provedor de IA: um ativo, cifrado, com os modelos da chave |
| 14/09 | `d443eb3` | Receita em risco: contrato de cortesia não é receita |
| 13/09 | `e99c477` | Conexão: o Wi-Fi de dentro da casa vira indicador |
| 12/09 | `2de3562` | Coorte mensal por contrato: base de fim de mês, score retroativo |
| 11/09 | `f8d7e03` | Assertividade: de qual data, até quando, em que mês as saídas |
| 11/09 | `ec5860f` | Planos de Ação: a IA propõe, o gestor decide |
| 08/09 | `ee9e36c` | Cancelados: só quem chegou a ser cliente entra na coorte |
| 03/09 | `603f376` | Assertividade: destacar "dos marcados, quantos saíram" |
| 03/09 | `5a65ed2` | Assertividade do Health Score na primeira dobra |
| 03/09 | `aeea37d` | Perfil de cancelamentos do mês em Markdown |
| 01/09 | `7a3e92c` | Parar de versionar dist/ e o snapshot do ETL |
| 01/09 | `42b258b` | Config de launch para o dev server |
| 01/09 | `914f3c3` | Login: pílula do card nomeia o sistema |
| 01/09 | `41c57fc` | Tema claro/escuro com alternador na TopBar |
| 01/09 | `39303a4` | Conexão: medir qualidade do enlace |
| 01/09 | `e3f3a9a` | Documenta como a Previsão calcula a janela |
| 31/08 | `d074f34` | ONU do AutoISP com retry + falha não-silenciosa |
| 26/08 | `1edfa06` | Seletor de quantidade no popup "Ver dados" |
| 26/08 | `653d2f7` | Número do medidor de saúde visível no tema claro |
| 26/08 | `3697d8f` | Narrativa da previsão (fase 2) |
| 25/08 | `0ee6024` | Tela de previsão de prazo de cancelamento |
| 21/08 | `e07d352` | Popup "Piores Health Scores" com filtros + CSV |
