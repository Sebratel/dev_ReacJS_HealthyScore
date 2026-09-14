import { useMemo, useState } from 'react'
import { Search, FileText, MapPin, X } from 'lucide-react'
import type { RealClient } from '@/types'

export interface ContractFilterState {
  contract: string   // contract_number ou contract_id (tratados como o mesmo dado)
  name: string       // nome do cliente
  city: string       // cidade (seleção exata)
}

const EMPTY: ContractFilterState = { contract: '', name: '', city: '' }

// Hook reutilizável: aplica os filtros de contrato/nome/cidade sobre uma lista
// de clientes reais e devolve o subconjunto filtrado + a lista de cidades distintas.
export function useContractFilters(clients: RealClient[]) {
  const [filters, setFilters] = useState<ContractFilterState>(EMPTY)

  const cities = useMemo(
    () => Array.from(new Set(clients.map((c) => c.city).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [clients],
  )

  const filtered = useMemo(() => {
    const ct = filters.contract.trim().toLowerCase()
    const nm = filters.name.trim().toLowerCase()
    const city = filters.city
    if (!ct && !nm && !city) return clients
    return clients.filter((c) =>
      (!ct || String(c.contractNumber).toLowerCase().includes(ct) || String(c.clientId).toLowerCase().includes(ct)) &&
      (!nm || c.name.toLowerCase().includes(nm)) &&
      (!city || c.city === city),
    )
  }, [clients, filters])

  const active = !!(filters.contract || filters.name || filters.city)

  return { filters, setFilters, filtered, cities, active }
}

interface Props {
  filters: ContractFilterState
  onChange: (f: ContractFilterState) => void
  cities: string[]
  resultCount?: number
  totalCount?: number
}

export function ContractFilters({ filters, onChange, cities, resultCount, totalCount }: Props) {
  const active = !!(filters.contract || filters.name || filters.city)
  const set = (patch: Partial<ContractFilterState>) => onChange({ ...filters, ...patch })

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-outline bg-surface-container-lowest px-3 py-2.5 shadow-card-md">
      <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold px-1">Filtros</span>

      {/* Contrato (nº / id) */}
      <div className="relative flex items-center">
        <FileText size={12} className="absolute left-2.5 text-on-surface-variant pointer-events-none" />
        <input
          value={filters.contract}
          onChange={(e) => set({ contract: e.target.value })}
          placeholder="Contrato (nº / id)"
          className="pl-7 pr-2.5 h-8 w-40 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface/85 placeholder-on-surface-variant/90 focus:outline-none focus:border-primary/50 transition-all"
        />
      </div>

      {/* Nome do cliente */}
      <div className="relative flex items-center">
        <Search size={12} className="absolute left-2.5 text-on-surface-variant pointer-events-none" />
        <input
          value={filters.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Nome do cliente"
          className="pl-7 pr-2.5 h-8 w-48 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface/85 placeholder-on-surface-variant/90 focus:outline-none focus:border-primary/50 transition-all"
        />
      </div>

      {/* Cidade */}
      <div className="relative flex items-center">
        <MapPin size={12} className="absolute left-2.5 text-on-surface-variant pointer-events-none z-10" />
        <select
          value={filters.city}
          onChange={(e) => set({ city: e.target.value })}
          className="pl-7 pr-7 h-8 w-44 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface/85 focus:outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer"
        >
          <option value="">Todas as cidades</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {active && (
        <button
          onClick={() => onChange(EMPTY)}
          className="flex items-center gap-1 text-[11px] text-on-surface/70 hover:text-on-surface px-2 h-8 rounded-lg border border-outline hover:border-outline-strong transition-all"
        >
          <X size={12} /> Limpar
        </button>
      )}

      {resultCount !== undefined && (
        <span className="ml-auto text-[11px] text-on-surface-variant font-mono pr-1">
          {resultCount.toLocaleString('pt-BR')}{totalCount !== undefined ? ` / ${totalCount.toLocaleString('pt-BR')}` : ''} contratos
        </span>
      )}
    </div>
  )
}
