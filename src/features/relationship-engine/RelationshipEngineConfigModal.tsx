import { useEffect, useMemo, useState } from 'react'
import { X, SlidersHorizontal, Brain, Hand, RotateCcw, Database, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { REL_INDICATOR_ORDER } from './relationshipConfig'
import type { RelationshipIndicatorConfig, FinancialIndicatorMode, FinancialIndicatorIndex } from '@/types'
import { cn } from '@/utils/cn'

interface Props { open: boolean; onClose: () => void }
const VISIBLE_CAP = 60

function ModeToggle({ mode, onChange }: { mode: FinancialIndicatorMode; onChange: (m: FinancialIndicatorMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-app-bg border border-app-border shrink-0">
      {([{ key: 'manual', label: 'Manual', icon: Hand }, { key: 'ai', label: 'IA', icon: Brain }] as const).map(({ key, label, icon: Icon }) => (
        <button key={key} onClick={() => onChange(key)}
          className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
            mode === key ? (key === 'ai' ? 'bg-brand-violet/20 text-brand-violet' : 'bg-brand-blue/20 text-brand-blue') : 'text-gray-500 hover:text-gray-300')}>
          <Icon size={11} />{label}
        </button>
      ))}
    </div>
  )
}

function PointsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const sign = value > 0 ? 'text-risk-low' : value < 0 ? 'text-risk-critical' : 'text-gray-400'
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className={cn('w-16 bg-app-bg border border-app-border rounded-md px-2 py-1 text-sm font-mono text-right focus:outline-none focus:border-brand-blue/50 transition-colors', sign)} />
      <span className="text-[10px] text-gray-500">pts</span>
    </div>
  )
}

function IndexList({ indicatorKey, indices, dynamic }: { indicatorKey: string; indices: FinancialIndicatorIndex[]; dynamic: boolean }) {
  const updateRelationshipIndex = useAppStore((s) => s.updateRelationshipIndex)
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? indices.filter((i) => i.label.toLowerCase().includes(t)) : indices
  }, [q, indices])
  const shown = filtered.slice(0, VISIBLE_CAP)

  if (!indices.length) return <p className="text-[11px] text-gray-500 italic px-1">Nenhuma categoria sincronizada do banco ainda.</p>
  return (
    <div className="space-y-2">
      {dynamic && indices.length > 8 && (
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar entre ${indices.length}…`}
            className="w-full bg-app-bg border border-app-border rounded-lg pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-brand-blue/50 transition-colors" />
        </div>
      )}
      <div className={cn('space-y-1 pr-1', dynamic && 'max-h-60 overflow-y-auto scrollbar-thin')}>
        {shown.map((idx) => (
          <div key={idx.key} className="flex items-center justify-between gap-2 bg-app-bg/50 rounded-lg px-3 py-1.5">
            <span className="text-xs text-gray-300 truncate" title={idx.label}>{idx.label}</span>
            <PointsInput value={idx.points} onChange={(v) => updateRelationshipIndex(indicatorKey as any, idx.key, v)} />
          </div>
        ))}
        {filtered.length > VISIBLE_CAP && <p className="text-[10px] text-gray-500 text-center py-1">+{filtered.length - VISIBLE_CAP} — refine a busca</p>}
        {filtered.length === 0 && <p className="text-[11px] text-gray-600 px-1">Nada encontrado.</p>}
      </div>
    </div>
  )
}

function IndicatorCard({ indicator }: { indicator: RelationshipIndicatorConfig }) {
  const updateRelationshipIndicator = useAppStore((s) => s.updateRelationshipIndicator)
  const [showQuery, setShowQuery] = useState(false)
  const configured = indicator.indices.filter((i) => i.points !== 0).length

  return (
    <div className="rounded-xl bg-app-card border border-app-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-100">{indicator.label}</p>
            <span className="text-[9px] text-gray-500 font-mono">{indicator.indices.length} {indicator.dynamic ? 'cat.' : 'faixas'} · {configured} c/ nota</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{indicator.description}</p>
        </div>
        <ModeToggle mode={indicator.mode} onChange={(m) => updateRelationshipIndicator(indicator.key, { mode: m })} />
      </div>

      <div className="mt-3">
        {indicator.mode === 'manual' ? (
          <IndexList indicatorKey={indicator.key} indices={indicator.indices} dynamic={indicator.dynamic} />
        ) : (
          <div className="flex items-center gap-2.5 bg-brand-violet/5 border border-brand-violet/15 rounded-lg px-3 py-2.5">
            <Brain size={14} className="text-brand-violet shrink-0" />
            <p className="text-[11px] text-gray-400 leading-relaxed">Regras avançadas gerenciadas pela IA — <span className="text-brand-violet">em desenvolvimento</span>.</p>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-app-border pt-2.5">
        <button onClick={() => setShowQuery((v) => !v)} className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
          <Database size={11} />Query do indicador{showQuery ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {showQuery && (
          <textarea value={indicator.query} onChange={(e) => updateRelationshipIndicator(indicator.key, { query: e.target.value })} spellCheck={false} rows={3}
            className="mt-2 w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-[11px] font-mono text-gray-300 leading-relaxed focus:outline-none focus:border-brand-blue/50 transition-colors resize-y" />
        )}
      </div>
    </div>
  )
}

export function RelationshipEngineConfigModal({ open, onClose }: Props) {
  const relationshipConfig = useAppStore((s) => s.relationshipConfig)
  const resetRelationshipConfig = useAppStore((s) => s.resetRelationshipConfig)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-app-surface border border-app-border rounded-2xl shadow-2xl animate-slide-up">
        <div className="flex items-start justify-between px-5 py-4 border-b border-app-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-violet flex items-center justify-center"><SlidersHorizontal size={15} className="text-[#fff]" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Configuração — Relacionamento</h2>
              <p className="text-[11px] text-gray-500">Protocolos, recorrência, tipos, ameaças, atendentes e SLA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors p-1"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
          {REL_INDICATOR_ORDER.filter((key) => relationshipConfig.indicators[key]).map((key) => (
            <IndicatorCard key={key} indicator={relationshipConfig.indicators[key]} />
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border shrink-0">
          <button onClick={resetRelationshipConfig} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"><RotateCcw size={12} />Restaurar padrão</button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-600">Alterações aplicadas e salvas automaticamente</span>
            <button onClick={onClose} className="text-[11px] px-3.5 py-1.5 rounded-lg bg-brand-blue/15 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/25 transition-all font-medium">Concluir</button>
          </div>
        </div>
      </div>
    </div>
  )
}
