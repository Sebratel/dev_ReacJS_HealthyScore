# Diretrizes de uso — Health Score

Como a plataforma deve ser usada, por quem, e o que cada número quer dizer.
Escrito para quem vai operar o dia a dia: gerência, retenção, suporte e
comercial. Não é manual de instalação (isso está no `README.md`).

---

## 1. O que esta plataforma é — e o que ela não é

Ela responde **"quais contratos têm mais chance de cancelar, e por quê"**, e
transforma isso em ação com dono e prazo.

Três coisas que ela **não** é, e que evitam a maior parte dos mal-entendidos:

**Não é tempo real.** A base é uma foto tirada de madrugada, uma vez por dia. Um
cancelamento de hoje de manhã não aparece hoje. A data da última carga está na
barra lateral, embaixo de "Monitoramento ativo" — se ela estiver velha, o ETL
falhou e todo número da tela está velho junto.

**Não é o sistema de origem.** O ELLEVEN continua sendo a verdade sobre
contrato, fatura e protocolo. Aqui os dados são lidos, nunca escritos. A única
base em que a plataforma escreve é a dela própria (planos de ação).

**Não é uma bola de cristal.** O score **ordena** risco: quem está em "crítico"
cancela muito mais que quem está em "excelente". Isso é diferente de acertar
quem vai cancelar. Ver a seção 4.

---

## 2. Acessos

Todo mundo com e-mail do domínio entra e **vê tudo**. O controle é sobre
**escrita**, não sobre leitura — esconder número de quem trabalha com ele só
gera pedido por e-mail.

| Papel | O que pode fazer |
|---|---|
| **viewer** | Lê todas as telas. É o papel de quem entra pela primeira vez. |
| **power_user** | Tudo do viewer **+ editar os indicadores e as queries dos SEUS setores**. |
| **admin** | Tudo do power_user **+ limiares do Health Score e gestão de usuários**. |

### A regra que importa: escopo por setor

Um power_user vale **por setor**, não pela plataforma inteira. O gerente do
Financeiro vê a tela de Conexão normalmente, mas **não muda os pesos dela**.

Os sete setores são os das engines: Financeiro, Comercial, Conexão, Rede,
Manutenção, Instalação e Relacionamento.

**Por quê:** peso de indicador é decisão de quem responde pelo resultado
daquela área. Quem não vive o problema não tem como calibrar — e uma mudança
errada não dá erro, só desloca a nota de todo mundo em silêncio.

### O que é global, e por isso só admin mexe

- **Limiares do Health Score** (o que é "crítico", o que é "saudável"). Valem
  para todos os setores ao mesmo tempo: mudar aqui muda o tamanho do balde de
  alerta da empresa inteira.
- **Queries transversais** (base, coorte mensal, cancelados, retiradas), que
  alimentam a plataforma toda em vez de um setor só.
- **Usuários e acessos.**

### Ao conceder acesso

1. Comece todo mundo como **viewer**. É o suficiente para 90% do uso.
2. Promova a power_user **só quem responde pelo indicador**, e **só no setor
   dele**. Power user sem setor nenhum não existe — seria o mesmo que viewer.
3. `ADMIN_EMAILS` no ambiente é semente: garante que sempre haja um admin para
   abrir a tela de acessos. Quem vem por ali não pode ser rebaixado pela tela —
   é proposital, para ninguém trancar a própria porta.

---

## 3. A unidade é o CONTRATO

A plataforma conta **contratos**, não pessoas. Toda tela, todo KPI, todo
percentual.

**Por quê:** quem cancela é o contrato. Uma pessoa com três contratos que
cancela um não "cancelou" — ela cancelou um terço do que tinha, e a operação
precisa enxergar isso. São mais de 3.000 assinantes com mais de um contrato, um
deles com 28.

O nome da pessoa continua aparecendo — é assim que se identifica o cliente ao
telefone — mas ao lado dele está sempre o `#número do contrato`. **Ao falar de
volume, fale em contratos.** Comparar o número daqui com um relatório que conta
pessoas dá diferença garantida e discussão desnecessária.

---

## 4. Como ler o Health Score

A nota vai de 0 a 100 e sai da média das engines que **tinham dado** sobre
aquele contrato. Contrato sem sinal nenhum não recebe nota inventada — ele
simplesmente não entra na conta, e a tela diz quantos ficaram de fora.

### O que a nota faz bem

**Ordena risco.** Medido sobre cinco meses fechados e ~416 mil contrato-mês, a
faixa crítica cancela cerca de **13 vezes mais** que a faixa excelente, e a
ordem se mantém em todas as cinco faixas, mês após mês.

### O que ela não faz

**Não concentra a perda.** A faixa crítica é pequena, então ela origina uma
fração pequena dos cancelamentos — a maior parte das saídas vem do meio da
base, que é onde está quase todo mundo. Isso não é defeito do modelo: uma faixa
com 1% da base não tem como originar 40% das saídas.

**Consequência prática:** use a nota para **priorizar fila**, não para prever
indivíduo. "Ligue primeiro para estes" é o uso certo. "Estes vão cancelar" não.

### Duas porcentagens que parecem a mesma e não são

Na tela de Assertividade elas aparecem lado a lado de propósito:

| Leitura | Pergunta | Denominador |
|---|---|---|
| **Risco da faixa** | Dos que estão em crítico, quantos saíram? | a faixa |
| **% das saídas** | Dos que saíram, quantos estavam em crítico? | os cancelamentos |

Trocar uma pela outra numa reunião leva a decisão errada. A primeira diz se
vale agir sobre a faixa; a segunda diz de onde a perda está vindo.

### Ao comparar meses

Compare **decil**, não faixa. As faixas usam limiar fixo sobre a nota, e o
limiar derrapa quando o volume de sinal muda por motivo que não é o cliente —
já aconteceu: o ERP ganhou tipos novos de protocolo, a contagem por contrato
subiu e a base inteira escorregou para pior sem ninguém ter ficado mais
arriscado. O decil é posição dentro do mês, então o balde tem sempre 10% e os
meses voltam a ser comparáveis.

Mês em curso **não se compara com mês fechado** — metade dele ainda não teve
chance de gerar saída. Compare com o mesmo dia do mês anterior.

---

## 5. Planos de Ação

O ciclo: **selecionar → IA propõe → gerência decide → vira tarefa → mede o
resultado**.

### Como abrir uma rodada

1. **Escolha o critério, não o volume.** Classificação mínima, cidade, faixa de
   MRR. O padrão são 30 contratos; o teto é 200.
2. **A prévia é grátis, a rodada não.** A tela mostra quantos contratos entram
   antes de gastar chamada de IA. Use isso — cada contrato na rodada é uma
   chamada paga.
3. **Comece pequeno.** Uma rodada de 30 que vira ação vale mais que uma de 200
   que ninguém revisa. Recomendação não decidida é custo sem retorno.

### Ao revisar as recomendações

**A IA propõe; quem decide é a gerência.** Cada recomendação tem aprovar,
rejeitar e **editar as ações antes de aprovar** — e é para usar. A IA não sabe
que o cliente ligou ontem, que a rua está em obra, ou que aquele condomínio tem
contrato à parte.

**Rejeitar com comentário vale mais que rejeitar em silêncio.** O comentário é
o que permite melhorar o critério da próxima rodada.

**Aprovar cria tarefa com dono e prazo.** Aprovação sem execução não muda
número nenhum — e a reavaliação de impacto vai medir exatamente isso.

### Ao medir o resultado

O "antes" fica congelado no dossiê no momento da rodada; o "depois" é
recalculado depois do prazo (padrão 30 dias), com a **mesma engine e a mesma
configuração**.

⚠️ **Se a configuração oficial mudou entre o antes e o depois, a variação deixa
de significar "efeito da ação"** — passa a misturar o efeito da ação com o
efeito de terem mudado a régua. A tela avisa quando isso acontece. Nesse caso,
não use o número para justificar a ação.

Consequência prática: **evite mexer em pesos no meio de uma safra de tarefas em
aberto.** Se precisar mexer, mexa logo depois de uma reavaliação, não antes.

---

## 6. Sugestões de melhoria com IA

A tela de Pontuação Sugerida compara a prevalência de cada atributo entre quem
**cancelou** e quem **ficou**:

```
lift = prevalência entre cancelados ÷ prevalência na base ativa
```

- **lift > 1** → mais comum em quem cancelou → sinal de risco → sugere pontos
  negativos
- **lift < 1** → mais comum em quem ficou → fator protetor → sugere pontos
  positivos

### Como usar bem

**A sugestão é ponto de partida, não veredito.** Ela mede correlação em cima do
passado. Quem decide se o indicador faz sentido é quem conhece a operação.

**Olhe a amostra antes do lift.** A tela só sugere com pelo menos 5 contratos
ativos e 3 cancelados no atributo, e avisa quando não há amostra suficiente.
Lift alto tirado de 6 casos é ruído com cara de descoberta.

**Desconfie de lift que não tem história.** Se você não consegue explicar por
que aquele atributo levaria alguém a cancelar, provavelmente ele está
*junto* da causa, não *sendo* a causa. Exemplo clássico: um atributo que só
existe em cliente antigo vai parecer protetor porque cliente antigo cancela
menos — o atributo não protege nada.

**Cuidado com cobertura desigual.** Indicador que só existe para parte da base
(o RSSI do Wi-Fi, por exemplo, depende do firmware reportar e chega em ~1 de
cada 5 contratos) mede quem tem o dado, não quem tem o problema. Quem não
reporta não pontua — e isso é diferente de estar bem.

**Aplique poucos de cada vez.** Aplicar vinte sugestões de uma vez torna
impossível saber qual melhorou a nota. E mexer em peso muda a nota de toda a
base, o que reinicia qualquer comparação em andamento (ver seção 5).

### O que a IA não decide

Ela não muda peso sozinha, não aprova plano, não fala com cliente. Toda
sugestão passa por um humano com escopo naquele setor.

---

## 7. Boas práticas do dia a dia

**Abra pelo topo.** Assertividade → onde a perda está vindo → engine do setor →
contratos. Ir direto para a lista de contratos faz perder o contexto de se
aquele mês foi atípico.

**Antes de escalar um número, confira a data da carga.** Está na barra lateral.

**Ao comparar com relatório de fora**, confira três coisas: se conta contrato ou
pessoa, se inclui cancelamento em lote (venda de operação não é churn e fica de
fora daqui), e se a foto é da mesma data — cancelamento do passado é
reclassificado com o tempo, então reprocessar um mês fechado não devolve
exatamente o que foi publicado na época. O rodapé da Assertividade explica as
três.

**Não trate "0 pontos" como "sem problema".** Pode ser indicador sem leitura
para aquele contrato. A tela distingue "sem leitura" de "leitura boa".

**Motivo de cancelamento digitado no atendimento não é dado confiável.** Ele
varia mais entre atendentes do que entre clientes. Use como corroboração,
nunca como causa.

---

## 8. Quando desconfiar da plataforma

Sinais de que o número está errado e alguém precisa olhar:

- Data da última carga **não é de hoje** → o ETL falhou.
- Volume de contratos **mudou muito** de um dia para o outro sem motivo
  comercial.
- Um indicador some da tela de um contrato → normalmente é **falta de leitura**,
  não falta de problema.
- Um número aqui **bate exatamente** com outro que deveria ser diferente →
  suspeite de cache ou de estarem medindo a mesma coisa com nomes diferentes.
- A composição das saídas muda de forma brusca entre meses → verifique se houve
  cancelamento em lote ou mudança de processo no ERP.

Em qualquer um desses casos: **não escale o número antes de confirmar.** É mais
barato perguntar que desdizer numa reunião.
