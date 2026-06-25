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
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-app-bg border border-app-border shrink-0">
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
                ? 'bg-brand-violet/20 text-brand-violet'
                : 'bg-brand-blue/20 text-brand-blue'
              : 'text-gray-500 hover:text-gray-300',
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
  const sign = value > 0 ? 'text-risk-low' : value < 0 ? 'text-risk-critical' : 'text-gray-400'
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'w-20 bg-app-bg border border-app-border rounded-md px-2 py-1 text-sm font-mono text-right focus:outline-none focus:border-brand-blue/50 transition-colors',
          sign,
        )}
      />
      <span className="text-[10px] text-gray-500">pts</span>
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
    <div className="rounded-xl bg-app-card border border-app-border p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100">{indicator.label}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{indicator.description}</p>
        </div>
        <ModeToggle mode={indicator.mode} onChange={(m) => updateFinancialIndicator(indicator.key, { mode: m })} />
      </div>

      {/* Corpo */}
      <div className="mt-3">
        {isManual ? (
          hasIndices ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Índices</p>
              {indicator.indices!.map((idx) => (
                <div key={idx.key} className="flex items-center justify-between bg-app-bg/50 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-gray-300">{idx.label}</span>
                  <PointsInput value={idx.points} onChange={(v) => updateFinancialIndex(indicator.key, idx.key, v)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-app-bg/50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400">Pontuação ao detectar no contrato</span>
              <PointsInput value={indicator.points} onChange={(v) => updateFinancialIndicator(indicator.key, { points: v })} />
            </div>
          )
        ) : (
          <div className="flex items-center gap-2.5 bg-brand-violet/5 border border-brand-violet/15 rounded-lg px-3 py-2.5">
            <Brain size={14} className="text-brand-violet shrink-0" />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Regras avançadas gerenciadas pela IA — <span className="text-brand-violet">em desenvolvimento</span>. O modelo aprende o peso ideal deste indicador a partir do histórico.
            </p>
          </div>
        )}
      </div>

      {/* Query */}
      <div className="mt-3 border-t border-app-border pt-2.5">
        <button
          onClick={() => setShowQuery((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
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
            className="mt-2 w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-[11px] font-mono text-gray-300 leading-relaxed focus:outline-none focus:border-brand-blue/50 transition-colors resize-y"
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Painel */}
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-app-surface border border-app-border rounded-2xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-app-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-violet flex items-center justify-center">
              <SlidersHorizontal size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Configuração — Financeiro</h2>
              <p className="text-[11px] text-gray-500">Defina como cada indicador pontua o score — manualmente ou via IA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors p-1">
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border shrink-0">
          <button
            onClick={resetFinancialConfig}
            className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RotateCcw size={12} />
            Restaurar padrão
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-600">Alterações aplicadas e salvas automaticamente</span>
            <button
              onClick={onClose}
              className="text-[11px] px-3.5 py-1.5 rounded-lg bg-brand-blue/15 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/25 transition-all font-medium"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
