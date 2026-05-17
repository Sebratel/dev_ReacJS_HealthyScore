import { create } from 'zustand'
import { Customer } from '@/types'

interface AppState {
  selectedCustomer: Customer | null
  setSelectedCustomer: (c: Customer | null) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCustomer: null,
  setSelectedCustomer: (c) => set({ selectedCustomer: c }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
}))
