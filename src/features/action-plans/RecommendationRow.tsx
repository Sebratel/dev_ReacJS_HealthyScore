import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Check, X, RefreshCw, Loader2, AlertTriangle,
  ShieldCheck, Ban, Pencil,
} from 'lucide-react'
import { cn, formatCurrency } from '@/utils/cn'
import { HEALTH_LABELS } from '@/components/ui/HealthGauge'
import {
  approveRecommendation, rejectRecommendation, retryRecommendation, ApiError,
  type Recommendation, type Acao, type Prioridade, type ResponsavelArea,
} from './actionPlansApi'
import type { HealthClassification } from '@/types'

const PRIORIDADES: Prioridade[] = ['alta', 'media', 'baixa']
const AREAS: ResponsavelArea[] = ['cobranca', 'atendimento', 'comercial', 'juridico']
const AREA_LABEL: Record<ResponsavelArea, string> = {
  cobranca: 'Cobrança', atendimento: 'Atendimento', comercial: 'Comercial', juridico: 'Jurídico',
}
const PRIO_LABEL: Record<Prioridade, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
const PRIO_CLASS: Record<Prioridade, string> = {
  alta: 'text-risk-critical border-risk-critical/30 bg-risk-critical/10',
  media: 'text-risk-medium border-risk-medium/30 bg-risk-medium/10',
  baixa: 'text-on-surface-variant border-outline bg-surface-container-low',
}

interface Props {
  rec: Recommendation
  rank: number
  podeDecidir: boolean
  onChanged: () => void
}

export function RecommendationRow({ rec, rank, podeDecidir, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [acoes, setAcoes] = useState<Acao[]>(rec.aprovacao?.acoesEditadas ?? rec.resposta?.acoes_recomendadas ?? [])
  const [editando, setEditando] = useState(false)
  const [comentario, setComentario] = useState(rec.aprovacao?.comentario ?? '')
  const [ocupado, setOcupado] = useState<null | 'aprovar' | 'rejeitar' | 'retry'>(null)
  const [erro, setErro] = useState<string | null>(null)

  const decidida = rec.aprovacao?.status === 'aprovado' || rec.aprovacao?.status === 'rejeitado'
  const invalida = rec.status !== 'valida'

  const agir = async (acao: 'aprovar' | 'rejeitar' | 'retry') => {
    setOcupado(acao)
    setErro(null)
    try {
      if (acao === 'aprovar') await approveRecommendation(rec.id, acoes, comentario || undefined)
      else if (acao === 'rejeitar') await rejectRecommendation(rec.id, comentario || undefined)
      else await retryRecommendation(rec.id)
      onChanged()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.')
    } finally {
      setOcupado(null)
    }
  }

  const patch = (i: number, campo: keyof Acao, valor: string | number) => {
    setAcoes((prev) => prev.map((a, idx) => (idx === i ? { ...a, [campo]: valor } : a)))
  }

  const cls = (rec.classificacao || 'critical') as HealthClassification

  return (
    <>
      <tr
        className="border-b border-outline hover:bg-surface-container-low/60 cursor-pointer transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2.5 text-[10px] font-mono text-on-surface-variant/90 text-right">{rank}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown size={11} className="text-on-surface-variant/90 shrink-0" /> : <ChevronRight size={11} className="text-on-surface-variant/90 shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs font-medium text-on-surface truncate max-w-[190px]">{rec.dossie?.nome || `Cliente ${rec.clienteId}`}</p>
              <p className="text-[10px] text-on-surface-variant font-mono">#{rec.contratoId || rec.clienteId} · {rec.dossie?.cidade || '—'}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          {invalida ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-risk-critical/30 bg-risk-critical/10 text-risk-critical">
              <AlertTriangle size={9} /> {rec.status === 'falha_schema' ? 'Fora do contrato' : 'Falha do provedor'}
            </span>
          ) : (
            <p className="text-[11px] text-on-surface/80 line-clamp-2 max-w-[420px]">{rec.resposta?.diagnostico}</p>
          )}
        </td>
        <td className="px-3 py-2.5 text-right text-[11px] text-on-surface-variant">{invalida ? '—' : acoes.length}</td>
        <td className="px-3 py-2.5 text-right text-[11px] font-mono text-on-surface">{rec.healthScoreNoMomento ?? '—'}</td>
        <td className="px-3 py-2.5 text-right text-[10px] text-on-surface-variant">{HEALTH_LABELS[cls] ?? cls}</td>
        <td className="px-3 py-2.5 text-right">
          {rec.aprovacao?.status === 'aprovado' ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-risk-low/30 bg-risk-low/10 text-risk-low"><ShieldCheck size={9} /> Aprovado</span>
          ) : rec.aprovacao?.status === 'rejeitado' ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-outline bg-surface-container-low text-on-surface-variant"><Ban size={9} /> Rejeitado</span>
          ) : (
            <span className="text-[10px] text-on-surface-variant/80">Aguardando</span>
          )}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-outline bg-surface-container-low/30">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
              {/* Dossiê: o que a IA viu */}
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase tracking-wider text-on-surface-variant font-medium">Dossiê usado</h4>
                <div className="rounded-lg border border-outline bg-surface-container-lowest p-3 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-on-surface-variant">Health no momento</span>
                    <span className="font-mono text-on-surface">{rec.dossie?.health_score_atual ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-on-surface-variant">Mensalidade</span>
                    <span className="font-mono text-on-surface">{rec.dossie?.receita_mensal != null ? formatCurrency(rec.dossie.receita_mensal) : '—'}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-on-surface-variant">Forma de pagamento</span>
                    <span className="text-on-surface truncate max-w-[150px]" title={rec.dossie?.forma_pagamento || ''}>{rec.dossie?.forma_pagamento || '—'}</span>
                  </div>
                  <div className="pt-2 border-t border-outline space-y-1">
                    {(rec.dossie?.indicadores ?? []).map((i) => (
                      <div key={i.nome} className="flex justify-between text-[10px]">
                        <span className="text-on-surface-variant font-mono">{i.nome}</span>
                        <span className="font-mono">
                          <span className="text-on-surface">{String(i.valor)}</span>
                          <span className={cn('ml-1.5', i.pontos < 0 ? 'text-risk-critical' : i.pontos > 0 ? 'text-risk-low' : 'text-on-surface-variant/70')}>
                            {i.pontos > 0 ? `+${i.pontos}` : i.pontos}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {(rec.dossie?.planos_anteriores?.length ?? 0) > 0 && (
                    <div className="pt-2 border-t border-outline">
                      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Ações anteriores</p>
                      {rec.dossie.planos_anteriores.map((p, i) => (
                        <p key={i} className="text-[10px] text-on-surface-variant truncate" title={p.titulo}>
                          · {p.titulo} ({p.status}
                          {p.resultado ? `, ${p.resultado.variacao > 0 ? '+' : ''}${p.resultado.variacao} pts` : ''})
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-on-surface-variant/80 leading-relaxed">
                  Prompt {rec.versaoPrompt} · modelo <span className="font-mono">{rec.modelo}</span>
                  {rec.tokens.total ? ` · ${rec.tokens.total} tokens` : ''}
                  {rec.duracaoMs ? ` · ${(rec.duracaoMs / 1000).toFixed(1)}s` : ''}
                  {rec.tentativa > 1 ? ` · tentativa ${rec.tentativa}` : ''}
                </p>
              </div>

              {/* Plano */}
              <div className="space-y-3">
                {invalida ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-[12px] text-risk-critical">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-on-surface">A geração não passou na validação</p>
                        <p className="mt-0.5 text-[11px] text-on-surface/70">{rec.erroValidacao}</p>
                        <p className="mt-1 text-[10px] text-on-surface-variant">
                          A resposta foi guardada para auditoria, mas não pode ser aprovada — um plano fora do contrato não vira tarefa.
                        </p>
                      </div>
                    </div>
                    {podeDecidir && (
                      <button
                        onClick={() => agir('retry')} disabled={ocupado !== null}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-outline text-on-surface/85 hover:border-outline-strong transition-colors disabled:opacity-30"
                      >
                        {ocupado === 'retry' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Nova tentativa
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-on-surface-variant font-medium mb-1">Diagnóstico</h4>
                      <p className="text-[12px] text-on-surface/85 leading-relaxed">{rec.resposta?.diagnostico}</p>
                      {(rec.resposta?.causas_provaveis?.length ?? 0) > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {rec.resposta!.causas_provaveis.map((c, i) => (
                            <li key={i} className="text-[11px] text-on-surface-variant">· {c}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-[10px] text-on-surface-variant/80">
                        Confiança declarada pelo modelo: {Math.round((rec.resposta?.confianca_modelo ?? 0) * 100)}% —
                        é uma auto-avaliação do próprio modelo, não uma medida de acerto.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-[10px] uppercase tracking-wider text-on-surface-variant font-medium">
                          Ações recomendadas ({acoes.length})
                        </h4>
                        {podeDecidir && !decidida && (
                          <button
                            onClick={() => setEditando((v) => !v)}
                            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                          >
                            <Pencil size={10} /> {editando ? 'Concluir edição' : 'Editar antes de aprovar'}
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {acoes.map((a, i) => (
                          <div key={i} className="rounded-lg border border-outline bg-surface-container-lowest p-3 space-y-2">
                            {editando ? (
                              <>
                                <input
                                  value={a.titulo} onChange={(e) => patch(i, 'titulo', e.target.value)}
                                  className="w-full h-7 px-2 text-[12px] bg-surface-container-low border border-outline rounded text-on-surface focus:outline-none focus:border-primary/50"
                                />
                                <textarea
                                  value={a.descricao} onChange={(e) => patch(i, 'descricao', e.target.value)} rows={2}
                                  className="w-full px-2 py-1 text-[11px] bg-surface-container-low border border-outline rounded text-on-surface/85 focus:outline-none focus:border-primary/50 resize-y"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <select
                                    value={a.prioridade} onChange={(e) => patch(i, 'prioridade', e.target.value)}
                                    className="h-7 px-1.5 text-[10px] bg-surface-container-low border border-outline rounded text-on-surface focus:outline-none focus:border-primary/50"
                                  >
                                    {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
                                  </select>
                                  <select
                                    value={a.responsavel_sugerido} onChange={(e) => patch(i, 'responsavel_sugerido', e.target.value)}
                                    className="h-7 px-1.5 text-[10px] bg-surface-container-low border border-outline rounded text-on-surface focus:outline-none focus:border-primary/50"
                                  >
                                    {AREAS.map((r) => <option key={r} value={r}>{AREA_LABEL[r]}</option>)}
                                  </select>
                                  <label className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                                    prazo
                                    <input
                                      type="number" min={0} max={365} value={a.prazo_sugerido_dias}
                                      onChange={(e) => patch(i, 'prazo_sugerido_dias', Number(e.target.value) || 0)}
                                      className="w-14 h-7 px-1.5 text-[10px] bg-surface-container-low border border-outline rounded text-on-surface focus:outline-none focus:border-primary/50"
                                    />
                                    dias
                                  </label>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[12px] font-medium text-on-surface">{a.titulo}</p>
                                  <span className={cn('shrink-0 text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wide', PRIO_CLASS[a.prioridade])}>
                                    {PRIO_LABEL[a.prioridade]}
                                  </span>
                                </div>
                                <p className="text-[11px] text-on-surface/75 leading-relaxed">{a.descricao}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-on-surface-variant">
                                  <span>Responsável: <span className="text-on-surface/80">{AREA_LABEL[a.responsavel_sugerido]}</span></span>
                                  <span>Prazo: <span className="text-on-surface/80">{a.prazo_sugerido_dias} dias</span></span>
                                </div>
                                <p className="text-[10px] text-on-surface-variant/85 italic">Impacto esperado: {a.impacto_esperado}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {podeDecidir && (
                      <div className="space-y-2 pt-1">
                        <input
                          value={comentario} onChange={(e) => setComentario(e.target.value)}
                          placeholder="Comentário da decisão (opcional)"
                          className="w-full h-8 px-2 text-[11px] bg-surface-container-low border border-outline rounded-lg text-on-surface placeholder-on-surface-variant/70 focus:outline-none focus:border-primary/50"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => agir('aprovar')} disabled={ocupado !== null || acoes.length === 0}
                            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium disabled:opacity-30"
                          >
                            {ocupado === 'aprovar' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            {decidida ? 'Reaprovar' : 'Aprovar e criar tarefas'}
                          </button>
                          <button
                            onClick={() => agir('rejeitar')} disabled={ocupado !== null}
                            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-outline text-on-surface/85 hover:border-outline-strong transition-colors disabled:opacity-30"
                          >
                            {ocupado === 'rejeitar' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Rejeitar
                          </button>
                          {decidida && (
                            <span className="text-[10px] text-on-surface-variant">
                              Decidido por {rec.aprovacao?.gestorId}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {erro && (
                  <div className="flex items-start gap-2 text-[11px] text-risk-critical">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{erro}</span>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
