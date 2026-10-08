# Potência óptica — como o indicador é calculado

> Medições deste documento feitas contra o AutoISP em **08/10/2026**.

## Resposta curta

O número **não é calculado pelo Health Score** e **não vem de screenshot nem de
leitura de tela**. Ele é lido pronto de uma coluna do banco do AutoISP
(`onu_statuses.calculated_rx_power`), que é a potência que a OLT mede chegando
na ONU do cliente, em dBm.

O que o Health Score faz com esse número são três coisas simples: descarta
leitura inválida, escolhe uma ONU quando o contrato tem mais de uma, e encaixa
o valor numa faixa que tem uma nota. Não há modelo, média móvel nem cálculo
estatístico em cima dele.

## Primeiro, um acerto de nome

O indicador chama-se **"Potência óptica (atenuação)"** e mora no canal
**Conexão** (`/engine-conexao`, "Qualidade de CPE e equipamentos"), não no canal
**Rede**.

A confusão é razoável, porque os dois falam de fibra. A divisão é esta:

| Canal | Olha para | Indicadores |
|---|---|---|
| **Rede** | a **planta** — o que é compartilhado entre clientes | massivas, SLA de reparo, Site/POP, OLT, slot, **porta PON**, splitter |
| **Conexão** | o **enlace e o equipamento daquele contrato** | **potência óptica**, distância da fibra, temperatura da ONU, velocidade da porta LAN, RSSI do Wi-Fi, memória e temperatura do CPE, status da ONU |

Regra prática: se o problema atinge o vizinho junto, é Rede; se é só daquela
casa, é Conexão. A potência óptica é da casa.

## E o Int6, entra onde?

A **Int6** é a fornecedora da plataforma AutoISP. O nome aparece no código
porque ela publica chaves TR-069 proprietárias com o prefixo `X_INT6_`.

Mas **a potência óptica não usa nenhuma dessas chaves.** São dois caminhos
diferentes dentro do mesmo AutoISP:

| Caminho | Quem mede | Alimenta |
|---|---|---|
| **GPON / OLT** → `onu_statuses` | a própria OLT, contra a ONU | **potência óptica**, status da ONU, velocidade da porta LAN |
| **TR-069 / ACS** → `acs_device_statuses` (chaves `X_INT6_*`) | o roteador do cliente, reportando sozinho | RSSI do Wi-Fi, memória RAM do CPE, temperatura do CPE |

Então: nenhum cálculo com Int6 do lado óptico. As chaves `X_INT6_RSSI`,
`X_INT6_MEMUSED_PERCENT` e `X_INT6_TEMPERATURE` sustentam os indicadores de
Wi-Fi e de saúde do roteador — que são vizinhos na mesma tela, e provavelmente é
daí que vem a dúvida.

Isso também explica por que a cobertura dos dois é tão diferente: o óptico
depende da OLT (que sempre mede), e o Wi-Fi depende do firmware do roteador
reportar (só ~20% reportam).

## O caminho completo, da OLT até a nota

**1. Origem.** Uma vez por dia, de madrugada (`ETL_HOUR=3`), o ETL abre o banco
do AutoISP e roda a consulta `Q_AUTOISP_ONU_HEALTH`:

```sql
select cs.contract_id::text contract_id,
  os.calculated_rx_power, os.tx_power, os.calculated_status,
  oi.distance, oi.optical_temperature
from onu_statuses os
join gpon_clients gc on gc.id = os.gpon_client_id
join contracted_services cs on cs.id = gc.contracted_service_id
left join onu_infos oi on oi.gpon_client_id = gc.id
where cs.contract_id is not null
```

`onu_statuses` é **foto do estado atual**, não histórico: tem ~1 linha por ONU,
sobrescrita. Então o indicador é sempre "como estava o enlace na madrugada de
hoje" — ele não tem memória de ontem.

A consulta varre a base inteira (221 mil ONUs) de propósito, sem filtrar por
contrato: filtrar por `contract_id = any($1)` obriga o planner a varrer
`contracts` + `contracted_services` a cada execução e sai ~5x mais caro.

**2. Descarte de leitura inválida.** Só entra valor entre **−5 e −40 dBm**:

```js
const rx = rx0 != null && rx0 <= -5 && rx0 >= -40 ? rx0 : null
```

Isso não é capricho. O AutoISP guarda **11.181 linhas com potência acima de
−5 dBm** (a maioria entre −9 e 0, mais os zeros). Em GPON isso é fisicamente
implausível na ponta do cliente — é ONU sem leitura gravando o campo. Se
entrassem, virariam "atenuação ótima" e dariam nota cheia justamente a quem o
sistema não consegue medir. Abaixo de −40 dBm não há nenhuma linha hoje; o corte
está lá por segurança.

**3. Contrato com mais de uma ONU: fica a pior.** 4.225 contratos (~2%) têm duas
ou mais ONUs em `contracted_services` distintos. Sem critério, a última linha
lida ganhava e a nota do cliente dependia da ordem do banco. A regra é ficar com
a leitura **mais negativa**:

```js
const pior = c.connRxPower == null || (rx != null && rx < c.connRxPower)
```

Pior enlace, porque é ele que explica a reclamação e é ele que limita o cliente.
(Para distância e temperatura a mesma lógica vira `max`; para velocidade de LAN
vira `max` também, mas ali o maior é o melhor — é a melhor porta disponível.)

**4. Faixa.** O bucket roda sobre o **valor absoluto**, só para a escala ficar
crescente — −27 dBm vira 27. Daí sai a faixa:

| Faixa | Potência | Nota padrão |
|---|---|---|
| Boa | ≥ −24 dBm | 0 |
| Atenção | −24 a −26 dBm | −5 |
| Ruim | −26 a −28 dBm | −15 |
| Crítica | −28 a −30 dBm | −25 |
| No limite | < −30 dBm | −40 |

Os cortes seguem a referência de GPON: acima de −24 dBm o enlace está folgado;
abaixo de −28 começa a errar pacote; abaixo de −30 está no limite de
sensibilidade da ONU.

**5. Nota.** O cliente começa com 100 no canal Conexão e cada indicador soma a
sua faixa. A potência óptica contribui com um único número — o da tabela acima.
Não há peso, multiplicador nem normalização: a nota da faixa é somada direto.

As notas são **editáveis na tela** (Conexão → Configuração), então os valores
acima são o padrão do código, não uma constante do sistema.

## "Sem leitura" não é sinal bom

É a decisão mais importante do indicador. Quando não há leitura válida, a chave
da faixa sai **vazia** e o indicador **não pontua** — nem a favor, nem contra. Na
tela do cliente aparece `Sem leitura`.

Antes disso, cliente sem leitura e cliente com sinal excelente se confundiam num
zero. Hoje são coisas distintas: um não tem nota porque está bom, o outro não tem
nota porque não sabemos.

## O que a base mostra hoje

**Cobertura** — de 221.195 ONUs com contrato:

| | Linhas | % |
|---|---|---|
| Com algum valor gravado | 95.456 | 43,2% |
| **Com leitura válida (−5 a −40)** | **84.275** | **38,1%** |
| Descartadas por estarem acima de −5 | 11.181 | 5,1% |
| Descartadas por estarem abaixo de −40 | 0 | 0% |

Ou seja: **pouco menos de 4 em cada 10 contratos têm potência óptica
pontuando.** Os outros 6 aparecem como "Sem leitura".

**Distribuição** — dos 84.150 contratos com leitura válida:

| Faixa | Contratos | % |
|---|---|---|
| Boa (≥ −24) | 80.424 | 95,6% |
| Atenção (−24 a −26) | 2.455 | 2,9% |
| Ruim (−26 a −28) | 738 | 0,9% |
| Crítica (−28 a −30) | 383 | 0,5% |
| No limite (< −30) | 150 | 0,2% |

## Três coisas para saber antes de usar o número

**O indicador marca quase ninguém.** Só **1,5% dos contratos com leitura** (1.271
contratos) caem em ruim, crítica ou no limite — 0,6% da base toda. Como
diagnóstico de planta isso é ótima notícia. Como variável de churn, significa que
ele quase não move a nota de ninguém: para efeito de comparação, o RSSI do Wi-Fi
marca 10–15%. Se a intenção for que a potência óptica discrimine risco, os cortes
precisam ser recalibrados contra cancelamento real, não contra a referência de
GPON.

**É uma foto, não uma série.** A potência da madrugada de hoje não diz se o
enlace vinha degradando há três semanas — e degradação progressiva é justamente o
padrão que antecede reclamação. Guardar o histórico diário de `calculated_rx_power`
é o que destravaria isso.

**`tx_power` é lido e jogado fora.** A consulta traz a potência transmitida, mas
nada no ETL a usa. Comparar Rx com Tx é o que separa "fibra ruim no cliente" de
"porta PON ruim na OLT" — fica como oportunidade, não como defeito.

## Onde cada coisa mora no código

| O quê | Arquivo |
|---|---|
| Consulta ao AutoISP | [scripts/queries/registry.mjs:723-739](../scripts/queries/registry.mjs#L723-L739) (`Q_AUTOISP_ONU_HEALTH`) |
| Descarte e regra do pior sinal | [scripts/fetch-clients.mjs:328-350](../scripts/fetch-clients.mjs#L328-L350) |
| Faixas e notas padrão | [src/features/connection-engine/connectionConfig.ts:49-55](../src/features/connection-engine/connectionConfig.ts#L49-L55) (`RX_POWER_RANGES`) |
| Encaixe na faixa | [src/features/connection-engine/connectionEngine.ts:28](../src/features/connection-engine/connectionEngine.ts#L28) (`linkKeysOf`) |
| Exibição na tela do cliente | [src/features/connection-engine/connectionEngine.ts:105](../src/features/connection-engine/connectionEngine.ts#L105) |
