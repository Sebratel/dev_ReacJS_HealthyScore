// ─────────────────────────────────────────────────────────────────────────
// Catálogo central de NOMENCLATURAS de indicadores.
//
// Fonte de verdade do nome de cada indicador = `label` dentro das configs de
// engine no store (persistidas no localStorage via zustand/persist). Este
// módulo só agrega as 7 engines num único mapa e resolve o nome com fallback
// para o padrão de fábrica — é o que garante que um rename feito em
// /configuracoes apareça igual nas engines, na IA Preditiva, nas sugestões de
// IA e no PDF, sem precisar de banco.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useAppStore } from '@/store/appStore'
import { DEFAULT_FINANCIAL_CONFIG, FINANCIAL_INDICATOR_ORDER } from '@/features/financial-engine/financialConfig'
import { DEFAULT_COMMERCIAL_CONFIG, COMMERCIAL_INDICATOR_ORDER } from '@/features/commercial-engine/commercialConfig'
import { DEFAULT_CONNECTION_CONFIG, CONNECTION_INDICATOR_ORDER } from '@/features/connection-engine/connectionConfig'
import { DEFAULT_NETWORK_CONFIG, NET_INDICATOR_ORDER } from '@/features/network-engine/networkConfig'
import { DEFAULT_FIELD_CONFIG, FIELD_INDICATOR_ORDER } from '@/features/field-engine/fieldConfig'
import { DEFAULT_INSTALLATION_CONFIG, INSTALL_INDICATOR_ORDER } from '@/features/installation-engine/installationConfig'
import { DEFAULT_RELATIONSHIP_CONFIG, REL_INDICATOR_ORDER } from '@/features/relationship-engine/relationshipConfig'

export type EngineKey =
  | 'financial' | 'commercial' | 'connection' | 'network'
  | 'field' | 'installation' | 'relationship'

export const ENGINE_ORDER: EngineKey[] = [
  'financial', 'commercial', 'connection', 'network', 'field', 'installation', 'relationship',
]

export const ENGINE_LABELS: Record<EngineKey, string> = {
  financial: 'Financeiro',
  commercial: 'Comercial',
  connection: 'Conexão',
  network: 'Rede',
  field: 'Manutenção',
  installation: 'Instalação',
  relationship: 'Relacionamento',
}

type ConfigLike = { indicators: Record<string, { label: string; description?: string }> }

const defaultsOf = (cfg: ConfigLike): Record<string, string> =>
  Object.fromEntries(Object.entries(cfg.indicators).map(([k, v]) => [k, v.label]))

// Ordem de exibição + nomes de fábrica de cada engine (usado pela aba de
// Nomenclaturas e como fallback quando o nome salvo estiver vazio/ausente).
export const INDICATOR_CATALOG: Record<EngineKey, { order: string[]; defaults: Record<string, string> }> = {
  financial: { order: FINANCIAL_INDICATOR_ORDER, defaults: defaultsOf(DEFAULT_FINANCIAL_CONFIG) },
  commercial: { order: COMMERCIAL_INDICATOR_ORDER, defaults: defaultsOf(DEFAULT_COMMERCIAL_CONFIG) },
  connection: { order: CONNECTION_INDICATOR_ORDER, defaults: defaultsOf(DEFAULT_CONNECTION_CONFIG) },
  network: { order: NET_INDICATOR_ORDER, defaults: defaultsOf(DEFAULT_NETWORK_CONFIG) },
  field: { order: FIELD_INDICATOR_ORDER, defaults: defaultsOf(DEFAULT_FIELD_CONFIG) },
  installation: { order: INSTALL_INDICATOR_ORDER, defaults: defaultsOf(DEFAULT_INSTALLATION_CONFIG) },
  relationship: { order: REL_INDICATOR_ORDER, defaults: defaultsOf(DEFAULT_RELATIONSHIP_CONFIG) },
}

export type IndicatorLabelMap = Record<EngineKey, Record<string, string>>

// Mapa vivo engine → indicador → nome atual, lido do store (reativo).
export function useIndicatorLabelMap(): IndicatorLabelMap {
  const financial = useAppStore((s) => s.financialConfig)
  const commercial = useAppStore((s) => s.commercialConfig)
  const connection = useAppStore((s) => s.connectionConfig)
  const network = useAppStore((s) => s.networkConfig)
  const field = useAppStore((s) => s.fieldConfig)
  const installation = useAppStore((s) => s.installationConfig)
  const relationship = useAppStore((s) => s.relationshipConfig)
  return useMemo(() => ({
    financial: defaultsOf(financial),
    commercial: defaultsOf(commercial),
    connection: defaultsOf(connection),
    network: defaultsOf(network),
    field: defaultsOf(field),
    installation: defaultsOf(installation),
    relationship: defaultsOf(relationship),
  }), [financial, commercial, connection, network, field, installation, relationship])
}

// Resolve o nome exibido de um indicador: nome salvo → padrão → fallback → key.
export function resolveIndicatorLabel(
  map: IndicatorLabelMap,
  engine: EngineKey,
  key: string,
  fallback?: string,
): string {
  const saved = map[engine]?.[key]?.trim()
  return saved || INDICATOR_CATALOG[engine]?.defaults[key] || fallback || key
}
