import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  Customer, FinancialEngineConfig, FinancialIndicatorKey, FinancialIndicatorConfig,
  CommercialEngineConfig, CommercialIndicatorKey, CommercialIndicatorConfig,
  ConnectionEngineConfig, ConnectionIndicatorKey, ConnectionIndicatorConfig,
} from '@/types'
import { cloneDefaultFinancialConfig } from '@/features/financial-engine/financialConfig'
import { cloneDefaultCommercialConfig } from '@/features/commercial-engine/commercialConfig'
import { cloneDefaultConnectionConfig } from '@/features/connection-engine/connectionConfig'

type IndexEntry = { key: string; label: string }

interface AppState {
  selectedCustomer: Customer | null
  setSelectedCustomer: (c: Customer | null) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void

  // ─── Configuração da Financial Engine (persistida) ───
  financialConfig: FinancialEngineConfig
  updateFinancialIndicator: (key: FinancialIndicatorKey, patch: Partial<FinancialIndicatorConfig>) => void
  updateFinancialIndex: (key: FinancialIndicatorKey, indexKey: string, points: number) => void
  syncPaymentForms: (forms: string[]) => void
  resetFinancialConfig: () => void

  // ─── Configuração da Commercial Engine (persistida) ───
  commercialConfig: CommercialEngineConfig
  updateCommercialIndicator: (key: CommercialIndicatorKey, patch: Partial<CommercialIndicatorConfig>) => void
  updateCommercialIndex: (key: CommercialIndicatorKey, indexKey: string, points: number) => void
  syncCommercialLists: (lists: Partial<Record<CommercialIndicatorKey, IndexEntry[]>>) => void
  resetCommercialConfig: () => void

  // ─── Configuração da Connection Engine (persistida) ───
  connectionConfig: ConnectionEngineConfig
  updateConnectionIndicator: (key: ConnectionIndicatorKey, patch: Partial<ConnectionIndicatorConfig>) => void
  updateConnectionIndex: (key: ConnectionIndicatorKey, indexKey: string, points: number) => void
  syncConnectionLists: (lists: Partial<Record<ConnectionIndicatorKey, IndexEntry[]>>) => void
  resetConnectionConfig: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedCustomer: null,
      setSelectedCustomer: (c) => set({ selectedCustomer: c }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      financialConfig: cloneDefaultFinancialConfig(),
      updateFinancialIndicator: (key, patch) =>
        set((s) => ({
          financialConfig: {
            indicators: {
              ...s.financialConfig.indicators,
              [key]: { ...s.financialConfig.indicators[key], ...patch },
            },
          },
        })),
      updateFinancialIndex: (key, indexKey, points) =>
        set((s) => {
          const indicator = s.financialConfig.indicators[key]
          const indices = (indicator.indices ?? []).map((i) =>
            i.key === indexKey ? { ...i, points } : i,
          )
          return {
            financialConfig: {
              indicators: {
                ...s.financialConfig.indicators,
                [key]: { ...indicator, indices },
              },
            },
          }
        }),
      // Reconcilia os índices de "Forma de Pagamento" com as formas ativas do banco.
      // Mantém a pontuação já configurada para formas existentes; novas entram com 0;
      // formas removidas saem. Não dispara update se nada mudou (evita re-render em loop).
      syncPaymentForms: (forms) =>
        set((s) => {
          const pm = s.financialConfig.indicators.paymentMethod
          const current = pm.indices ?? []
          const next = forms.map((title) => {
            const existing = current.find((i) => i.key === title)
            return { key: title, label: title, points: existing?.points ?? 0 }
          })
          const same =
            next.length === current.length &&
            next.every((i, idx) => current[idx]?.key === i.key && current[idx]?.points === i.points)
          if (same) return s
          return {
            financialConfig: {
              indicators: {
                ...s.financialConfig.indicators,
                paymentMethod: { ...pm, indices: next },
              },
            },
          }
        }),
      resetFinancialConfig: () => set({ financialConfig: cloneDefaultFinancialConfig() }),

      // ─── Commercial ───
      commercialConfig: cloneDefaultCommercialConfig(),
      updateCommercialIndicator: (key, patch) =>
        set((s) => ({
          commercialConfig: { indicators: { ...s.commercialConfig.indicators, [key]: { ...s.commercialConfig.indicators[key], ...patch } } },
        })),
      updateCommercialIndex: (key, indexKey, points) =>
        set((s) => {
          const indicator = s.commercialConfig.indicators[key]
          const indices = indicator.indices.map((i) => (i.key === indexKey ? { ...i, points } : i))
          return { commercialConfig: { indicators: { ...s.commercialConfig.indicators, [key]: { ...indicator, indices } } } }
        }),
      // Reconcilia os índices dinâmicos (vendedor/plano/valor/cidade/bairro) com as
      // listas reais do banco, preservando as pontuações já configuradas.
      syncCommercialLists: (lists) =>
        set((s) => {
          let changed = false
          const indicators = { ...s.commercialConfig.indicators }
          for (const k of Object.keys(lists) as CommercialIndicatorKey[]) {
            const entries = lists[k]!
            const ind = indicators[k]
            const current = ind.indices
            const next = entries.map((e) => {
              const existing = current.find((i) => i.key === e.key)
              return { key: e.key, label: e.label, points: existing?.points ?? 0 }
            })
            const same = next.length === current.length && next.every((i, idx) => current[idx]?.key === i.key && current[idx]?.points === i.points)
            if (!same) { indicators[k] = { ...ind, indices: next }; changed = true }
          }
          return changed ? { commercialConfig: { indicators } } : s
        }),
      resetCommercialConfig: () => set({ commercialConfig: cloneDefaultCommercialConfig() }),

      // ─── Connection ───
      connectionConfig: cloneDefaultConnectionConfig(),
      updateConnectionIndicator: (key, patch) =>
        set((s) => ({
          connectionConfig: { indicators: { ...s.connectionConfig.indicators, [key]: { ...s.connectionConfig.indicators[key], ...patch } } },
        })),
      updateConnectionIndex: (key, indexKey, points) =>
        set((s) => {
          const indicator = s.connectionConfig.indicators[key]
          const indices = indicator.indices.map((i) => (i.key === indexKey ? { ...i, points } : i))
          return { connectionConfig: { indicators: { ...s.connectionConfig.indicators, [key]: { ...indicator, indices } } } }
        }),
      syncConnectionLists: (lists) =>
        set((s) => {
          let changed = false
          const indicators = { ...s.connectionConfig.indicators }
          for (const k of Object.keys(lists) as ConnectionIndicatorKey[]) {
            const entries = lists[k]!
            const ind = indicators[k]
            const current = ind.indices
            const next = entries.map((e) => {
              const existing = current.find((i) => i.key === e.key)
              return { key: e.key, label: e.label, points: existing?.points ?? 0 }
            })
            const same = next.length === current.length && next.every((i, idx) => current[idx]?.key === i.key && current[idx]?.points === i.points)
            if (!same) { indicators[k] = { ...ind, indices: next }; changed = true }
          }
          return changed ? { connectionConfig: { indicators } } : s
        }),
      resetConnectionConfig: () => set({ connectionConfig: cloneDefaultConnectionConfig() }),
    }),
    {
      name: 'churniq-app',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // Persiste apenas o que faz sentido manter entre sessões.
      // (futuro: substituir por sincronização com MariaDB)
      partialize: (s) => ({ financialConfig: s.financialConfig, commercialConfig: s.commercialConfig, connectionConfig: s.connectionConfig }),
      // Mescla o estado salvo sobre os defaults atuais — garante que indicadores
      // NOVOS (adicionados após o último save) existam, preservando as notas salvas.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        const mergeConfig = <T extends { indicators: Record<string, any> }>(def: T, saved?: T): T => {
          if (!saved?.indicators) return def
          const indicators: Record<string, any> = { ...def.indicators }
          for (const k of Object.keys(def.indicators)) {
            if (saved.indicators[k]) indicators[k] = saved.indicators[k]
          }
          return { ...def, indicators } as T
        }
        return {
          ...current,
          ...p,
          financialConfig: mergeConfig(current.financialConfig, p.financialConfig),
          commercialConfig: mergeConfig(current.commercialConfig, p.commercialConfig),
          connectionConfig: mergeConfig(current.connectionConfig, p.connectionConfig),
        }
      },
    },
  ),
)
