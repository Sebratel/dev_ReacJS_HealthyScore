// Papel do usuário no front — só para UX (mostrar/esconder controles). A
// autoridade real é o backend, que revalida o papel em cada request de escrita.
import { apiFetch } from '@/lib/apiClient'
import { useAuthStore, hasRole, type Role } from '@/store/authStore'

// Busca o papel efetivo no servidor (GET /api/me) e grava no store. Silencioso:
// em falha, o papel fica null e a UI trata como viewer (esconde tudo restrito).
export async function fetchMe(): Promise<void> {
  try {
    const res = await apiFetch('/api/me')
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (data?.role) useAuthStore.getState().setRole(data.role as Role)
  } catch { /* offline / sem sessão — mantém null */ }
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
