import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronDown, RefreshCw, Database, AlertTriangle, Info, Loader2, Lock } from 'lucide-react'
import { cn } from '@/utils/cn'
import { fetchCatalog, ApiError, type QueryItem } from './queriesApi'
import { QueryCard } from './QueryCard'

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; items: QueryItem[]; engineLabels: Record<string, string>; canEdit: boolean }

export function QueriesPanel() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  async function load() {
    setState({ status: 'loading' })
    try {
      const data = await fetchCatalog()
      setState({ status: 'ready', items: data.queries, engineLabels: data.engineLabels, canEdit: data.canEdit })
    } catch (e) {
      setState({ status: 'error', error: e instanceof ApiError ? e : new ApiError(0, 'Erro inesperado.') })
    }
  }

  useEffect(() => { load() }, [])

  const ready = state.status === 'ready' ? state : null

  // Filtro por busca (id / título / descrição / SQL).
  const filtered = useMemo(() => {
    if (!ready) return []
    const q = search.trim().toLowerCase()
    if (!q) return ready.items
    return ready.items.filter((it) =>
      it.id.toLowerCase().includes(q) ||
      it.title.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.effectiveSql.toLowerCase().includes(q),
    )
  }, [ready, search])

  // Agrupa por engine, respeitando a ordem de engineLabels.
  const groups = useMemo(() => {
    if (!ready) return []
    return Object.entries(ready.engineLabels)
      .map(([key, label]) => ({ key, label, items: filtered.filter((it) => it.engine === key) }))
      .filter((g) => g.items.length > 0)
  }, [ready, filtered])

  function updateItem(next: QueryItem) {
    setState((s) => (s.status === 'ready'
      ? { ...s, items: s.items.map((it) => (it.id === next.id ? next : it)) }
      : s))
  }

  function toggle(key: string) {
    setCollapsed((prev) => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // ── Loading ──
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-outline bg-surface-container-lowest px-5 py-8 text-sm text-on-surface/70">
        <Loader2 size={16} className="animate-spin" /> Carregando catálogo de queries…
      </div>
    )
  }

  // ── Erro ──
  if (state.status === 'error') {
    const offline = state.error.status === 0
    const expired = state.error.status === 401
    return (
      <div className="rounded-xl border border-outline bg-surface-container-lowest px-5 py-6 space-y-3">
        <div className="flex items-start gap-2.5 text-sm text-risk-critical">
          {expired ? <Lock size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <div>
            <p className="font-medium text-on-surface">
              {offline ? 'Servidor de queries indisponível' : expired ? 'Sessão expirada' : 'Não foi possível carregar as queries'}
            </p>
            <p className="mt-0.5 text-[12px] text-on-surface/70">{state.error.message}</p>
            {offline && (
              <p className="mt-1.5 text-[11px] text-on-surface-variant">
                O catálogo depende do backend (<span className="font-mono">/api</span>). Confirme que o serviço da API está no ar.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border border-outline px-3 py-1.5 text-[12px] text-on-surface/85 transition-colors hover:border-outline-strong hover:text-on-surface"
        >
          <RefreshCw size={13} /> Tentar novamente
        </button>
      </div>
    )
  }

  const r = ready!
  const editedCount = r.items.filter((it) => it.isOverridden).length

  return (
    <div className="space-y-4">
      {/* Barra superior: contexto + busca */}
      <div className="rounded-xl border border-outline bg-surface-container-lowest px-5 py-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <Database size={16} className="mt-0.5 shrink-0 text-on-surface/70" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-on-surface">Queries do Sistema</h3>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">
              {r.items.length} queries SQL do ETL · {editedCount} editada{editedCount === 1 ? '' : 's'}
              {!r.canEdit && ' · somente leitura para sua conta'}
            </p>
          </div>
          <button
            onClick={load}
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-on-surface-variant transition-colors hover:text-on-surface"
            title="Recarregar"
          >
            <RefreshCw size={12} /> recarregar
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, descrição ou trecho de SQL…"
            className="w-full rounded-lg border border-outline bg-surface py-2 pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/90 focus:border-primary/50 focus:outline-none"
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-[11px] text-on-surface-variant">
          <Info size={13} className="mt-0.5 shrink-0 text-primary" />
          <p className="leading-relaxed">
            As edições são salvas no servidor e passam a valer na <strong className="font-semibold text-on-surface/85">próxima execução do ETL</strong>
            {' '}(<span className="font-mono">fetch-clients</span>) — não alteram o snapshot já carregado. Apenas SQL de leitura
            (SELECT/WITH) é aceito. Use “Restaurar padrão” para voltar ao SQL original.
          </p>
        </div>
      </div>

      {/* Grupos por engine */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-outline bg-surface-container-lowest px-5 py-8 text-center text-sm text-on-surface-variant">
          Nenhuma query encontrada para “{search}”.
        </div>
      ) : (
        groups.map((g) => {
          const isCollapsed = collapsed.has(g.key)
          const edited = g.items.filter((it) => it.isOverridden).length
          return (
            <div key={g.key} className="overflow-hidden rounded-xl border border-outline bg-surface-container-lowest">
              <button
                onClick={() => toggle(g.key)}
                className="flex w-full items-center gap-2.5 px-5 py-3 text-left transition-colors hover:bg-surface-container-high"
              >
                <ChevronDown size={15} className={cn('text-on-surface-variant transition-transform', isCollapsed && '-rotate-90')} />
                <span className="text-sm font-semibold text-on-surface">{g.label}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">{g.items.length}</span>
                {edited > 0 && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">{edited} editada{edited === 1 ? '' : 's'}</span>
                )}
              </button>
              {!isCollapsed && (
                <div className="space-y-2.5 border-t border-outline px-3.5 py-3.5">
                  {g.items.map((it) => (
                    <QueryCard key={it.id} item={it} canEdit={r.canEdit} onChange={updateItem} />
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
