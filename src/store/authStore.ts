import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AuthUser {
  name: string
  email: string
  picture?: string
}

interface AuthState {
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'churniq-auth', storage: createJSONStorage(() => localStorage) },
  ),
)
