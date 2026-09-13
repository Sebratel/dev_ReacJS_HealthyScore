// ─────────────────────────────────────────────────────────────────────────
// Coorte mensal — núcleo puro (sem banco, sem I/O), para ser testável.
//
// A pergunta que isto responde, mês a mês:
//   "No último dia do mês M, quantas conexões e quantos contratos existiam,
//    que nota cada contrato tinha, e quem saiu no mês seguinte?"
//
// Duas decisões de medição valem explicação, porque mudam o número:
//
// 1. O EVENTO É O CANCELAMENTO DE CONTRATO, não a saída de conexão. Contrato
//    tem identidade — junta com score, motivo, MRR e tempo de casa — e
//    reconstrói para qualquer data. A conexão só existe agregada (snapshot
//    diário por cidade/bairro), então serve de denominador operacional ao
//    lado, nunca de evento. As duas séries andam ~2% afastadas de forma
//    estável: contrato existe sem conexão provisionada (suspenso, bloqueado,
//    sem registro de autenticação).
//
// 2. A JANELA DE DESFECHO É FECHADA (o mês seguinte inteiro), não "até hoje".
//    Janela aberta faz o mês antigo parecer pior que o recente só porque teve
//    mais tempo de exposição — e aí a série vira uma rampa que não significa
//    nada. Com janela fixa, os meses são comparáveis entre si.
// ─────────────────────────────────────────────────────────────────────────

export const CLASSES = ['critical', 'high_risk', 'attention', 'healthy', 'excellent']
// "Sinalizado" = o que a tela pinta de vermelho/laranja e manda agir.
const FLAGGED = new Set(['critical', 'high_risk'])

// Mínimo de engines que precisam ter pontuado para o contrato entrar na conta.
// 2 = a comercial (que roda para todos) mais pelo menos um sinal de
// comportamento — financeiro, protocolo, equipamento. Ver pontoMensal().
export const MIN_ENGINES = 2

const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))

// Último dia do mês de uma data 'YYYY-MM' (sem fuso: tudo em UTC e string).
export function fimDoMes(ym) {
  const [a, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

// Lista de meses 'YYYY-MM' entre dois meses, inclusive.
export function mesesEntre(de, ate) {
  const out = []
  let [a, m] = de.split('-').map(Number)
  const [af, mf] = ate.split('-').map(Number)
  while (a < af || (a === af && m <= mf)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; a++ }
  }
  return out
}

// Intervalo de Wilson (95%). Com poucas dezenas de eventos a margem é larga, e
// esconder isso convida a decidir em cima de ruído.
export function wilson95(hits, n) {
  if (!n) return null
  const z = 1.96
  const p = hits / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { low: round(100 * ((c - s) / d), 1), high: round(100 * ((c + s) / d), 1) }
}

/**
 * Monta UM ponto mensal.
 *
 * @param {string} mes            'YYYY-MM' do mês medido
 * @param {Array}  scored         [{ clientId, contractNumber, classification, enginesPresent }]
 *                                — a base pontuada no ÚLTIMO DIA de `mes`
 * @param {Map}    cancelDepois   contractNumber -> { cancellationDate, code, mrr }
 *                                — cancelamentos ocorridos na janela de desfecho
 * @param {number|null} conexoes  conexões provisionadas no último dia do mês
 */
export function pontoMensal({ mes, scored, cancelDepois, conexoes = null, janelaDesfecho, minEngines = MIN_ENGINES }) {
  // Contrato pontuado por UMA engine só não tem nota — tem palpite. Na prática
  // é sempre a comercial (plano, vendedor, tempo de casa), que roda para todo
  // mundo e, sozinha, joga quase todos em "excelente". Incluir esses contratos
  // infla a base saudável e faz a separação entre faixas parecer melhor do que
  // é. Ficam FORA das taxas e contados à parte, para não sumirem da vista.
  const avaliaveis = scored.filter((s) => (s.enginesPresent ?? 0) >= minEngines)
  const semSinal = scored.length - avaliaveis.length
  let cancelSemSinal = 0
  for (const s of scored) {
    if ((s.enginesPresent ?? 0) >= minEngines) continue
    if (cancelDepois.get(s.contractNumber)) cancelSemSinal++
  }

  const base = avaliaveis.length
  const porClasse = new Map(CLASSES.map((c) => [c, { naBase: 0, cancelaram: 0, mrrPerdido: 0 }]))

  let sinalizadosNaBase = 0
  let cancelados = 0
  let cancelSinalizados = 0
  let mrrPerdido = 0

  for (const s of avaliaveis) {
    const cls = s.classification
    const linha = porClasse.get(cls)
    if (linha) linha.naBase++
    const flag = FLAGGED.has(cls)
    if (flag) sinalizadosNaBase++

    const saiu = cancelDepois.get(s.contractNumber)
    if (!saiu) continue
    cancelados++
    mrrPerdido += saiu.mrr || 0
    if (linha) { linha.cancelaram++; linha.mrrPerdido += saiu.mrr || 0 }
    if (flag) cancelSinalizados++
  }

  const taxaBase = base ? (100 * cancelados) / base : null
  const taxaSinalizada = base ? (100 * sinalizadosNaBase) / base : null
  const recall = cancelados ? (100 * cancelSinalizados) / cancelados : null

  return {
    mes,
    fimDoMes: fimDoMes(mes),
    janelaDesfecho,
    // Denominadores lado a lado: conexão é o número que a operação reconhece,
    // contrato é o que tem identidade. Divergem ~2% e isso é esperado.
    conexoes,
    contratosAtivos: base,
    // Transparência da exclusão: quantos ficaram de fora por não ter sinal
    // suficiente, e quantos DESSES cancelaram. Se o segundo número for alto, a
    // cobertura do score está ruim e a taxa acima está medindo pouca gente.
    semSinalSuficiente: semSinal,
    cancelamentosSemSinal: cancelSemSinal,
    minEngines,
    cancelamentos: cancelados,
    taxaCancelamento: round(taxaBase),
    mrrPerdido: round(mrrPerdido),
    sinalizadosNaBase,
    taxaSinalizada: round(taxaSinalizada),
    // Cobertura: dos que saíram, quantos já estavam marcados.
    recall: round(recall, 1),
    // Lift: quantas vezes a cobertura supera o tamanho do balde de alerta.
    // 1,0 = o mesmo que sortear ao acaso.
    lift: recall != null && taxaSinalizada ? round(recall / taxaSinalizada, 2) : null,
    ic95: wilson95(cancelSinalizados, cancelados),
    porClassificacao: CLASSES.map((cls) => {
      const l = porClasse.get(cls)
      return {
        classificacao: cls,
        naBase: l.naBase,
        cancelaram: l.cancelaram,
        taxa: l.naBase ? round((100 * l.cancelaram) / l.naBase) : null,
        mrrPerdido: round(l.mrrPerdido),
      }
    }),
  }
}

/**
 * Série mensal completa + leitura agregada.
 * `pontos` já vem de pontoMensal(), em ordem cronológica.
 */
export function resumirSerie(pontos) {
  const comDesfecho = pontos.filter((p) => p.cancelamentos > 0)
  if (!comDesfecho.length) return { pontos, resumo: null }

  const somaCancel = comDesfecho.reduce((a, p) => a + p.cancelamentos, 0)
  const somaSinal = comDesfecho.reduce((a, p) => a + Math.round(((p.recall ?? 0) / 100) * p.cancelamentos), 0)
  const somaBase = comDesfecho.reduce((a, p) => a + p.contratosAtivos, 0)

  // O gradiente médio é a leitura que mais importa: a nota ORDENA risco?
  // Somamos numerador e denominador entre os meses em vez de tirar média das
  // taxas — média de taxa dá peso igual a mês grande e mês pequeno.
  const grad = CLASSES.map((cls) => {
    let naBase = 0
    let cancelaram = 0
    for (const p of comDesfecho) {
      const l = p.porClassificacao.find((x) => x.classificacao === cls)
      if (!l) continue
      naBase += l.naBase
      cancelaram += l.cancelaram
    }
    return { classificacao: cls, naBase, cancelaram, taxa: naBase ? round((100 * cancelaram) / naBase) : null }
  })

  const critico = grad.find((g) => g.classificacao === 'critical')?.taxa ?? null
  const excelente = grad.find((g) => g.classificacao === 'excellent')?.taxa ?? null

  return {
    pontos,
    resumo: {
      meses: comDesfecho.length,
      primeiroMes: comDesfecho[0].mes,
      ultimoMes: comDesfecho[comDesfecho.length - 1].mes,
      cancelamentos: somaCancel,
      taxaMedia: somaBase ? round((100 * somaCancel) / somaBase) : null,
      recallMedio: somaCancel ? round((100 * somaSinal) / somaCancel, 1) : null,
      porClassificacao: grad,
      // Quantas vezes o pior balde cancela mais que o melhor. É o número que
      // diz se a nota serve para priorizar — separação alta com recall baixo
      // ainda é um score útil, só cobre pouca gente.
      separacao: critico && excelente ? round(critico / excelente, 1) : null,
    },
  }
}
