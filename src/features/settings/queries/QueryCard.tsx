import { useState } from 'react'
import { Copy, Check, Pencil, RotateCcw, AlertTriangle, Loader2, X, Save } from 'lucide-react'
import { cn } from '@/utils/cn'
import { checkReadOnly } from './sqlGuard'
import { saveQuery, resetQuery, ApiError, type QueryItem } from './queriesApi'

function DbBadge({ db }: { db: QueryItem['db'] }) {
  const meta = {
    postgres: { cls: 'bg-data-1/15 text-data-1', title: 'PostgreSQL (ELLEVEN)', tag: 'PG' },
    mariadb: { cls: 'bg-data-2/15 text-risk-medium', title: 'MariaDB (massivas)', tag: 'Maria' },
    autoisp: { cls: 'bg-risk-low/15 text-data-3', title: 'PostgreSQL (AutoISP — status ONU)', tag: 'AutoISP' },
  }[db] ?? { cls: 'bg-on-surface-variant/15 text-on-surface/85', title: db, tag: db }
  return (
    <span
      className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide', meta.cls)}
      title={meta.title}
    >
      {meta.tag}
    </span>
  )
}

interface Props {
  item: QueryItem
  canEdit: boolean
  onChange: (item: QueryItem) => void
}

export function QueryCard({ item, canEdit, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.effectiveSql)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const guard = editing ? checkReadOnly(draft) : { ok: true as const }
  const unchanged = draft.trim() === item.effectiveSql.trim()

  function startEdit() {
    setDraft(item.effectiveSql)
    setError(null)
    setEditing(true)
  }
  function cancel() {
    setEditing(false)
    setError(null)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.effectiveSql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard indisponível */ }
  }

  async function save() {
    const check = checkReadOnly(draft)
    if (!check.ok) { setError(check.reason || 'SQL inválido.'); return }
    setBusy(true); setError(null)
    try {
      const { updatedAt, updatedBy } = await saveQuery(item.id, draft)
      onChange({ ...item, effectiveSql: draft, isOverridden: true, updatedAt, updatedBy })
      setEditing(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true); setError(null)
    try {
      await resetQuery(item.id)
      onChange({ ...item, effectiveSql: item.defaultSql, isOverridden: false, updatedAt: null, updatedBy: null })
      setEditing(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao restaurar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-outline bg-surface/40">
      {/* Cabeçalho */}
      <div className="flex items-start gap-2.5 px-3.5 py-2.5">
        <DbBadge db={item.db} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-on-surface">{item.title}</span>
            <span className="font-mono text-[10px] text-on-surface-variant">{item.id}</span>
            {item.isOverridden && (
              <span
                className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary"
                title={item.updatedBy ? `por ${item.updatedBy}${item.updatedAt ? ` em ${new Date(item.updatedAt).toLocaleString('pt-BR')}` : ''}` : undefined}
              >
                editada
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">{item.description}</p>
        </div>

        {/* Ações */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-on-surface-variant transition-colors hover:text-on-surface"
            title="Copiar SQL"
          >
            {copied ? <Check size={13} className="text-risk-low" /> : <Copy size={13} />}
            {copied ? 'copiado' : 'copiar'}
          </button>
          {canEdit && !editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-on-surface-variant transition-colors hover:text-on-surface"
              title="Editar SQL"
            >
              <Pencil size={13} />editar
            </button>
          )}
        </div>
      </div>

      {/* Corpo — leitura ou edição */}
      <div className="border-t border-outline px-3.5 py-3">
        {!editing ? (
          <pre className="max-h-72 overflow-auto whitespace-pre rounded-md bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-on-surface/85">
            {item.effectiveSql.trim()}
          </pre>
        ) : (
          <div className="space-y-2.5">
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setError(null) }}
              spellCheck={false}
              rows={Math.min(24, Math.max(6, draft.split('\n').length + 1))}
              className="w-full resize-y rounded-md border border-outline bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-on-surface focus:border-primary/50 focus:outline-none"
            />

            {/* Aviso do guard (client-side) */}
            {!guard.ok && (
              <div className="flex items-start gap-2 rounded-md border border-risk-medium/30 bg-risk-medium/10 px-2.5 py-2 text-[11px] text-risk-medium">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>{guard.reason}</span>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-risk-critical/30 bg-risk-critical/10 px-2.5 py-2 text-[11px] text-risk-critical">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={busy || !guard.ok || unchanged}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-on-primary transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Salvar
              </button>
              <button
                onClick={cancel}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-on-surface/70 transition-colors hover:text-on-surface disabled:opacity-40"
              >
                <X size={13} />Cancelar
              </button>
              {item.isOverridden && (
                <button
                  onClick={reset}
                  disabled={busy}
                  className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-40"
                  title="Remove o override e volta ao SQL default"
                >
                  <RotateCcw size={12} />Restaurar padrão
                </button>
              )}
            </div>

            {/* Parâmetros posicionais (ajuda) */}
            {item.params.length > 0 && (
              <p className="text-[10px] text-on-surface-variant/90">
                Parâmetros: {item.params.join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
