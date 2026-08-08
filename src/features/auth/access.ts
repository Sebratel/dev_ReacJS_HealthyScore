// Papel do usuário no front — só para UX (mostrar/esconder controles). A
// autoridade real é o backend, que revalida o papel em cada request de escrita.
import { useAuthStore, hasRole, type Role } from '@/store/authStore'

// GET/PUT autenticados "QUIETOS": enviam o token atual e, em falha (ex.: token
// expirado), NÃO disparam o refresh silencioso do Google (prompt=none, que o
// navegador bloqueia) nem deslogam. Usados no boot (papel + config oficial),
// que não devem sequestrar o fluxo de autenticação. As chamadas de dados
// continuam no apiClient normal (com refresh/logout).
export async function quietAuthedGet(path: string): Promise<Response | null> {
  const token = useAuthStore.getState().accessToken
  if (!token) return null
  try {
    return await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    return null
  }
}

export async function quietAuthedPut(path: string, body: unknown): Promise<void> {
  const token = useAuthStore.getState().accessToken
  if (!token) return
  try {
    await fetch(path, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch { /* silencioso — o backend é a autoridade; retenta no próximo save */ }
}

// Busca o papel efetivo no servidor (GET /api/me) e grava no store. Silencioso:
// em falha, o papel fica null e a UI trata como viewer (esconde tudo restrito).
export async function fetchMe(): Promise<void> {
  const res = await quietAuthedGet('/api/me')
  if (!res || !res.ok) return
  const data = await res.json().catch(() => null)
  if (data?.role) useAuthStore.getState().setRole(data.role as Role)
}

// Hook de gating: papel atual + atalhos hierárquicos.
export function useRole() {
  const role = useAuthStore((s) => s.role)
  return {
    role,
    isPowerUser: hasRole(role, 'power_user'), // power_user OU admin
    isAdmin: hasRole(role, 'admin'),
  }
}
