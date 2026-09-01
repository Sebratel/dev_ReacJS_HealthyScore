import { useEffect, useMemo, useState } from 'react'
import { X, SlidersHorizontal, Brain, Hand, RotateCcw, Database, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { COMMERCIAL_INDICATOR_ORDER } from './commercialConfig'
import type { CommercialIndicatorConfig, FinancialIndicatorMode, FinancialIndicatorIndex } from '@/types'
import { cn } from '@/utils/cn'

interface Props { open: boolean; onClose: () => void }

const VISIBLE_CAP = 60

function ModeToggle({ mode, onChange }: { mode: FinancialIndicatorMode; onChange: (m: FinancialIndicatorMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface border border-outline shrink-0">
      {([{ key: 'manual', label: 'Manual', icon: Hand }, { key: 'ai', label: 'IA', icon: Brain }] as const).map(({ key, label, icon: Icon }) => (
        <button key={key} onClick={() => onChange(key)}
          className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
            mode === key ? (key === 'ai' ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary') : 'text-on-surface-variant hover:text-on-surface/85')}>
          <Icon size={11} />{label}
        </button>
      ))}
    </div>
  )
}

function PointsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const sign = value > 0 ? 'text-risk-low' : value < 0 ? 'text-risk-critical' : 'text-on-surface/70'
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className={cn('w-16 bg-surface border border-outline rounded-md px-2 py-1 text-sm font-mono text-right focus:outline-none focus:border-primary/50 transition-colors', sign)} />
      <span className="text-[10px] text-on-surface-variant">pts</span>
    </div>
  )
}

function IndexList({ indicatorKey, indices }: { indicatorKey: string; indices: FinancialIndicatorIndex[] }) {
  const updateCommercialIndex = useAppStore((s) => s.updateCommercialIndex)
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? indices.filter((i) => i.label.toLowerCase().includes(t)) : indices
  }, [q, indices])
  const shown = filtered.slice(0, VISIBLE_CAP)

  if (!indices.length) {
    return <p className="text-[11px] text-on-surface-variant italic px-1">Nenhuma categoria sincronizada do banco ainda.</p>
  }
  return (
    <div className="space-y-2">
      {indices.length > 8 && (
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar entre ${indices.length}…`}
            className="w-full bg-surface border border-outline rounded-lg pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-primary/50 transition-colors" />
        </div>
      )}
      <div className="max-h-60 overflow-y-auto scrollbar-thin space-y-1 pr-1">
        {shown.map((idx) => (
          <div key={idx.key} className="flex items-center justify-between gap-2 bg-surface/50 rounded-lg px-3 py-1.5">
            <span className="text-xs text-on-surface/85 truncate">{idx.label}</span>
            <PointsInput value={idx.points} onChange={(v) => updateCommercialIndex(indicatorKey as any, idx.key, v)} />
          </div>
        ))}
        {filtered.length > VISIBLE_CAP && (
          <p className="text-[10px] text-on-surface-variant text-center py-1">+{filtered.length - VISIBLE_CAP} categorias — refine a busca</p>
        )}
        {filtered.length === 0 && <p className="text-[11px] text-on-surface-variant/90 px-1">Nada encontrado.</p>}
      </div>
    </div>
  )
}

function IndicatorCard({ indicator }: { indicator: CommercialIndicatorConfig }) {
  const updateCommercialIndicator = useAppStore((s) => s.updateCommercialIndicator)
  const [showQuery, setShowQuery] = useState(false)
  const configured = indicator.indices.filter((i) => i.points !== 0).length

  return (
    <div className="rounded-xl bg-surface-container-lowest border border-outline p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-on-surface">{indicator.label}</p>
            <span className="text-[9px] text-on-surface-variant font-mono">{indicator.indices.length} cat. · {configured} c/ nota</span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">{indicator.description}</p>
        </div>
        <ModeToggle mode={indicator.mode} onChange={(m) => updateCommercialIndicator(indicator.key, { mode: m })} />
      </div>

      <div className="mt-3">
        {indicator.mode === 'manual' ? (
          <IndexList indicatorKey={indicator.key} indices={indicator.indices} />
        ) : (
          <div className="flex items-center gap-2.5 bg-secondary/5 border border-secondary/15 rounded-lg px-3 py-2.5">
            <Brain size={14} className="text-secondary shrink-0" />
            <p className="text-[11px] text-on-surface/70 leading-relaxed">Regras avançadas gerenciadas pela IA — <span className="text-secondary">em desenvolvimento</span>.</p>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-outline pt-2.5">
        <button onClick={() => setShowQuery((v) => !v)} className="flex items-center gap-1.5 text-[10px] text-on-surface-variant hover:text-on-surface/85 transition-colors">
          <Database size={11} />Query do indicador{showQuery ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {showQuery && (
          <textarea value={indicator.query} onChange={(e) => updateCommercialIndicator(indicator.key, { query: e.target.value })} spellCheck={false} rows={3}
            className="mt-2 w-full bg-surface border border-outline rounded-lg px-3 py-2 text-[11px] font-mono text-on-surface/85 leading-relaxed focus:outline-none focus:border-primary/50 transition-colors resize-y" />
        )}
      </div>
    </div>
  )
}

export function CommercialEngineConfigModal({ open, onClose }: Props) {
  const commercialConfig = useAppStore((s) => s.commercialConfig)
  const resetCommercialConfig = useAppStore((s) => s.resetCommercialConfig)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-surface-container-low border border-outline rounded-2xl shadow-2xl animate-slide-up">
        <div className="flex items-start justify-between px-5 py-4 border-b border-outline shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center"><SlidersHorizontal size={15} className="text-[#fff]" /></div>
            <div>
              <h2 className="text-sm font-bold text-on-surface">Configuração — Comercial</h2>
              <p className="text-[11px] text-on-surface-variant">Defina a pontuação de cada categoria — vendedor, plano, valor, tempo, cidade e bairro</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
          {COMMERCIAL_INDICATOR_ORDER.filter((key) => commercialConfig.indicators[key]).map((key) => (
            <IndicatorCard key={key} indicator={commercialConfig.indicators[key]} />
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-outline shrink-0">
          <button onClick={resetCommercialConfig} className="flex items-center gap-1.5 text-[11px] text-on-surface-variant hover:text-on-surface/85 transition-colors"><RotateCcw size={12} />Restaurar padrão</button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-on-surface-variant/90">Alterações aplicadas e salvas automaticamente</span>
            <button onClick={onClose} className="text-[11px] px-3.5 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium">Concluir</button>
          </div>
        </div>
      </div>
    </div>
  )
}
