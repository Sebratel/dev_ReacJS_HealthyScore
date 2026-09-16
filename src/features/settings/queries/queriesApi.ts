// Cliente do backend de queries (/api). Usa o apiFetch central — Bearer +
// renovação silenciosa do token em 401. Em produção o nginx faz proxy
// same-origin de /api; em dev o Vite faz proxy (vite.config.ts).
import { apiFetch, ApiError } from '@/lib/apiClient'

export { ApiError }

export type QueryDb = 'postgres' | 'mariadb' | 'autoisp'

export interface QueryItem {
  id: string
  engine: string
  title: string
  description: string
  db: QueryDb
  params: string[]
  defaultSql: string
  effectiveSql: string
  isOverridden: boolean
  updatedAt: string | null
  updatedBy: string | null
}

export interface CatalogResponse {
  queries: QueryItem[]
  engineLabels: Record<string, string>
  canEdit: boolean
  // Grupos do catálogo que ESTA conta pode editar: '*' = todos (power user
  // irrestrito e admin), ou a lista derivada dos setores do escopo. Ver todas
  // as queries é liberado a quem abre a tela; editar é que é por setor.
  editableGroups?: '*' | string[]
}

const BASE = '/api'

// Faz a request via apiFetch (Bearer + renovação silenciosa em 401) e normaliza
// os erros restantes em ApiError.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${BASE}${path}`, init)
  if (res.status === 204) return undefined as T
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 403) throw new ApiError(403, msg || 'Sem permissão para esta ação.')
    throw new ApiError(res.status, msg || `Erro ${res.status} no servidor de queries.`)
  }
  return body as T
}

export function fetchCatalog(): Promise<CatalogResponse> {
  return request<CatalogResponse>('/queries')
}

// Grava o override de uma query. Retorna { updatedAt, updatedBy }.
export function saveQuery(id: string, sql: string): Promise<{ updatedAt: string; updatedBy: string }> {
  return request(`/queries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
}

// Remove o override (volta ao default).
export function resetQuery(id: string): Promise<void> {
  return request(`/queries/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
