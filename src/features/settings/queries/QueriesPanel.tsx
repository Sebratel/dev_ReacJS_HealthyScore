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
      <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-card px-5 py-8 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Carregando catálogo de queries…
      </div>
    )
  }

  // ── Erro ──
  if (state.status === 'error') {
    const offline = state.error.status === 0
    const expired = state.error.status === 401
    return (
      <div className="rounded-xl border border-app-border bg-app-card px-5 py-6 space-y-3">
        <div className="flex items-start gap-2.5 text-sm text-rose-300">
          {expired ? <Lock size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <div>
            <p className="font-medium text-gray-100">
              {offline ? 'Servidor de queries indisponível' : expired ? 'Sessão expirada' : 'Não foi possível carregar as queries'}
            </p>
            <p className="mt-0.5 text-[12px] text-gray-400">{state.error.message}</p>
            {offline && (
              <p className="mt-1.5 text-[11px] text-gray-500">
                O catálogo depende do backend (<span className="font-mono">/api</span>). Confirme que o serviço da API está no ar.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border border-app-border px-3 py-1.5 text-[12px] text-gray-300 transition-colors hover:border-app-borderLight hover:text-gray-100"
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
      <div className="rounded-xl border border-app-border bg-app-card px-5 py-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <Database size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-100">Queries do Sistema</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {r.items.length} queries SQL do ETL · {editedCount} editada{editedCount === 1 ? '' : 's'}
              {!r.canEdit && ' · somente leitura para sua conta'}
            </p>
          </div>
          <button
            onClick={load}
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-gray-500 transition-colors hover:text-gray-200"
            title="Recarregar"
          >
            <RefreshCw size={12} /> recarregar
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, descrição ou trecho de SQL…"
            className="w-full rounded-lg border border-app-border bg-app-bg py-2 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-brand-blue/50 focus:outline-none"
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-brand-blue/15 bg-brand-blue/5 px-3 py-2.5 text-[11px] text-gray-500">
          <Info size={13} className="mt-0.5 shrink-0 text-brand-blue" />
          <p className="leading-relaxed">
            As edições são salvas no servidor e passam a valer na <strong className="font-semibold text-gray-300">próxima execução do ETL</strong>
            {' '}(<span className="font-mono">fetch-clients</span>) — não alteram o snapshot já carregado. Apenas SQL de leitura
            (SELECT/WITH) é aceito. Use “Restaurar padrão” para voltar ao SQL original.
          </p>
        </div>
      </div>

      {/* Grupos por engine */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-card px-5 py-8 text-center text-sm text-gray-500">
          Nenhuma query encontrada para “{search}”.
        </div>
      ) : (
        groups.map((g) => {
          const isCollapsed = collapsed.has(g.key)
          const edited = g.items.filter((it) => it.isOverridden).length
          return (
            <div key={g.key} className="overflow-hidden rounded-xl border border-app-border bg-app-card">
              <button
                onClick={() => toggle(g.key)}
                className="flex w-full items-center gap-2.5 px-5 py-3 text-left transition-colors hover:bg-app-cardHover"
              >
                <ChevronDown size={15} className={cn('text-gray-500 transition-transform', isCollapsed && '-rotate-90')} />
                <span className="text-sm font-semibold text-gray-200">{g.label}</span>
                <span className="rounded-full bg-app-bg px-2 py-0.5 text-[10px] font-medium text-gray-500">{g.items.length}</span>
                {edited > 0 && (
                  <span className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-[10px] font-medium text-brand-blue">{edited} editada{edited === 1 ? '' : 's'}</span>
                )}
              </button>
              {!isCollapsed && (
                <div className="space-y-2.5 border-t border-app-border px-3.5 py-3.5">
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
