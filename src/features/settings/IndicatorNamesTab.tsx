import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Info, RotateCcw, Tag } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/utils/cn'
import { ENGINE_LABELS, ENGINE_ORDER, INDICATOR_CATALOG, type EngineKey } from './indicatorCatalog'

// Input controlado localmente: grava no store a cada tecla (nome não-vazio);
// se o campo ficar vazio no blur, volta a exibir o nome vigente do store.
function NameInput({ value, onCommit }: { value: string; onCommit: (label: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <input
      type="text"
      value={v}
      maxLength={60}
      onChange={(e) => {
        setV(e.target.value)
        if (e.target.value.trim()) onCommit(e.target.value.trim())
      }}
      onBlur={() => { if (!v.trim()) setV(value) }}
      className="w-full bg-app-bg border border-app-border rounded-md px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-brand-blue/50 transition-colors"
    />
  )
}

export function IndicatorNamesTab() {
  const store = useAppStore()
  const [open, setOpen] = useState<Record<EngineKey, boolean>>({
    financial: true, commercial: false, connection: false, network: false,
    field: false, installation: false, relationship: false,
  })

  // Config vigente + action de update de cada engine (mesmo shape do resto do app).
  const ENGINES: Record<EngineKey, { config: { indicators: Record<string, { label: string; description?: string }> }; update: (key: any, patch: { label: string }) => void }> = {
    financial: { config: store.financialConfig, update: store.updateFinancialIndicator },
    commercial: { config: store.commercialConfig, update: store.updateCommercialIndicator },
    connection: { config: store.connectionConfig, update: store.updateConnectionIndicator },
    network: { config: store.networkConfig, update: store.updateNetworkIndicator },
    field: { config: store.fieldConfig, update: store.updateFieldIndicator },
    installation: { config: store.installationConfig, update: store.updateInstallationIndicator },
    relationship: { config: store.relationshipConfig, update: store.updateRelationshipIndicator },
  }

  return (
    <Card>
      <CardHeader
        title="Nomenclatura dos Indicadores"
        subtitle="Renomeie os indicadores — o nome vale para todas as telas do sistema"
        icon={<Tag size={16} />}
      />

      <div className="px-5 py-4 space-y-3">
        {ENGINE_ORDER.map((engineKey) => {
          const { config, update } = ENGINES[engineKey]
          const { order, defaults } = INDICATOR_CATALOG[engineKey]
          const changedCount = order.filter((k) => (config.indicators[k]?.label ?? defaults[k]) !== defaults[k]).length
          const isOpen = open[engineKey]
          return (
            <div key={engineKey} className="rounded-xl border border-app-border bg-app-bg/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => setOpen((o) => ({ ...o, [engineKey]: !o[engineKey] }))}
                  className="flex flex-1 items-center gap-2 text-left group"
                >
                  {isOpen ? <ChevronDown size={14} className="text-brand-blue shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0 group-hover:text-gray-300" />}
                  <span className="text-sm font-semibold text-gray-100">{ENGINE_LABELS[engineKey]}</span>
                  <span className="text-[10px] font-mono text-gray-500">{order.length} indicadores</span>
                  {changedCount > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-blue/15 text-brand-blue font-medium">{changedCount} renomeado{changedCount > 1 ? 's' : ''}</span>
                  )}
                </button>
                {changedCount > 0 && (
                  <button
                    onClick={() => order.forEach((k) => { if (config.indicators[k] && config.indicators[k].label !== defaults[k]) update(k, { label: defaults[k] }) })}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-200 transition-colors shrink-0"
                    title="Restaurar os nomes padrão desta engine"
                  >
                    <RotateCcw size={11} />Restaurar nomes
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="border-t border-app-border divide-y divide-app-border/50">
                  {order.map((key) => {
                    const indicator = config.indicators[key]
                    if (!indicator) return null
                    const changed = indicator.label !== defaults[key]
                    return (
                      <div key={key} className="flex items-center gap-3 px-3 py-2">
                        <div className="w-52 shrink-0 min-w-0">
                          <p className={cn('text-[11px] truncate', changed ? 'text-gray-500 line-through' : 'text-gray-400')} title={defaults[key]}>{defaults[key]}</p>
                          {indicator.description && <p className="text-[10px] text-gray-600 truncate" title={indicator.description}>{indicator.description}</p>}
                        </div>
                        <NameInput value={indicator.label} onCommit={(label) => update(key, { label })} />
                        <button
                          onClick={() => update(key, { label: defaults[key] })}
                          disabled={!changed}
                          className="text-gray-500 hover:text-gray-200 disabled:opacity-0 transition-all shrink-0"
                          title="Restaurar nome padrão"
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <div className="flex items-start gap-2 text-[11px] text-gray-500 bg-brand-blue/5 border border-brand-blue/15 rounded-lg px-3 py-2.5">
          <Info size={13} className="text-brand-blue shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            O nome editado é aplicado em todas as telas — módulos das engines, modais de configuração, IA Preditiva,
            Pontuação Sugerida (IA) e exportação em PDF. Alterações são salvas neste navegador.
          </p>
        </div>
      </div>
    </Card>
  )
}
