import { useCallback, useEffect, useState } from 'react'
import { CheckSquare, Loader2, AlertTriangle, RefreshCw, Check, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/utils/cn'
import { HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { listTasks, updateTask, ApiError, type Task, type TaskStatus } from './actionPlansApi'
import type { HealthClassification } from '@/types'

const STATUS_LABEL: Record<TaskStatus, string> = {
  em_execucao: 'Em execução', concluido: 'Concluído', cancelado: 'Cancelado',
}
const FILTROS: { key: 'todas' | TaskStatus; label: string }[] = [
  { key: 'em_execucao', label: 'Em execução' },
  { key: 'concluido', label: 'Concluídas' },
  { key: 'todas', label: 'Todas' },
]

// Atraso é o que decide a ordem de atenção do gestor, então tem cor própria.
function prazoInfo(t: Task): { texto: string; classe: string } {
  if (!t.prazo) return { texto: '—', classe: 'text-on-surface-variant' }
  const dias = Math.round((new Date(`${t.prazo}T00:00:00`).getTime() - Date.now()) / 86400000)
  if (t.status !== 'em_execucao') return { texto: t.prazo, classe: 'text-on-surface-variant' }
  if (dias < 0) return { texto: `${Math.abs(dias)}d em atraso`, classe: 'text-risk-critical' }
  if (dias <= 2) return { texto: dias === 0 ? 'hoje' : `em ${dias}d`, classe: 'text-risk-medium' }
  return { texto: `em ${dias}d`, classe: 'text-on-surface-variant' }
}

type State =
  | { status: 'loading' }
  | { status: 'error'; msg: string }
  | { status: 'ready'; tasks: Task[] }

export function TasksPanel({ podeDecidir, somenteMinhas }: { podeDecidir: boolean; somenteMinhas: boolean }) {
  const [filtro, setFiltro] = useState<'todas' | TaskStatus>('em_execucao')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [concluindo, setConcluindo] = useState<number | null>(null)

  const carregar = useCallback(() => {
    setState({ status: 'loading' })
    listTasks({
      responsavel: somenteMinhas ? 'me' : undefined,
      status: filtro === 'todas' ? undefined : filtro,
    })
      .then((d) => setState({ status: 'ready', tasks: d.tasks }))
      .catch((e) => setState({ status: 'error', msg: e instanceof ApiError ? e.message : 'Erro inesperado.' }))
  }, [filtro, somenteMinhas])

  useEffect(() => { carregar() }, [carregar])

  const concluir = async (id: number) => {
    setConcluindo(id)
    try { await updateTask(id, { status: 'concluido' }); carregar() } finally { setConcluindo(null) }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-outline flex-wrap">
        <div className="flex items-center gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.key} onClick={() => setFiltro(f.key)}
              className={cn(
                'text-[11px] px-2.5 py-1 rounded-lg border transition-colors',
                filtro === f.key
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'border-outline text-on-surface-variant hover:border-outline-strong',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={carregar} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-outline text-on-surface-variant hover:border-outline-strong transition-colors">
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>

      {state.status === 'loading' ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-on-surface/70">
          <Loader2 size={16} className="animate-spin" /> Carregando tarefas…
        </div>
      ) : state.status === 'error' ? (
        <div className="px-5 py-8 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-risk-critical">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-on-surface">Não foi possível carregar as tarefas</p>
              <p className="mt-0.5 text-[12px] text-on-surface/70">{state.msg}</p>
            </div>
          </div>
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-md border border-outline px-3 py-1.5 text-[12px] text-on-surface/85 hover:border-outline-strong transition-colors">
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      ) : state.tasks.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <CheckSquare size={22} className="mx-auto text-on-surface-variant/50" />
          <p className="mt-2 text-xs text-on-surface-variant">
            {somenteMinhas ? 'Você não tem tarefas neste filtro.' : 'Nenhuma tarefa neste filtro.'}
          </p>
          <p className="mt-1 text-[10px] text-on-surface-variant/70">
            Tarefas nascem quando um gestor aprova uma recomendação de uma rodada.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline bg-surface-container-low/50">
                {['Tarefa', 'Cliente', 'Área', 'Prazo', 'Situação', 'Resultado', ''].map((h, i) => (
                  <th key={h || i} className={cn('px-3 py-2.5 text-[10px] text-on-surface-variant uppercase tracking-wider font-medium whitespace-nowrap', i >= 3 ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.tasks.map((t) => {
                const p = prazoInfo(t)
                const r = t.resultado
                return (
                  <tr key={t.id} className="border-b border-outline hover:bg-surface-container-low/60 transition-colors">
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-medium text-on-surface max-w-[320px]">{t.titulo}</p>
                      {t.descricao && <p className="text-[10px] text-on-surface-variant line-clamp-2 max-w-[320px]">{t.descricao}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[11px] text-on-surface truncate max-w-[160px]">{t.clienteNome || `Cliente ${t.clienteId}`}</p>
                      <p className="text-[10px] text-on-surface-variant font-mono">#{t.contratoId || t.clienteId}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-on-surface-variant capitalize">{t.responsavelArea || '—'}</td>
                    <td className={cn('px-3 py-2.5 text-right text-[11px]', p.classe)}>{p.texto}</td>
                    <td className="px-3 py-2.5 text-right text-[10px] text-on-surface-variant">{STATUS_LABEL[t.status]}</td>
                    <td className="px-3 py-2.5 text-right">
                      {!r ? (
                        <span className="text-[10px] text-on-surface-variant/70">
                          {t.status === 'concluido' ? 'aguardando prazo' : '—'}
                        </span>
                      ) : r.depois == null ? (
                        <span className="text-[10px] text-on-surface-variant/70">sem dados</span>
                      ) : (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-mono',
                            r.variacao > 0 ? 'text-risk-low' : r.variacao < 0 ? 'text-risk-critical' : 'text-on-surface-variant',
                          )}
                          title={`${HEALTH_LABELS[r.classificacaoAntes as HealthClassification] ?? r.classificacaoAntes} → ${HEALTH_LABELS[r.classificacaoDepois as HealthClassification] ?? r.classificacaoDepois} em ${r.diasDecorridos} dias`}
                        >
                          {r.variacao > 0 ? <TrendingUp size={11} /> : r.variacao < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                          {r.antes} → {r.depois}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {podeDecidir && t.status === 'em_execucao' && (
                        <button
                          onClick={() => concluir(t.id)} disabled={concluindo === t.id}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-outline text-on-surface/80 hover:border-outline-strong transition-colors disabled:opacity-30"
                        >
                          {concluindo === t.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Concluir
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
