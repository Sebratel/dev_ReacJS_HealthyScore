import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Loader2, Info, AlertTriangle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { useHealthColors } from '@/hooks/useHealthColors'
import { HEALTH_LABELS } from '@/utils/healthColors'
import { fetchMonthlyCohort, type MonthlyCohortResponse, type CohortPoint } from './monthlyCohortApi'
import { ApiError } from '@/features/engines/engineApi'

const ORDEM = ['critical', 'high_risk', 'attention', 'healthy', 'excellent'] as const
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const fmtMesCurto = (ym: string) => {
  const [a, m] = ym.split('-')
  return `${MESES[Number(m) - 1] ?? m}/${a.slice(2)}`
}
const fmtMesLongo = (ym: string) => {
  const [a, m] = ym.split('-')
  return `${MESES_LONGOS[Number(m) - 1] ?? m} de ${a}`
}
// Meio-dia evita que o fuso jogue a data para o dia anterior na renderização.
const fmtDia = (iso?: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—')
const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'))

function Indisponivel({ motivo }: { motivo: string }) {
  return (
    <Card>
      <CardHeader title="Assertividade" subtitle="Conexões, cancelamentos e de onde vieram as saídas" icon={<CalendarRange size={14} />} />
      <div className="p-4 flex items-start gap-2.5">
        <Info size={14} className="text-on-surface-variant shrink-0 mt-0.5" />
        <p className="text-xs text-on-surface/85 leading-relaxed">{motivo}</p>
      </div>
    </Card>
  )
}

// A leitura que a operação pede: DOS QUE SAÍRAM, em que faixa estavam.
// Denominador é o cancelamento, não a faixa — é a pergunta "de onde vem a
// perda", e não "qual o risco de quem está aqui" (essa é a coluna ao lado).
function DeOndeVieram({ p }: { p: CohortPoint }) {
  const palette = useHealthColors()
  const linhas = ORDEM.map((cls) => p.porClassificacao.find((x) => x.classificacao === cls)).filter(Boolean) as CohortPoint['porClassificacao']
  if (!p.cancelamentos) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-on-surface mb-2">
        De onde vieram as saídas
        <span className="font-normal text-on-surface-variant"> — dos {num(p.cancelamentos)} que cancelaram, em que faixa estavam</span>
      </p>

      {/* Barra única: a composição inteira em 100%, para ver de relance se a
          perda vem do topo de risco ou do meio da base. */}
      <div className="flex h-5 rounded-md overflow-hidden mb-2 bg-surface">
        {linhas.map((l) =>
          !l.pctDasSaidas ? null : (
            <div
              key={l.classificacao}
              style={{ width: `${l.pctDasSaidas}%`, backgroundColor: palette[l.classificacao] }}
              title={`${HEALTH_LABELS[l.classificacao]}: ${l.cancelaram} de ${p.cancelamentos} (${l.pctDasSaidas}%)`}
            />
          )
        )}
      </div>

      <div className="space-y-1">
        {linhas.map((l) => (
          <div key={l.classificacao} className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: palette[l.classificacao] }} />
            <span className="w-20 shrink-0 font-semibold" style={{ color: palette[l.classificacao] }}>
              {HEALTH_LABELS[l.classificacao]}
            </span>
            <span className="font-mono tabular-nums text-on-surface w-28">
              {num(l.cancelaram)} de {num(p.cancelamentos)}
            </span>
            <span className="font-mono tabular-nums font-semibold text-on-surface w-14 text-right">
              {l.pctDasSaidas == null ? '—' : `${l.pctDasSaidas}%`}
            </span>
            {/* A outra pergunta, propositalmente em cinza e menor: quem está
                nesta faixa tem que chance de sair. Juntas evitam a confusão
                clássica entre "de onde vem a perda" e "qual o risco daqui". */}
            <span className="text-[10px] text-on-surface-variant ml-auto">
              risco da faixa: <span className="font-mono">{l.taxa == null ? '—' : `${l.taxa}%`}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Detalhe({ p }: { p: CohortPoint }) {
  const conexoes = p.parcial ? p.conexoesFim : p.conexoesInicio
  const legendaConexoes = p.parcial
    ? `conexões em ${fmtDia(p.conexoesFimEm ?? p.observadoAte)}`
    : `conexões em ${fmtDia(p.notaCongeladaEm)}`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-surface-container-lowest border border-outline p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">Conexões</p>
          <p className="text-3xl font-bold text-on-surface leading-tight mt-0.5">{num(conexoes)}</p>
          <p className="text-[11px] text-on-surface-variant">{legendaConexoes}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest border border-outline p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">Cancelamentos</p>
          <p className="text-3xl font-bold text-on-surface leading-tight mt-0.5">{num(p.cancelamentosNoMes ?? p.cancelamentos)}</p>
          <p className="text-[11px] text-on-surface-variant">
            em {fmtMesLongo(p.mesIndicador)}
            {p.parcial && <> até {fmtDia(p.observadoAte)}</>}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest border border-outline p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">Taxa de churn</p>
          <p className="text-3xl font-bold text-on-surface leading-tight mt-0.5">
            {(p.taxaChurnConexoes ?? p.taxaCancelamento) == null ? '—' : `${p.taxaChurnConexoes ?? p.taxaCancelamento}%`}
          </p>
          {/* Mesma régua do relatório oficial: cancelamentos do mês sobre a
              base de conexões do mês anterior. Dizer a fórmula na tela evita a
              reunião em que dois números certos parecem se contradizer. */}
          <p className="text-[11px] text-on-surface-variant">
            cancelamentos ÷ conexões do mês anterior
          </p>
        </div>
      </div>

      <DeOndeVieram p={p} />

      {p.cancelamentosNoMes != null && p.cancelamentosNoMes !== p.cancelamentos && (
        <p className="text-[10px] text-on-surface-variant leading-relaxed rounded-lg bg-surface-container-lowest border border-outline px-3 py-2">
          A composição acima cobre os <span className="font-mono">{num(p.cancelamentos)}</span> cancelamentos que o score
          pôde avaliar, dos <span className="font-mono">{num(p.cancelamentosNoMes)}</span> do mês.
          {!!p.foraDaCoorte && (
            <> Ficaram de fora <span className="font-mono">{num(p.foraDaCoorte)}</span> que nasceram e cancelaram dentro do
            próprio mês — não existiam na base quando a nota foi congelada, então não havia o que prever.</>
          )}
          {!!p.cancelamentosEmLote && (
            <> Outros <span className="font-mono">{num(p.cancelamentosEmLote)}</span> saíram em lote por venda de operação.</>
          )}
        </p>
      )}

      {/* Rodapé técnico. O lift do decil 1 vem antes do recall de propósito:
          é o único dos dois que se compara entre meses (o recall se mexe
          sozinho quando o balde de alerta muda de tamanho). */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-on-surface-variant border-t border-outline pt-2.5">
        <span>
          Os 10% de pior nota cancelam{' '}
          <span className="font-mono text-on-surface/80">{p.liftDecil1 == null ? '—' : `${p.liftDecil1}x`}</span> a média
        </span>
        <span>
          Já sinalizados: <span className="font-mono text-on-surface/80">{p.recall == null ? '—' : `${p.recall}%`}</span> das saídas
        </span>
        <span>
          MRR perdido: <span className="font-mono text-on-surface/80">R$ {num(p.mrrPerdido == null ? null : Math.round(p.mrrPerdido))}</span>
        </span>
      </div>

      {p.semSinalSuficiente > 0 && (
        <p className="text-[10px] text-on-surface-variant leading-relaxed">
          {num(p.semSinalSuficiente)} contratos ficaram fora por não ter sinal suficiente para pontuar
          {p.cancelamentosSemSinal > 0 && <> — {num(p.cancelamentosSemSinal)} deles cancelaram</>}.
        </p>
      )}
    </div>
  )
}

export function MonthlyCohortCard() {
  const [data, setData] = useState<MonthlyCohortResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // null = o mês em curso (a leitura principal). Clicar no histórico troca aqui.
  const [mesAberto, setMesAberto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetchMonthlyCohort()
      .then((r) => { if (vivo) { setData(r); setErro(null) } })
      .catch((e) => { if (vivo) setErro(e instanceof ApiError ? e.message : 'Erro inesperado ao carregar a coorte mensal.') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  // Últimos 3 meses FECHADOS, do mais recente para o mais antigo.
  const historico = useMemo(() => (data?.fechados ?? []).slice(-3).reverse(), [data])

  const selecionado = useMemo(() => {
    if (!data?.disponivel) return null
    if (!mesAberto) return data.atual ?? data.fechados?.[data.fechados.length - 1] ?? null
    return data.fechados?.find((p) => p.mesIndicador === mesAberto) ?? null
  }, [data, mesAberto])

  if (loading) {
    return (
      <Card>
        <CardHeader title="Assertividade" subtitle="Conexões, cancelamentos e de onde vieram as saídas" icon={<CalendarRange size={14} />} />
        <div className="p-4 flex items-center gap-2 text-[11px] text-on-surface-variant">
          <Loader2 size={12} className="animate-spin" /> carregando…
        </div>
      </Card>
    )
  }
  if (erro) return <Indisponivel motivo={erro} />
  if (!data?.disponivel) return <Indisponivel motivo={data?.motivo ?? 'Coorte mensal indisponível.'} />
  if (!selecionado) return <Indisponivel motivo="Nenhum mês calculado ainda." />

  const ehAtual = !!selecionado.parcial

  return (
    <Card>
      <CardHeader
        title={`Assertividade · ${fmtMesLongo(selecionado.mesIndicador)}`}
        subtitle={
          ehAtual
            ? `Mês em curso, parcial até ${fmtDia(selecionado.observadoAte)} · nota congelada em ${fmtDia(selecionado.notaCongeladaEm)}`
            : `Mês fechado · nota congelada em ${fmtDia(selecionado.notaCongeladaEm)}`
        }
        icon={<CalendarRange size={14} />}
      />
      <div className="p-4 space-y-4">
        {ehAtual && (
          <p className="text-[11px] text-on-surface/85 leading-relaxed rounded-lg bg-risk-medium/10 border border-risk-medium/25 px-3 py-2">
            O mês ainda não fechou: a taxa acima cobre só até {fmtDia(selecionado.observadoAte)} e vai subir até o dia 30.
            Não compare com um mês inteiro — compare com o mesmo dia do mês anterior.
          </p>
        )}

        <Detalhe p={selecionado} />

        {historico.length > 0 && (
          <div className="border-t border-outline pt-3">
            <p className="text-[11px] font-semibold text-on-surface mb-2">
              Meses fechados
              <span className="font-normal text-on-surface-variant"> — clique para abrir o detalhe</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.atual && (
                <button
                  type="button"
                  onClick={() => setMesAberto(null)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    !mesAberto ? 'border-primary bg-primary/10' : 'border-outline bg-surface-container-lowest hover:bg-surface'
                  }`}
                >
                  <p className="text-[10px] text-on-surface-variant">{fmtMesCurto(data.atual.mesIndicador)} · em curso</p>
                  <p className="text-lg font-bold text-on-surface leading-tight">
                    {data.atual.taxaCancelamento == null ? '—' : `${data.atual.taxaCancelamento}%`}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">{num(data.atual.cancelamentos)} saíram</p>
                </button>
              )}
              {historico.map((p) => (
                <button
                  key={p.mesIndicador}
                  type="button"
                  onClick={() => setMesAberto(p.mesIndicador)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    mesAberto === p.mesIndicador ? 'border-primary bg-primary/10' : 'border-outline bg-surface-container-lowest hover:bg-surface'
                  }`}
                >
                  <p className="text-[10px] text-on-surface-variant">{fmtMesCurto(p.mesIndicador)}</p>
                  <p className="text-lg font-bold text-on-surface leading-tight">
                    {p.taxaCancelamento == null ? '—' : `${p.taxaCancelamento}%`}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">{num(p.cancelamentos)} saíram</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {!!data.enginesIndisponiveisNoPassado?.length && (
          <div className="flex items-start gap-2 text-[10px] text-on-surface-variant leading-relaxed">
            <AlertTriangle size={12} className="text-risk-medium shrink-0 mt-0.5" />
            <p>
              A nota retroativa não inclui as engines de {data.enginesIndisponiveisNoPassado.join(' e ')} — elas só existem em
              estado atual, não há como reconstruí-las para uma data passada. Por isso esta nota não é idêntica à da tela de hoje.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
