// Cliente do backend de queries (/api). O token (access_token do Google) é
// lido do authStore e enviado como Bearer. Em produção o nginx faz proxy
// same-origin de /api; em dev o Vite faz proxy (vite.config.ts).
import { useAuthStore } from '@/store/authStore'

export type QueryDb = 'postgres' | 'mariadb'

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
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const BASE = '/api'

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().accessToken
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Faz a request e normaliza os erros em ApiError (status 0 = backend inacessível).
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers || {}) },
    })
  } catch {
    throw new ApiError(0, 'Não foi possível falar com o servidor de queries (backend offline?).')
  }
  if (res.status === 204) return undefined as T
  let body: unknown = null
  try { body = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    if (res.status === 401) throw new ApiError(401, msg || 'Sessão expirada. Entre novamente para editar.')
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
