import { useEffect, useState } from 'react'
import { X, Play, Loader2, AlertTriangle, Users } from 'lucide-react'
import { HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { formatCurrency } from '@/utils/cn'
import { realByCity } from '@/data/realClients'
import { previewRun, startRun, ApiError, type Criterio, type Preview } from './actionPlansApi'

// Diálogo centralizado (portal implícito via fixed) em vez de popover: o
// gatilho vive num cabeçalho de card com rolagem, e popover ancorado ali é
// recortado pela borda do contêiner.

const CLASS_OPTS = [
  { key: 'critical', label: `Somente ${HEALTH_LABELS.critical}` },
  { key: 'high_risk', label: `${HEALTH_LABELS.critical} + ${HEALTH_LABELS.high_risk}` },
  { key: 'attention', label: `${HEALTH_LABELS.critical} + ${HEALTH_LABELS.high_risk} + ${HEALTH_LABELS.attention}` },
]

interface Props {
  padrao: Criterio
  onClose: () => void
  onStarted: (runId: number) => void
}

export function NewRunDialog({ padrao, onClose, onStarted }: Props) {
  const [quantidade, setQuantidade] = useState(padrao.quantidade)
  const [classificacaoMinima, setClassificacaoMinima] = useState(padrao.classificacaoMinima)
  const [cidade, setCidade] = useState('')
  const [mrrMin, setMrrMin] = useState('')
  const [mrrMax, setMrrMax] = useState('')

  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewErro, setPreviewErro] = useState<string | null>(null)
  const [carregandoPreview, setCarregandoPreview] = useState(false)
  const [disparando, setDisparando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const criterio = (): Partial<Criterio> => ({
    quantidade,
    classificacaoMinima,
    cidade: cidade || null,
    mrrMin: mrrMin ? Number(mrrMin) : null,
    mrrMax: mrrMax ? Number(mrrMax) : null,
  })

  // Prévia a cada mudança: o gestor vê quantos contratos entram ANTES de gastar
  // uma chamada de IA por contrato.
  useEffect(() => {
    let alive = true
    setCarregandoPreview(true)
    setPreviewErro(null)
    const id = setTimeout(() => {
      previewRun(criterio())
        .then((p) => { if (alive) { setPreview(p); setCarregandoPreview(false) } })
        .catch((e) => {
          if (!alive) return
          setPreview(null)
          setPreviewErro(e instanceof ApiError ? e.message : 'Não foi possível calcular a prévia.')
          setCarregandoPreview(false)
        })
    }, 350)
    return () => { alive = false; clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantidade, classificacaoMinima, cidade, mrrMin, mrrMax])

  const disparar = async () => {
    setDisparando(true)
    setErro(null)
    try {
      const r = await startRun(criterio())
      onStarted(r.runId)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível iniciar a rodada.')
      setDisparando(false)
    }
  }

  const cidades = realByCity.map((c) => c.city).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-outline bg-surface-container-lowest shadow-card-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline">
          <div>
            <h2 className="text-sm font-bold text-on-surface">Nova rodada de planos</h2>
            <p className="text-[11px] text-on-surface-variant mt-0.5">Setor Financeiro · um plano por contrato selecionado</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Quantidade de contratos</span>
              <input
                type="number" min={1} max={200} value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Cidade</span>
              <select
                value={cidade} onChange={(e) => setCidade(e.target.value)}
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
              >
                <option value="">Todas</option>
                {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Classificação mínima</span>
            <select
              value={classificacaoMinima} onChange={(e) => setClassificacaoMinima(e.target.value)}
              className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
            >
              {CLASS_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Mensalidade mínima</span>
              <input
                type="number" min={0} value={mrrMin} onChange={(e) => setMrrMin(e.target.value)} placeholder="sem limite"
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface placeholder-on-surface-variant/70 focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Mensalidade máxima</span>
              <input
                type="number" min={0} value={mrrMax} onChange={(e) => setMrrMax(e.target.value)} placeholder="sem limite"
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface placeholder-on-surface-variant/70 focus:outline-none focus:border-primary/50"
              />
            </label>
          </div>

          {/* Prévia */}
          <div className="rounded-lg border border-outline bg-surface-container-low/50 px-3 py-2.5">
            {carregandoPreview ? (
              <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                <Loader2 size={12} className="animate-spin" /> Calculando quantos contratos entram…
              </div>
            ) : previewErro ? (
              <div className="flex items-start gap-2 text-[11px] text-risk-critical">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{previewErro}</span>
              </div>
            ) : preview ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-on-surface">
                  <Users size={12} className="text-primary shrink-0" />
                  <span>
                    <strong>{preview.selecionados}</strong> contrato(s) entram nesta rodada
                    {preview.disponiveis > preview.selecionados && (
                      <span className="text-on-surface-variant"> · {preview.disponiveis} atendem ao critério</span>
                    )}
                  </span>
                </div>
                {preview.amostra.length > 0 && (
                  <ul className="space-y-0.5">
                    {preview.amostra.map((a) => (
                      <li key={a.clienteId} className="text-[10px] text-on-surface-variant font-mono truncate">
                        #{a.clienteId} · {a.nome} · health {a.healthScore} · {formatCurrency(a.mrr)}
                      </li>
                    ))}
                    {preview.selecionados > preview.amostra.length && (
                      <li className="text-[10px] text-on-surface-variant/70">e mais {preview.selecionados - preview.amostra.length}…</li>
                    )}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          {erro && (
            <div className="flex items-start gap-2 text-[11px] text-risk-critical">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{erro}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-outline">
          <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded-lg border border-outline text-on-surface/80 hover:border-outline-strong transition-colors">
            Cancelar
          </button>
          <button
            onClick={disparar}
            disabled={disparando || !preview || preview.selecionados === 0}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium disabled:opacity-30"
          >
            {disparando ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {disparando ? 'Iniciando…' : `Gerar ${preview?.selecionados ?? 0} plano(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
