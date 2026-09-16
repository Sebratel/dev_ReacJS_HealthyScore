import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Scopes } from '@/features/auth/sectors'

export interface AuthUser {
  name: string
  email: string
  picture?: string
}

// Papéis de acesso (hierárquicos): viewer < power_user < admin.
export type Role = 'viewer' | 'power_user' | 'admin'
const RANK: Record<Role, number> = { viewer: 0, power_user: 1, admin: 2 }

interface AuthState {
  user: AuthUser | null
  // access_token do Google — usado como Bearer nas chamadas ao backend (/api).
  // Expira em ~1h; em 401 o usuário é orientado a entrar novamente.
  accessToken: string | null
  // Papel efetivo, resolvido no servidor (GET /api/me). Null = ainda não sabido.
  role: Role | null
  // Setores que este usuário EDITA: '*' (todos) ou a lista. Não limita o que
  // ele vê — só onde pode mexer. Null = ainda não sabido.
  scopes: Scopes | null
  setUser: (u: AuthUser | null) => void
  setAccessToken: (t: string | null) => void
  setRole: (r: Role | null) => void
  setScopes: (s: Scopes | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      role: null,
      scopes: null,
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setRole: (role) => set({ role }),
      setScopes: (scopes) => set({ scopes }),
      logout: () => set({ user: null, accessToken: null, role: null, scopes: null }),
    }),
    { name: 'churniq-auth', storage: createJSONStorage(() => localStorage) },
  ),
)

// ─── Helpers de papel (fonte única) ────────────────────────────
// O papel é apenas para UX (mostrar/esconder); a autoridade real é o backend,
// que revalida em cada request de escrita.
export function hasRole(role: Role | null, min: Role): boolean {
  return role != null && RANK[role] >= RANK[min]
}

