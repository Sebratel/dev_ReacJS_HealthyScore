// ─────────────────────────────────────────────────────────────────────────
// Coorte RETROATIVA: monta a base como ela era no fim de um mês passado, no
// mesmo shape (RealClient) que as engines consomem — então o score que sai
// daqui é o score de verdade, calculado pelas MESMAS engines do app, e não uma
// aproximação paralela.
//
// A diferença para cohort.mjs é só o recorte da base:
//   cohort.mjs   → quem está ativo/cancelado HOJE (v_status atual)
//   este arquivo → quem estava ativo NA DATA D (created <= D e ainda não
//                  cancelado em D), independente do que aconteceu depois
//
// Por isso as queries de sinal rodam com `cancelled: 'all'`: metade da coorte
// de 31/05 já cancelou desde então, e filtrar pelo status de hoje apagaria
// justamente o desfecho que a medição quer observar.
//
// A chave é o CONTRATO, não a pessoa. Quem tem 3 contratos e cancela 1 precisa
// contar como 1 saída; agrupando por cliente isso vira zero ou um, nunca a
// fração certa.
//
// ── O que NÃO é reconstruível ────────────────────────────────────────────
// Conexão (potência óptica, ONU, porta LAN) e Rede dependem de estado atual:
// o AutoISP não guarda histórico legível (ver memória do grant parcial) e não
// existe "qual era a potência em maio". Essas engines simplesmente não têm
// população nas datas passadas — e como o overall é a média das engines que
// pontuaram, o resultado sai honesto, com `enginesPresent` dizendo quantas
// entraram. Não inventamos valor neutro para engine sem dado: isso puxaria o
// score para o meio e esconderia a ausência.
// ─────────────────────────────────────────────────────────────────────────
import { getEffectiveSql } from './index.mjs'
import { baseRow, hydrateSignals } from './cohort.mjs'

// Janela de sinal: DESLIZANTE, de tamanho fixo, terminando na data de corte.
//
// A primeira versão usava um início fixo ('2026-01-01') e isso arruinava a
// comparação entre meses: a coorte de março enxergava 3 meses de histórico e a
// de julho enxergava 7. O recall subia de 5,6% para 19% ao longo da série e
// parecia que o score estava melhorando, quando só estava acumulando sinal.
// Com janela deslizante todo mês vê exatamente a mesma quantidade de passado.
//
// `to` é sempre a data de corte, nunca "hoje" — é isso que impede vazamento de
// dado criado depois do desfecho.
export const SIGNAL_WINDOW_DAYS = 180

function inicioDaJanela(asOf, dias) {
  const d = new Date(`${asOf}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

export async function buildAsOfCohort(pool, { asOf, janelaDias = SIGNAL_WINDOW_DAYS, from = null }) {
  if (!asOf) throw new Error('buildAsOfCohort: `asOf` (data de corte) é obrigatório.')
  const warnings = []
  const inicio = from || inicioDaJanela(asOf, janelaDias)

  const base = await pool.query(getEffectiveSql('Q_ASOF_BASE', { cancelled: 'all' }), [asOf])

  const byContract = new Map()
  for (const r of base.rows) {
    if (!r.contract_number) continue
    const c = baseRow(r)
    // ── A virada de chave: CONTRATO, não pessoa ──────────────────────────
    // As engines usam `clientId` apenas como identidade (todas fazem
    // `customerId: c.clientId`) e scoreAllClients agrupa por ela. Com o id da
    // PESSOA, os 2.838 assinantes que têm mais de um contrato teriam seus
    // contratos fundidos num score só — e quem tem 3 contratos e cancela 1
    // apareceria como "não cancelou". Apontando a identidade para o contrato,
    // a base inteira passa a ser por contrato sem tocar nas engines.
    // O id da pessoa continua disponível em `personId` para agrupar quando
    // alguém realmente quiser a visão por assinante.
    c.personId = c.clientId
    c.clientId = c.contractNumber
    // `cancellationDate` vem preenchido para quem cancelou DEPOIS de asOf —
    // é o desfecho, e o consumidor decide a janela em que vai observá-lo.
    // Não zeramos aqui para não perder a informação.
    if (!byContract.has(c.contractNumber)) byContract.set(c.contractNumber, c)
  }
  if (!byContract.size) return { clients: [], warnings, asOf, janela: { de: inicio, ate: asOf } }

  await hydrateSignals(pool, byContract, { from: inicio, to: asOf, cancelled: 'all', warnings })
  return { clients: [...byContract.values()], warnings, asOf, janela: { de: inicio, ate: asOf } }
}
