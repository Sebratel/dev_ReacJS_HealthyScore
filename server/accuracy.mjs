// ─────────────────────────────────────────────────────────────────────────
// Assertividade do Health Score: dos clientes que cancelaram, quantos a
// plataforma JÁ SINALIZAVA como risco antes de saírem?
//
// O ponto delicado é não medir errado. Pontuar hoje um cliente já cancelado
// usaria dados que só existem PORQUE ele cancelou (faturas em aberto que se
// acumularam, protocolo de retirada de equipamento, quedas depois do corte) —
// o número sairia ótimo e não significaria nada. Isso é vazamento de alvo.
//
// Por isso a medição usa exclusivamente o HISTÓRICO congelado
// (scripts/score-history.mjs): tomamos a foto de uma data passada, ficamos só
// com quem estava ATIVO ali, e perguntamos quem cancelou DEPOIS. A nota usada
// é a que existia antes do desfecho — que é a única pergunta honesta.
//
// Sem histórico gravado não há resposta possível: o endpoint devolve
// `available: false` em vez de inventar um número a partir do estado atual.
// ─────────────────────────────────────────────────────────────────────────
import { getHistoryIndex } from './scoreHistory.mjs'
import { getDataset } from './dataset.mjs'
import { motiveGroupOf, MOTIVE_GROUP_ORDER, MOTIVE_GROUP_LABEL } from '../src/features/cancellation-profiles/cancellationMotive.ts'

// "Sinalizado" = o que a tela mostra em vermelho/laranja e manda agir.
const FLAGGED = new Set(['critical', 'high_risk'])
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))

// Intervalo de Wilson (95%) — com dezenas de eventos, a margem é grande e
// esconder isso convida a decidir em cima de ruído.
function wilson95(hits, n) {
  if (!n) return null
  const z = 1.96
  const p = hits / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { low: round(100 * ((c - s) / d)), high: round(100 * ((c + s) / d)) }
}

function medirPonto(asOf, index, canceladosDepois, todosCancelados) {
  // Coorte: quem estava ativo E pontuado naquela data.
  const coorte = []
  for (const [id, serie] of index) {
    const ponto = serie.find((p) => p.date === asOf)
    if (!ponto || ponto.cancelled) continue
    coorte.push({ id, cls: ponto.classification, overall: ponto.overall })
  }
  if (!coorte.length) return null

  const sinalizadosBase = coorte.filter((c) => FLAGGED.has(c.cls)).length
  const taxaSinalizada = sinalizadosBase / coorte.length

  const eventos = []
  for (const c of coorte) {
    const canc = canceladosDepois.get(c.id)
    if (!canc) continue
    eventos.push({ ...c, data: canc.cancellationDate, grupo: motiveGroupOf(canc.cancellationMotive, canc.cancellationCode), mrr: canc.monthlyValue || 0 })
  }

  const resumo = (rows) => {
    const n = rows.length
    const pegos = rows.filter((r) => FLAGGED.has(r.cls)).length
    const recall = n ? (100 * pegos) / n : null
    return {
      cancelados: n,
      sinalizados: pegos,
      recall: round(recall),
      // Lift: quantas vezes o recall supera o tamanho do balde. 1,0 = o mesmo
      // que sortear ao acaso; abaixo de 1,0 o sinal está atrapalhando.
      lift: n && taxaSinalizada ? round(recall / (100 * taxaSinalizada), 2) : null,
      ic95: wilson95(pegos, n),
      mrr: round(rows.reduce((a, r) => a + r.mrr, 0), 2),
    }
  }

  // O grupo "não chegou a instalar" fica FORA do número principal: são vendas
  // que morreram antes da instalação, nunca foram clientes, e não há sinal de
  // saúde a captar neles. Mantido no detalhe por transparência.
  const real = eventos.filter((e) => e.grupo !== 'preInstall')
  const geral = resumo(real)

  // "Em que mês eles saíram?" — sem isso o card mostra um total sem tempo, e
  // 114 saídas concentradas em dois meses é notícia muito diferente de 114
  // espalhadas por um ano. Também deixa ver se a saída vem logo após o alerta.
  const meses = new Map()
  for (const e of real) {
    if (!e.data) continue
    const mes = String(e.data).slice(0, 7)
    let m = meses.get(mes)
    if (!m) { m = { mes, cancelados: 0, sinalizados: 0, porCls: {} }; meses.set(mes, m) }
    m.cancelados++
    if (FLAGGED.has(e.cls)) m.sinalizados++
    m.porCls[e.cls] = (m.porCls[e.cls] || 0) + 1
  }
  const porMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes))

  return {
    porMes,
    asOf,
    coorte: coorte.length,
    sinalizadosNaBase: sinalizadosBase,
    taxaSinalizada: round(100 * taxaSinalizada),
    taxaCancelamento: round((100 * real.length) / coorte.length, 2),
    ...geral,
    // Precisão: dos que a plataforma sinalizou, quantos de fato saíram.
    precisao: sinalizadosBase ? round((100 * geral.sinalizados) / sinalizadosBase, 1) : null,
    porGrupo: MOTIVE_GROUP_ORDER
      .map((g) => ({ grupo: g, label: MOTIVE_GROUP_LABEL[g], ...resumo(eventos.filter((e) => e.grupo === g)) }))
      .filter((x) => x.cancelados > 0),
    porClassificacao: ['critical', 'high_risk', 'attention', 'healthy', 'excellent'].map((cls) => {
      const naBase = coorte.filter((c) => c.cls === cls).length
      const sairam = real.filter((e) => e.cls === cls).length
      return { classificacao: cls, naBase, cancelaram: sairam, taxa: naBase ? round((100 * sairam) / naBase, 2) : null }
    }),
    // Guardado para a UI poder dizer "ainda são poucos casos".
    totalCanceladosNoPeriodo: todosCancelados,
  }
}

export function computeAccuracy() {
  const { index, dates } = getHistoryIndex()
  const ds = getDataset()
  if (!dates.length) {
    return { available: false, reason: 'Nenhum ponto de histórico gravado ainda. O indicador depende de notas congeladas ANTES do cancelamento — rode scripts/score-history.mjs.', points: [] }
  }
  if (!ds?.cancelledClients?.length) {
    return { available: false, reason: 'Snapshot sem a coorte de cancelados.', points: [] }
  }

  const cancelados = ds.cancelledClients.filter((c) => c.cancellationDate)
  const pontos = []
  for (const asOf of dates) {
    const depois = new Map()
    let total = 0
    for (const c of cancelados) {
      if (c.cancellationDate > asOf) { depois.set(String(c.clientId), c); total++ }
    }
    const m = medirPonto(asOf, index, depois, total)
    if (m && m.cancelados > 0) pontos.push(m)
  }

  if (!pontos.length) {
    return {
      available: false,
      reason: `Há ${dates.length} ponto(s) de histórico (${dates[0]}..${dates[dates.length - 1]}), mas nenhum cliente da coorte cancelou depois — ainda não dá para medir. Volte quando houver mais tempo decorrido.`,
      points: [],
    }
  }

  // O ponto MAIS ANTIGO é o que tem mais tempo de acompanhamento, então é o
  // mais informativo; os demais entram para mostrar a evolução.
  const principal = pontos[0]
  // A janela termina onde os DADOS terminam, não hoje. Usar `new Date()` aqui
  // inflava o período sempre que o ETL atrasava: o card dizia "53 dias" quando
  // o snapshot só enxergava cancelamentos até 40 dias atrás — e a taxa saía
  // dividida por um tempo de exposição que não existiu.
  const observadoAte = ds.meta?.generatedAt
    ? String(ds.meta.generatedAt).slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  const diasAcompanhados = Math.round((new Date(observadoAte) - new Date(principal.asOf)) / 864e5)
  return {
    available: true,
    principal: { ...principal, diasAcompanhados, observadoAte },
    points: pontos,
    datasHistorico: dates,
    observadoAte,
    snapshotCoverage: ds.meta?.coverage ?? null,
  }
}
