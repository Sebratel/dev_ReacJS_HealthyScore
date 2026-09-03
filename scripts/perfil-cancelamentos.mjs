// ─────────────────────────────────────────────────────────────────────────
// Perfil dos cancelamentos de um mês → arquivo Markdown, para alimentar a
// construção de personas.
//
// Lê o snapshot materializado (o mesmo que a api consome) e descreve quem
// cancelou, SEPARADO POR GRUPO DE MOTIVO — sem separar, o perfil vira uma
// média de coisas incomparáveis (ver src/.../cancellationMotive.ts).
//
// Uso:  node --import tsx scripts/perfil-cancelamentos.mjs [YYYY-MM] [saida.md]
//       sem argumento → mês anterior ao de hoje
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { motiveGroupOf, MOTIVE_GROUP_ORDER, MOTIVE_GROUP_LABEL, MOTIVE_GROUP_HINT } from '../src/features/cancellation-profiles/cancellationMotive.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = process.env.SNAPSHOT_PATH ? resolve(process.env.SNAPSHOT_PATH) : resolve(__dirname, '../public/realClients.data')

const argMes = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : null
const MES = argMes ?? (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 7) })()
const OUT = resolve(process.argv[3] || join(__dirname, `../perfil-cancelamentos-${MES}.md`))

const snap = JSON.parse(gunzipSync(readFileSync(SNAPSHOT)).toString('utf8'))
const todos = (snap.cancelledClients || []).filter((c) => c.cancellationDate)
const mes = todos.filter((c) => c.cancellationDate.slice(0, 7) === MES)
if (!mes.length) { console.error(`Nenhum cancelamento em ${MES}. Meses disponíveis: ${[...new Set(todos.map((c) => c.cancellationDate.slice(0, 7)))].sort().slice(-6).join(', ')}`); process.exit(1) }

// ─── Estatística descritiva ────────────────────────────────────
const num = (arr) => arr.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b)
const mediana = (arr) => { const a = num(arr); return a.length ? a[Math.floor(a.length / 2)] : null }
const media = (arr) => { const a = num(arr); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null }
const pct = (n, t) => (t ? `${((100 * n) / t).toFixed(1)}%` : '—')
const brl = (v) => `R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const n0 = (v) => (v ?? 0).toLocaleString('pt-BR')
const f1 = (v) => (v == null ? '—' : v.toFixed(1))

const diasAte = (c) => (c.contractDate && c.contractDate > '1900-01-01' ? Math.round((new Date(c.cancellationDate) - new Date(c.contractDate)) / 864e5) : null)
const idade = (c) => (c.clientBirth && c.clientBirth > '1900-01-01' ? Math.floor((new Date(c.cancellationDate) - new Date(c.clientBirth)) / (365.25 * 864e5)) : null)

// Top-N de um atributo categórico, com percentual sobre o grupo.
function top(rows, pick, n = 8) {
  const m = new Map()
  for (const r of rows) {
    const vs = pick(r)
    for (const v of (Array.isArray(vs) ? vs : [vs])) {
      const k = (v ?? '').toString().trim()
      if (!k) continue
      m.set(k, (m.get(k) || 0) + 1)
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([valor, qtd]) => ({ valor, qtd, pct: pct(qtd, rows.length) }))
}

const tabela = (cab, linhas) => [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`, ...linhas.map((l) => `| ${l.join(' | ')} |`)].join('\n')
const listaTop = (rows, pick, titulo, n = 8) => {
  const t = top(rows, pick, n)
  if (!t.length) return `**${titulo}:** sem dado.\n`
  return `**${titulo}**\n\n${tabela(['Valor', 'Clientes', '% do grupo'], t.map((x) => [x.valor, n0(x.qtd), x.pct]))}\n`
}

// ─── Bloco de perfil de um conjunto de clientes ────────────────
// Percentis, não "quantos têm > 0": indicadores como protocolCount estão
// SATURADOS na coorte (todo contrato gera pelo menos o protocolo de
// instalação, então "abriu protocolo" dá 100% em todos os grupos e não
// discrimina nada). O que separa os grupos é o VOLUME, não a presença.
const pctl = (arr, p) => { const a = num(arr); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null }
const totalQuedas = (c) => Object.values(c.onuStatusCounts || {}).reduce((a, b) => a + (b || 0), 0)

function perfil(rows) {
  const mrr = rows.reduce((a, c) => a + (c.monthlyValue || 0), 0)
  const comFatura = rows.filter((c) => (c.totalInvoices || 0) > 0)
  const taxaAtraso = comFatura.length
    ? media(comFatura.map((c) => (100 * ((c.lateInvoices || 0) + (c.overdueInvoices || 0))) / c.totalInvoices))
    : null
  return {
    n: rows.length,
    mrr,
    ticket: media(rows.map((c) => c.monthlyValue)),
    ticketMed: mediana(rows.map((c) => c.monthlyValue)),
    tenure: mediana(rows.map(diasAte)),
    tenureMedia: media(rows.map(diasAte)),
    idade: mediana(rows.map(idade)),
    semFatura: rows.filter((c) => !(c.totalInvoices > 0)).length,
    taxaAtraso,
    reneg: rows.filter((c) => (c.renegotiations || 0) > 0).length,
    confianca: rows.filter((c) => (c.trustReleases || 0) > 0).length,
    // Volume de atendimento — mediana e p90.
    protMed: mediana(rows.map((c) => c.protocolCount || 0)),
    protP90: pctl(rows.map((c) => c.protocolCount || 0), 0.9),
    relMed: mediana(rows.map((c) => c.relProtocolCount || 0)),
    relP90: pctl(rows.map((c) => c.relProtocolCount || 0), 0.9),
    slaMed: mediana(rows.map((c) => c.slaLateCount || 0)),
    slaP90: pctl(rows.map((c) => c.slaLateCount || 0), 0.9),
    quedasMed: mediana(rows.map(totalQuedas)),
    quedasP90: pctl(rows.map(totalQuedas), 0.9),
    ameaca: rows.filter((c) => (c.relCancelThreats || 0) > 0).length,
    instSla: rows.filter((c) => (c.installSlaLateCount || 0) > 0).length,
    massiva: rows.filter((c) => (c.netMassiveCount || 0) > 0).length,
    massivaMedia: media(rows.filter((c) => c.netMassiveCount > 0).map((c) => c.netMassiveCount)),
    equip: rows.filter((c) => (c.equipment || []).length > 0).length,
    retirada: rows.filter((c) => (c.wdProtocols || 0) > 0).length,
    recuperado: rows.filter((c) => c.wdRecovered).length,
  }
}

// Base ativa do snapshot: referência para dizer se um número é alto ou normal.
const ativos = snap.clients || []
const REF = ativos.length ? perfil(ativos) : null
const vsRef = (v, ref) => {
  if (v == null || ref == null || !REF) return '—'
  if (!ref) return v > 0 ? 'mediana 0 na base ativa' : '—'
  const r = v / ref
  return `${ref} na base ativa · ${r >= 1 ? `${r.toFixed(1)}x` : `${(1 / r).toFixed(1)}x menos`}`
}

function blocoPerfil(rows, titulo, hint) {
  const p = perfil(rows)
  const L = []
  L.push(`### ${titulo}`)
  if (hint) L.push(`> ${hint}`)
  L.push('')
  L.push(tabela(['Indicador', 'Valor', 'Referência'], [
    ['Clientes', `**${n0(p.n)}** (${pct(p.n, mes.length)} do mês)`, '—'],
    ['MRR perdido', `**${brl(p.mrr)}**`, '—'],
    ['Ticket médio / mediano', `${brl(p.ticket)} / ${brl(p.ticketMed)}`, REF ? brl(REF.ticket) + ' na base ativa' : '—'],
    ['Tempo de casa (mediana)', p.tenure == null ? '—' : `**${n0(p.tenure)} dias** (${(p.tenure / 30.44).toFixed(1)} meses)`, '—'],
    ['Idade mediana', p.idade == null ? '—' : `${p.idade} anos`, REF?.idade ? `${REF.idade} anos` : '—'],
    ['Sem nenhuma fatura emitida', `${n0(p.semFatura)} (${pct(p.semFatura, p.n)})`, '—'],
    ['% de faturas em atraso/aberto', p.taxaAtraso == null ? '—' : `**${f1(p.taxaAtraso)}%**`, REF?.taxaAtraso == null ? '—' : `${f1(REF.taxaAtraso)}% na base ativa`],
    ['Já renegociou', `${n0(p.reneg)} (${pct(p.reneg, p.n)})`, REF ? pct(REF.reneg, REF.n) + ' na base ativa' : '—'],
    ['Já teve liberação por confiança', `${n0(p.confianca)} (${pct(p.confianca, p.n)})`, REF ? pct(REF.confianca, REF.n) + ' na base ativa' : '—'],
    ['Protocolos de manutenção (mediana / p90)', `**${p.protMed} / ${p.protP90}**`, vsRef(p.protMed, REF?.protMed)],
    ['SLA de manutenção estourado (mediana / p90)', `${p.slaMed} / ${p.slaP90}`, vsRef(p.slaMed, REF?.slaMed)],
    ['Protocolos de relacionamento (mediana / p90)', `${p.relMed} / ${p.relP90}`, vsRef(p.relMed, REF?.relMed)],
    ['Eventos de ONU no período (mediana / p90)', `${p.quedasMed} / ${p.quedasP90}`, vsRef(p.quedasMed, REF?.quedasMed)],
    ['**Ameaçou cancelar antes**', `**${n0(p.ameaca)} (${pct(p.ameaca, p.n)})**`, REF ? pct(REF.ameaca, REF.n) + ' na base ativa' : '—'],
    ['Teve SLA de instalação estourado', `${n0(p.instSla)} (${pct(p.instSla, p.n)})`, REF ? pct(REF.instSla, REF.n) + ' na base ativa' : '—'],
    ['Em splitter com massiva', `${n0(p.massiva)} (${pct(p.massiva, p.n)})`, REF ? pct(REF.massiva, REF.n) + ' na base ativa' : '—'],
    ['Tinha equipamento alocado', `${n0(p.equip)} (${pct(p.equip, p.n)})`, '—'],
    ['Gerou protocolo de retirada', `${n0(p.retirada)} (${pct(p.retirada, p.n)})`, '—'],
    ['Equipamento recuperado', `${n0(p.recuperado)} (${pct(p.recuperado, p.retirada || 1)} dos com retirada)`, '—'],
  ]))
  L.push('')
  L.push(listaTop(rows, (c) => c.plan, 'Planos'))
  L.push(listaTop(rows, (c) => c.city, 'Cidades'))
  L.push(listaTop(rows, (c) => c.neighborhood, 'Bairros', 10))
  L.push(listaTop(rows, (c) => c.paymentForm, 'Formas de pagamento'))
  L.push(listaTop(rows, (c) => c.clientGender, 'Gênero', 4))
  L.push(listaTop(rows, (c) => c.seller, 'Vendedor de origem', 6))
  L.push(listaTop(rows, (c) => c.netConcentrator, 'Concentrador (OLT)', 6))
  L.push(listaTop(rows, (c) => c.reasons, 'Motivos de protocolo de manutenção', 8))
  L.push(listaTop(rows, (c) => c.relTypes, 'Tipos de protocolo de relacionamento', 8))
  L.push(listaTop(rows, (c) => c.equipment, 'Equipamentos alocados', 6))
  return L.join('\n')
}

// ─── Montagem do relatório ─────────────────────────────────────
const porGrupo = new Map(MOTIVE_GROUP_ORDER.map((g) => [g, []]))
for (const c of mes) porGrupo.get(motiveGroupOf(c.cancellationMotive)).push(c)

const mrrMes = mes.reduce((a, c) => a + (c.monthlyValue || 0), 0)
const meses = [...new Set(todos.map((c) => c.cancellationDate.slice(0, 7)))].sort()
const idx = meses.indexOf(MES)
const serie = meses.slice(Math.max(0, idx - 5), idx + 1).map((m) => {
  const rs = todos.filter((c) => c.cancellationDate.slice(0, 7) === m)
  return [m, n0(rs.length), brl(rs.reduce((a, c) => a + (c.monthlyValue || 0), 0))]
})

const md = []
md.push(`# Perfil de cancelamentos — ${MES}`)
md.push('')
md.push(`Gerado em ${new Date().toISOString().slice(0, 10)} a partir do snapshot de ${(snap.meta?.generatedAt || '').slice(0, 10)} (\`${snap.meta?.coverage === 'full' ? 'base completa' : 'amostra'}\` para clientes ativos; **a coorte de cancelados é sempre a base inteira**).`)
md.push('')
md.push(`**${n0(mes.length)} cancelamentos** no mês, somando **${brl(mrrMes)}** de MRR.`)
md.push('')
md.push('## Antes de tudo: um terço não era cliente')
md.push('')
md.push('O motivo do cancelamento vem como texto livre e mistura coisas incomparáveis. A separação abaixo é o achado mais importante deste relatório — sem ela, qualquer persona sai distorcida.')
md.push('')
md.push(tabela(
  ['Grupo', 'Clientes', '% do mês', 'MRR', 'Tempo de casa (mediana)', 'Sem fatura'],
  MOTIVE_GROUP_ORDER.map((g) => {
    const rs = porGrupo.get(g)
    const p = perfil(rs)
    return [`**${MOTIVE_GROUP_LABEL[g]}**`, n0(p.n), pct(p.n, mes.length), brl(p.mrr), p.tenure == null ? '—' : `${n0(p.tenure)} d`, `${pct(p.semFatura, p.n)}`]
  }),
))
md.push('')
md.push('Repare na linha **Não chegou a instalar**: tempo de casa em dias e nenhuma fatura. São vendas que morreram antes da instalação — contam como cancelamento no ELLEVEN, mas não são churn. Incluí-los puxa o tempo de casa médio do mês para baixo e inventa um perfil que não existe.')
md.push('')
md.push('## Cancelamentos por mês')
md.push('')
md.push(tabela(['Mês', 'Cancelamentos', 'MRR'], serie))
md.push('')
md.push('## Motivos declarados')
md.push('')
const motivos = top(mes, (c) => (c.cancellationMotive || '(não informado)').split(' - Justificativa:')[0], 15)
md.push(tabela(['Motivo', 'Clientes', '% do mês'], motivos.map((m) => [m.valor.slice(0, 90), n0(m.qtd), m.pct])))
md.push('')
md.push('---')
md.push('')
md.push('## Perfil por grupo')
md.push('')
for (const g of MOTIVE_GROUP_ORDER) {
  const rs = porGrupo.get(g)
  if (!rs.length) continue
  md.push(blocoPerfil(rs, `${MOTIVE_GROUP_LABEL[g]} — ${n0(rs.length)} clientes`, MOTIVE_GROUP_HINT[g]))
  md.push('')
  md.push('---')
  md.push('')
}
md.push('## Perfil consolidado do mês (todos os grupos)')
md.push('')
md.push('Fica aqui para referência, mas **não use isto para montar persona** — é a média de populações que não se parecem.')
md.push('')
md.push(blocoPerfil(mes, 'Todos os cancelamentos do mês', null))
md.push('')
md.push('---')
md.push('')
md.push('## Limites deste relatório')
md.push('')
md.push('- O motivo é preenchido por quem registra o cancelamento e tem preenchimento desigual; o agrupamento é heurístico sobre texto livre (ver `src/features/cancellation-profiles/cancellationMotive.ts`).')
md.push('- Sinais de conexão do AutoISP (sinal óptico, porta LAN, geração do Wi-Fi) **não** estão disponíveis para cancelados: o ETL só os aplica à base ativa. Por isso não aparecem aqui.')
md.push('- Contagens de protocolo, fatura e massiva respeitam a data de corte do ETL, não a vida inteira do contrato.')
md.push('- Perfis com poucos clientes têm percentuais instáveis — confira a coluna de contagem antes de tirar conclusão.')
md.push('- **"Em splitter com massiva" sai mais baixo nos cancelados que na base ativa.** Isso é contraintuitivo e provavelmente é artefato: a infra de rede dos cancelados vem de uma query própria (`Q_NET_INFRA_CANCELLED`), com cobertura menor que a dos ativos. Não leia como "massiva não causa cancelamento" sem antes conferir a cobertura das duas queries.')
md.push('- A coluna "Referência" compara com a base ATIVA do snapshot, que aqui é uma amostra de 2.000 clientes. Com o ETL completo (`full`) a referência fica mais firme.')
md.push('')

writeFileSync(OUT, md.join('\n'), 'utf8')
console.log(`OK — ${mes.length} cancelamentos de ${MES} → ${OUT}`)
for (const g of MOTIVE_GROUP_ORDER) console.log(`  ${MOTIVE_GROUP_LABEL[g].padEnd(26)} ${String(porGrupo.get(g).length).padStart(5)}`)
