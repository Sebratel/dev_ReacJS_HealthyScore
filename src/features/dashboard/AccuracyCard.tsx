import { useEffect, useState } from 'react'
import { Target, Loader2, Info, AlertTriangle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { useHealthColors } from '@/hooks/useHealthColors'
import { HEALTH_LABELS } from '@/utils/healthColors'
import { fetchAccuracy, type AccuracyResponse, type AccuracyPoint } from './accuracyApi'
import { ApiError } from '@/features/engines/engineApi'

const ORDEM = ['critical', 'high_risk', 'attention', 'healthy', 'excellent'] as const

// A definição fica na tela, não só na documentação: "assertividade" é o tipo de
// número que vira slide sem a letra miúda, e a letra miúda aqui é o que separa
// medir de enganar — a nota usada é a que existia ANTES do cancelamento.
const DEFINICAO =
  'Tomamos a foto do score numa data passada, ficamos só com quem estava ativo ali e olhamos quem cancelou depois. A nota considerada é a que existia antes da saída — pontuar hoje quem já cancelou usaria dados criados pelo próprio cancelamento.'

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
// Meio-dia evita que o fuso jogue a data para o dia anterior na renderização.
const fmtData = (iso?: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—')
const fmtMes = (m: string) => {
  const [ano, mes] = m.split('-')
  return `${MESES_CURTOS[Number(mes) - 1] ?? m}/${ano.slice(2)}`
}

function Indisponivel({ motivo }: { motivo: string }) {
  return (
    <Card>
      <CardHeader title="Assertividade do Health Score" subtitle="Dos que cancelaram, quantos já estavam sinalizados" icon={<Target size={14} />} />
      <div className="p-4 flex items-start gap-2.5">
        <Info size={14} className="text-on-surface-variant shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-on-surface/85 leading-relaxed">{motivo}</p>
          <p className="text-[11px] text-on-surface-variant mt-2 leading-relaxed">{DEFINICAO}</p>
        </div>
      </div>
    </Card>
  )
}

function Gradiente({ p }: { p: AccuracyPoint }) {
  const palette = useHealthColors()
  const linhas = ORDEM.map((cls) => p.porClassificacao.find((x) => x.classificacao === cls)).filter(Boolean) as AccuracyPoint['porClassificacao']
  const maior = Math.max(...linhas.map((l) => l.taxa ?? 0), 0.01)
  return (
    <div className="space-y-1.5">
      {linhas.map((l) => (
        <div key={l.classificacao} className="flex items-center gap-2">
          <span className="text-[10px] w-20 shrink-0 font-semibold" style={{ color: palette[l.classificacao] }}>
            {HEALTH_LABELS[l.classificacao]}
          </span>
          <div className="flex-1 h-3.5 bg-surface rounded-sm overflow-hidden">
            <div className="h-full rounded-sm transition-all" style={{ width: `${Math.max(2, (100 * (l.taxa ?? 0)) / maior)}%`, backgroundColor: palette[l.classificacao] }} />
          </div>
          <span className="text-[10px] font-mono text-on-surface w-11 text-right tabular-nums">{l.taxa == null ? '—' : `${l.taxa}%`}</span>
          <span className="text-[10px] font-mono text-on-surface-variant w-16 text-right tabular-nums">{l.cancelaram}/{l.naBase}</span>
        </div>
      ))}
    </div>
  )
}

// "114 saídas" sem eixo de tempo é um número que não decide nada: concentradas
// logo após a foto significa que o alerta chegou tarde; espalhadas significa que
// houve janela para agir. O mês do cancelamento é a pergunta que a operação faz.
function QuandoSairam({ p }: { p: AccuracyPoint }) {
  const palette = useHealthColors()
  const meses = p.porMes ?? []
  if (!meses.length) return null
  const maior = Math.max(...meses.map((m) => m.cancelados), 1)
  return (
    <div>
      <p className="text-[11px] font-semibold text-on-surface mb-2">
        Quando saíram
        <span className="font-normal text-on-surface-variant"> — mês do cancelamento, sempre depois da foto</span>
      </p>
      <div className="flex items-end gap-1.5 h-24">
        {meses.map((m) => {
          const pctSinalizado = m.cancelados ? (100 * m.sinalizados) / m.cancelados : 0
          return (
            <div key={m.mes} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-mono text-on-surface tabular-nums leading-none">{m.cancelados}</span>
              <div
                className="w-full rounded-sm overflow-hidden bg-surface flex flex-col justify-end"
                style={{ height: `${Math.max(6, (100 * m.cancelados) / maior)}%` }}
                title={`${fmtMes(m.mes)}: ${m.cancelados} saíram, ${m.sinalizados} já sinalizados`}
              >
                <div className="w-full" style={{ height: `${100 - pctSinalizado}%`, backgroundColor: palette.healthy }} />
                <div className="w-full" style={{ height: `${pctSinalizado}%`, backgroundColor: palette.critical }} />
              </div>
              <span className="text-[9px] text-on-surface-variant leading-none truncate w-full text-center">{fmtMes(m.mes)}</span>
            </div>
          )
        })}
      </div>
      {/* Duas séries no mesmo visual pedem legenda: a cor sozinha não diz qual é qual. */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-on-surface-variant">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: palette.critical }} /> já estavam sinalizados
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: palette.healthy }} /> passaram despercebidos
        </span>
      </div>
    </div>
  )
}

export function AccuracyCard() {
  const palette = useHealthColors()
  const [data, setData] = useState<AccuracyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetchAccuracy()
      .then((r) => { if (vivo) { setData(r); setErro(null) } })
      .catch((e) => { if (vivo) setErro(e instanceof ApiError ? e.message : 'Erro inesperado ao carregar a assertividade.') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader title="Assertividade do Health Score" subtitle="Dos que cancelaram, quantos já estavam sinalizados" icon={<Target size={14} />} />
        <div className="p-4 flex items-center gap-2 text-[11px] text-on-surface-variant"><Loader2 size={12} className="animate-spin" /> calculando…</div>
      </Card>
    )
  }
  if (erro) return <Indisponivel motivo={erro} />
  if (!data?.available || !data.principal) return <Indisponivel motivo={data?.reason ?? 'Indicador indisponível.'} />

  const p = data.principal
  // Poucos desfechos = intervalo largo. Dizer isso na cara evita que o número
  // vire meta antes de ter massa para sustentá-lo.
  const poucosCasos = p.cancelados < 100
  const lift = p.lift ?? 0
  const corLift = lift >= 1.5 ? 'text-risk-low' : lift >= 1 ? 'text-risk-medium' : 'text-risk-critical'

  return (
    <Card>
      <CardHeader
        title="Assertividade do Health Score"
        subtitle={`Foto de ${fmtData(p.asOf)} · acompanhados até ${fmtData(p.observadoAte)} (${p.diasAcompanhados ?? '—'} dias)`}
        icon={<Target size={14} />}
      />
      <div className="p-4 space-y-4">
        {/* A janela é a primeira coisa a dizer. Sem ela, "114 de 1.319" é lido
            como "cancelamentos do mês" — que é outro número, muito menor. */}
        <p className="text-[11px] text-on-surface/85 leading-relaxed rounded-lg bg-surface-container-lowest border border-outline px-3 py-2">
          Congelamos a classificação de <span className="font-mono">{p.coorte.toLocaleString('pt-BR')}</span> clientes que estavam
          ativos em <span className="font-semibold">{fmtData(p.asOf)}</span> e olhamos quem cancelou entre essa data e{' '}
          <span className="font-semibold">{fmtData(p.observadoAte)}</span>. Os números abaixo são acumulados da janela inteira, não de um mês.
          {data.datasHistorico && data.datasHistorico.length > 1 && (
            <> Há {data.datasHistorico.length} fotos gravadas; esta é a mais antiga, por ter mais tempo decorrido.</>
          )}
        </p>
        {/* Leitura principal: a pergunta que a operação faz de verdade —
            "marquei como crítico, e aí?". A taxa sozinha não diz nada, então
            vem sempre colada à taxa média da base, que é o ponto de comparação. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['critical', 'high_risk'] as const).map((cls) => {
            const l = p.porClassificacao.find((x) => x.classificacao === cls)
            if (!l) return null
            const vezes = p.taxaCancelamento && l.taxa ? l.taxa / p.taxaCancelamento : null
            return (
              <div key={cls} className="rounded-xl bg-surface-container-lowest border border-outline p-3">
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: palette[cls] }}>
                  Marcados como {HEALTH_LABELS[cls]}
                </p>
                <p className="text-3xl font-bold text-on-surface leading-tight mt-0.5">{l.taxa ?? '—'}%</p>
                <p className="text-[11px] text-on-surface/80 leading-snug">
                  <span className="font-mono">{l.cancelaram.toLocaleString('pt-BR')}</span> já cancelaram, dos{' '}
                  <span className="font-mono">{l.naBase.toLocaleString('pt-BR')}</span> que estavam nesta faixa em {fmtData(p.asOf)}
                </p>
                {vezes && (
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    <span className="font-semibold text-on-surface/80">{vezes.toFixed(1)}x</span> a média da base
                  </p>
                )}
              </div>
            )
          })}
          <div className="rounded-xl bg-surface/60 border border-outline p-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">Média da base</p>
            <p className="text-3xl font-bold text-on-surface-variant leading-tight mt-0.5">{p.taxaCancelamento ?? '—'}%</p>
            <p className="text-[11px] text-on-surface-variant leading-snug">
              <span className="font-mono">{p.cancelados.toLocaleString('pt-BR')}</span> já cancelaram, dos{' '}
              <span className="font-mono">{p.coorte.toLocaleString('pt-BR')}</span> ativos em {fmtData(p.asOf)}
            </p>
            <p className="text-[10px] text-on-surface-variant mt-1">é contra isto que as taxas acima se comparam</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-on-surface mb-2">
            Quantos saíram, por classificação
            <span className="font-normal text-on-surface-variant"> — taxa, e ao lado cancelaram / estavam na faixa</span>
          </p>
          <Gradiente p={p} />
        </div>

        <QuandoSairam p={p} />

        {p.porGrupo.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-on-surface mb-2">
              Por motivo de saída
              <span className="font-normal text-on-surface-variant"> — onde o score enxerga e onde é cego</span>
            </p>
            <div className="space-y-1">
              {p.porGrupo.map((g) => (
                <div key={g.grupo} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-on-surface/85 truncate">{g.label}</span>
                  <span className="font-mono text-on-surface-variant shrink-0 tabular-nums">
                    <span className={g.recall != null && g.recall > 0 ? 'text-on-surface' : 'text-risk-critical'}>{g.sinalizados}/{g.cancelados}</span>
                    {' · '}{g.recall ?? 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recall e lift continuam verdadeiros e úteis, mas respondem a
            pergunta inversa ("dos que saíram, quantos tínhamos marcado?").
            Ficam como leitura de apoio para não competir com a principal. */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-on-surface-variant border-t border-outline pt-2.5">
          <span>Cobertura: <span className="font-mono text-on-surface/80">{p.recall ?? '—'}%</span> dos {p.cancelados.toLocaleString('pt-BR')} que saíram já estavam marcados</span>
          <span>Ganho sobre o acaso: <span className={`font-mono ${corLift}`}>{p.lift ?? '—'}x</span></span>
          <span>Alerta cobre <span className="font-mono text-on-surface/80">{p.taxaSinalizada}%</span> da base</span>
        </div>

        {poucosCasos && (
          <div className="flex items-start gap-2 rounded-lg bg-risk-medium/10 border border-risk-medium/25 px-3 py-2">
            <AlertTriangle size={13} className="text-risk-medium shrink-0 mt-0.5" />
            <p className="text-[10px] text-on-surface/80 leading-relaxed">
              Só {p.cancelados} desfechos até agora{p.ic95 ? ` — o intervalo de confiança vai de ${p.ic95.low}% a ${p.ic95.high}%` : ''}.
              Trate como direção, não como meta, até acumular mais pontos de histórico.
            </p>
          </div>
        )}

        {/* Censura à direita: quem foi marcado e ainda está na base pode cancelar
            amanhã. Omitir isso faz a taxa ser lida como resultado final, quando é
            piso — e alguém acaba comparando janelas de tamanhos diferentes. */}
        <p className="text-[10px] text-on-surface-variant leading-relaxed border-t border-outline pt-2.5">
          A janela ainda está aberta: quem foi marcado e continua na base pode cancelar depois, então estas taxas tendem a subir
          conforme o tempo passa. Só compare com janelas de duração parecida. {DEFINICAO}
        </p>
      </div>
    </Card>
  )
}
