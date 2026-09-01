# Previsão de Cancelamento — como a conta é feita

> Tela: `/previsao-cancelamento` · Código: [`server/churnForecast.mjs`](../server/churnForecast.mjs) (núcleo puro, testável) + `POST /api/churn-forecast` em [`server/index.mjs`](../server/index.mjs) · Front: [`src/features/churn-forecast/`](../src/features/churn-forecast/)

## A ideia em uma frase

Não inventamos o prazo. Olhamos para **quem já cancelou** com o mesmo perfil de risco e o mesmo tempo de casa deste cliente, e perguntamos: *"quanto tempo a mais, em média, essas pessoas ainda duraram?"*. Essa é a janela.

É uma **faixa de risco estatística**, ancorada em dados reais — não uma data garantida, e não algo que uma IA "adivinha".

## Passo a passo do cálculo

### 1. Pontuar todo mundo e agrupar em bandas de risco

Ativos e cancelados são pontuados com a **mesma régua** (a config oficial de pesos + limiares, via `scoreAllClients`). Cada cliente vira um Health Score (0–100) e cai numa banda: `crítico`, `alto risco`, `atenção`, `saudável`, `excelente`.

A previsão só olha as bandas **em risco** (`crítico`, `alto risco`, `atenção`). Saudável/excelente nunca entram na lista.

### 2. Dos cancelados, quanto tempo cada um durou

Para cada **cancelado**, calculamos o tempo de vida até o cancelamento:

```
tenure_cancelado = cancellationDate − contractDate   (em dias)
```

Agrupamos esses tempos **por banda** e ordenamos. Isso vira, por banda, a curva de "em que ponto da vida do contrato esse perfil costuma cancelar" — guardamos os percentis **p25 / mediana (p50) / p75**.

### 3. Para cada ativo em risco, a janela a partir de HOJE

Para um cliente ativo na banda B, calculamos há quanto tempo ele é cliente:

```
T = hoje − contractDate
```

**O detalhe que faz a estimativa ser justa (e "pra frente"):** só comparamos com cancelados que sobreviveram **pelo menos T dias**. Se o cliente já dura 100 dias, não faz sentido compará-lo com quem cancelou aos 30 — esses já "saíram" antes dele. Olhamos só quem chegou até onde ele está, e vemos quanto tempo a mais eles ainda duraram:

```
windowMedianDays = mediana(sobreviventes) − T
windowP25Days    = p25(sobreviventes) − T
windowP75Days    = p75(sobreviventes) − T
```

(tudo com piso em 0). A **confiança** é o tamanho desse grupo de sobreviventes (`sampleN`).

### 4. Fallback e filtros

Se há poucos sobreviventes (`< 8` — `MIN_SUFFIX`), a conta condicional fica frágil demais e caímos num fallback: `mediana da banda inteira − T`. Se o cliente já ultrapassou até essa mediana incondicional, o sinal de tempo é fraco demais e **ele não entra na lista** (não dá pra cravar prazo).

Filtros de cidade e classificação (escolhidos na tela) escopam a lista antes do ranking.

### 5. O ranking

Ordenado por **menor janela primeiro** (mais urgente no topo); empate → pior health; empate → maior mensalidade. Corta no `topN` escolhido na tela (50 a 1000).

### Exemplo numérico

Banda **Alto Risco**: cancelados duraram `20, 40, 60, …, 400` dias → p25=120, mediana=220, p75=300.

Cliente ativo de Alto Risco com **T = 100 dias**:
- Sobreviventes (tenure ≥ 100) → 16 cancelados (`sampleN = 16`).
- Mediana desses = 260 → **janela ≈ 260 − 100 = 160 dias**.
- Faixa: p25 → 80 dias; p75 → 220 dias.

Tela mostra: *"estimativa de cancelamento em ~5 meses (faixa 80–220 dias), confiança média (16 casos)"*.

## Onde a config e a "IA" entram

- O health/banda de cada cliente vem da **config oficial** (pesos + limiares). Mudar pesos muda a banda → muda a janela.
- A narrativa (*"os sinais que mais pesam… priorize contato…"*) é **determinística** — texto montado a partir dos sinais e da janela, com efeito de digitação. **O número vem sempre da estatística**; a IA só narra, nunca inventa o prazo.

---

## Por que as janelas tendem a ficar longas (vários meses)

Medimos diretamente na base (não é teoria) e o motivo é a combinação de dois fatos:

**1. A distribuição de "tempo até cancelar" é muito assimétrica — cauda longa.** Amostra medida (banco de produção, snapshot local):

| Banda | p25 | mediana | p75 |
|---|---:|---:|---:|
| Atenção | 84 dias | 255 dias | 613 dias |
| Alto Risco | 93 dias | 267 dias | 674 dias |
| Crítico | 83 dias | 227 dias | 641 dias |

Metade dos cancelamentos de cada perfil acontece rápido; a outra metade se estica por muito mais tempo (a cauda chega perto de 2 anos).

**2. Os ativos que entram na lista já sobreviveram bastante.** Medimos: o cliente ativo "em risco" **mediano já está no percentil ~73%** da distribuição de cancelamento do próprio perfil — ou seja, já durou mais que 73% de quem cancelou naquela banda.

**Por quê:** sinais de risco (faturas atrasadas acumuladas, SLA estourado, ameaça de cancelamento registrada) **levam tempo para se acumular**. Um cliente raramente vira "Crítico" na primeira semana — ele precisa ter tido vários eventos ao longo do tempo. Por isso, quem está "em risco" e ainda ativo já é, estruturalmente, um cliente de tenure alto.

**A combinação:** como a regra só compara com quem sobreviveu pelo menos T dias, e T já está no percentil ~73%, a conta está olhando **só a cauda fina e longa** da distribuição — e cauda longa dá janela longa. É uma consequência **matemática correta** do método, não um erro.

### Limitação honesta

O método usa **só quem cancelou** — não é um modelo de sobrevivência formal (tipo Kaplan-Meier), que também contaria os ativos que já sobreviveram além de T e **nunca** cancelaram (os "censurados"). Isso tende a deixar a estimativa **conservadora/puxada para cima**, e a confiança na cauda mais distante é mais fina (o piso de 8 casos é baixo para essa região).

Se no futuro os números precisarem ficar mais "apertados"/acionáveis no curto prazo, o caminho correto é migrar para uma curva de sobrevivência que inclua os ativos como censurados — um trabalho maior, deixado como possível evolução.

## O que o número É e o que NÃO é

- **É**: uma faixa de risco estatística (mediana + p25–p75), ancorada em dados reais de quem já cancelou com o mesmo perfil.
- **NÃO é**: uma data garantida, nem um modelo formal de sobrevivência (sem censura), nem algo gerado por um LLM.
