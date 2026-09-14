import { useEffect, useState } from 'react'
import { X, SlidersHorizontal, Brain, Hand, RotateCcw, Database, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { FINANCIAL_INDICATOR_ORDER } from './financialConfig'
import type { FinancialIndicatorConfig, FinancialIndicatorMode } from '@/types'
import { cn } from '@/utils/cn'

interface Props {
  open: boolean
  onClose: () => void
}

// ─── Controle segmentado Manual / IA ───────────────────────────
function ModeToggle({ mode, onChange }: { mode: FinancialIndicatorMode; onChange: (m: FinancialIndicatorMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface border border-outline shrink-0">
      {([
        { key: 'manual', label: 'Manual', icon: Hand },
        { key: 'ai',     label: 'IA',     icon: Brain },
      ] as const).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
            mode === key
              ? key === 'ai'
                ? 'bg-secondary/20 text-secondary'
                : 'bg-primary/20 text-primary'
              : 'text-on-surface-variant hover:text-on-surface/85',
          )}
        >
          <Icon size={11} />
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Input de pontuação (aceita negativos) ─────────────────────
function PointsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const sign = value > 0 ? 'text-risk-low' : value < 0 ? 'text-risk-critical' : 'text-on-surface/70'
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'w-20 bg-surface border border-outline rounded-md px-2 py-1 text-sm font-mono text-right focus:outline-none focus:border-primary/50 transition-colors',
          sign,
        )}
      />
      <span className="text-[10px] text-on-surface-variant">pts</span>
    </div>
  )
}

// ─── Card de um indicador ──────────────────────────────────────
function IndicatorCard({ indicator }: { indicator: FinancialIndicatorConfig }) {
  const { updateFinancialIndicator, updateFinancialIndex } = useAppStore()
  const [showQuery, setShowQuery] = useState(false)
  const isManual = indicator.mode === 'manual'
  const hasIndices = !!indicator.indices?.length

  return (
    <div className="rounded-xl bg-surface-container-lowest border border-outline p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{indicator.label}</p>
          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">{indicator.description}</p>
        </div>
        <ModeToggle mode={indicator.mode} onChange={(m) => updateFinancialIndicator(indicator.key, { mode: m })} />
      </div>

      {/* Corpo */}
      <div className="mt-3">
        {isManual ? (
          hasIndices ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Índices</p>
              {indicator.indices!.map((idx) => (
                <div key={idx.key} className="flex items-center justify-between bg-surface/50 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-on-surface/85">{idx.label}</span>
                  <PointsInput value={idx.points} onChange={(v) => updateFinancialIndex(indicator.key, idx.key, v)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-surface/50 rounded-lg px-3 py-2">
              <span className="text-xs text-on-surface/70">Pontuação ao detectar no contrato</span>
              <PointsInput value={indicator.points} onChange={(v) => updateFinancialIndicator(indicator.key, { points: v })} />
            </div>
          )
        ) : (
          <div className="flex items-center gap-2.5 bg-secondary/5 border border-secondary/15 rounded-lg px-3 py-2.5">
            <Brain size={14} className="text-secondary shrink-0" />
            <p className="text-[11px] text-on-surface/70 leading-relaxed">
              Regras avançadas gerenciadas pela IA — <span className="text-secondary">em desenvolvimento</span>. O modelo aprende o peso ideal deste indicador a partir do histórico.
            </p>
          </div>
        )}
      </div>

      {/* Query */}
      <div className="mt-3 border-t border-outline pt-2.5">
        <button
          onClick={() => setShowQuery((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] text-on-surface-variant hover:text-on-surface/85 transition-colors"
        >
          <Database size={11} />
          Query do indicador
          {showQuery ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {showQuery && (
          <textarea
            value={indicator.query}
            onChange={(e) => updateFinancialIndicator(indicator.key, { query: e.target.value })}
            spellCheck={false}
            rows={4}
            className="mt-2 w-full bg-surface border border-outline rounded-lg px-3 py-2 text-[11px] font-mono text-on-surface/85 leading-relaxed focus:outline-none focus:border-primary/50 transition-colors resize-y"
          />
        )}
      </div>
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────
export function FinancialEngineConfigModal({ open, onClose }: Props) {
  const { financialConfig, resetFinancialConfig } = useAppStore()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-scrim/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Painel */}
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-surface-container-low border border-outline rounded-2xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-outline shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <SlidersHorizontal size={15} className="text-on-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-on-surface">Configuração — Financeiro</h2>
              <p className="text-[11px] text-on-surface-variant">Defina como cada indicador pontua o score — manualmente ou via IA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Lista de indicadores */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
          {FINANCIAL_INDICATOR_ORDER.map((key) => (
            <IndicatorCard key={key} indicator={financialConfig.indicators[key]} />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-outline shrink-0">
          <button
            onClick={resetFinancialConfig}
            className="flex items-center gap-1.5 text-[11px] text-on-surface-variant hover:text-on-surface/85 transition-colors"
          >
            <RotateCcw size={12} />
            Restaurar padrão
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-on-surface-variant/90">Alterações aplicadas e salvas automaticamente</span>
            <button
              onClick={onClose}
              className="text-[11px] px-3.5 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
