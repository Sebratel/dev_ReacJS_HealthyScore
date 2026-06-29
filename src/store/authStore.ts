import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AuthUser {
  name: string
  email: string
  picture?: string
}

interface AuthState {
  user: AuthUser | null
  // access_token do Google — usado como Bearer nas chamadas ao backend (/api).
  // Expira em ~1h; em 401 o usuário é orientado a entrar novamente.
  accessToken: string | null
  setUser: (u: AuthUser | null) => void
  setAccessToken: (t: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ user: null, accessToken: null }),
    }),
    { name: 'churniq-auth', storage: createJSONStorage(() => localStorage) },
  ),
)
