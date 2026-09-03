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

export function AccuracyCard() {
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
        subtitle={`Dos que cancelaram após ${p.asOf}, quantos já estavam sinalizados como risco`}
        icon={<Target size={14} />}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">Já sinalizados</p>
            <p className="text-2xl font-bold text-on-surface leading-tight">{p.recall ?? '—'}%</p>
            <p className="text-[10px] text-on-surface-variant">{p.sinalizados} de {p.cancelados} que saíram</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">Ganho sobre o acaso</p>
            <p className={`text-2xl font-bold leading-tight ${corLift}`}>{p.lift ?? '—'}x</p>
            <p className="text-[10px] text-on-surface-variant">alerta cobre {p.taxaSinalizada}% da base</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">Precisão do alerta</p>
            <p className="text-2xl font-bold text-on-surface leading-tight">{p.precisao ?? '—'}%</p>
            <p className="text-[10px] text-on-surface-variant">dos {p.sinalizadosNaBase} sinalizados saíram</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">Acompanhamento</p>
            <p className="text-2xl font-bold text-on-surface leading-tight">{p.diasAcompanhados ?? '—'}d</p>
            <p className="text-[10px] text-on-surface-variant">{p.coorte.toLocaleString('pt-BR')} clientes na coorte</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-on-surface mb-2">
            Taxa de cancelamento por classificação
            <span className="font-normal text-on-surface-variant"> — a prova de que a nota ordena risco</span>
          </p>
          <Gradiente p={p} />
        </div>

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

        {poucosCasos && (
          <div className="flex items-start gap-2 rounded-lg bg-risk-medium/10 border border-risk-medium/25 px-3 py-2">
            <AlertTriangle size={13} className="text-risk-medium shrink-0 mt-0.5" />
            <p className="text-[10px] text-on-surface/80 leading-relaxed">
              Só {p.cancelados} desfechos até agora{p.ic95 ? ` — o intervalo de confiança vai de ${p.ic95.low}% a ${p.ic95.high}%` : ''}.
              Trate como direção, não como meta, até acumular mais pontos de histórico.
            </p>
          </div>
        )}

        <p className="text-[10px] text-on-surface-variant leading-relaxed border-t border-outline pt-2.5">{DEFINICAO}</p>
      </div>
    </Card>
  )
}
