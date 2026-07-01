import { useState } from 'react'
import { SlidersHorizontal, RotateCcw, Info, Database } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { HEALTH_COLORS, HEALTH_LABELS } from '@/components/ui/HealthGauge'
import { useAppStore } from '@/store/appStore'
import type { HealthThresholds } from '@/utils/health'
import { DEFAULT_HEALTH_THRESHOLDS } from '@/utils/health'
import { cn } from '@/utils/cn'
import { QueriesPanel } from './queries/QueriesPanel'

// Chaves editáveis (limite inferior de cada faixa), de cima para baixo.
const EDITABLE: { key: keyof HealthThresholds; cls: keyof typeof HEALTH_COLORS }[] = [
  { key: 'excellent', cls: 'excellent' },
  { key: 'healthy', cls: 'healthy' },
  { key: 'attention', cls: 'attention' },
  { key: 'high_risk', cls: 'high_risk' },
]

function PreviewBar({ t }: { t: HealthThresholds }) {
  // Larguras proporcionais que somam 100 (crítico → excelente, da esquerda p/ direita).
  const segments: { cls: keyof typeof HEALTH_COLORS; width: number }[] = [
    { cls: 'critical', width: t.high_risk },
    { cls: 'high_risk', width: t.attention - t.high_risk },
    { cls: 'attention', width: t.healthy - t.attention },
    { cls: 'healthy', width: t.excellent - t.healthy },
    { cls: 'excellent', width: 100 - t.excellent },
  ]
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full">
      {segments.map((s) => (
        <div key={s.cls} style={{ width: `${s.width}%`, backgroundColor: HEALTH_COLORS[s.cls] }} title={`${HEALTH_LABELS[s.cls]} — ${s.width}%`} />
      ))}
    </div>
  )
}

type Tab = 'health' | 'queries'

const TABS: { key: Tab; label: string; icon: typeof SlidersHorizontal }[] = [
  { key: 'health', label: 'Health Score', icon: SlidersHorizontal },
  { key: 'queries', label: 'Queries do Sistema', icon: Database },
]

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('health')
  return (
    <div className={cn('space-y-5', tab === 'queries' ? 'max-w-5xl' : 'max-w-3xl')}>
      {/* Seletor de abas */}
      <div className="inline-flex gap-1 rounded-xl border border-app-border bg-app-card p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
              tab === key ? 'bg-brand-blue/15 text-brand-blue' : 'text-gray-400 hover:text-gray-200',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'health' ? <HealthThresholdsTab /> : <QueriesPanel />}
    </div>
  )
}

function HealthThresholdsTab() {
  const t = useAppStore((s) => s.healthThresholds)
  const updateHealthThresholds = useAppStore((s) => s.updateHealthThresholds)
  const resetHealthThresholds = useAppStore((s) => s.resetHealthThresholds)

  const isDefault =
    t.excellent === DEFAULT_HEALTH_THRESHOLDS.excellent &&
    t.healthy === DEFAULT_HEALTH_THRESHOLDS.healthy &&
    t.attention === DEFAULT_HEALTH_THRESHOLDS.attention &&
    t.high_risk === DEFAULT_HEALTH_THRESHOLDS.high_risk

  // Faixa exibida (limite inferior–superior) de cada classificação.
  const rangeText: Record<keyof typeof HEALTH_COLORS, string> = {
    excellent: `${t.excellent} – 100`,
    healthy: `${t.healthy} – ${t.excellent - 1}`,
    attention: `${t.attention} – ${t.healthy - 1}`,
    high_risk: `${t.high_risk} – ${t.attention - 1}`,
    critical: `0 – ${t.high_risk - 1}`,
  }

  // Limites válidos para cada input, com base nos vizinhos (mantém ordem decrescente).
  const bounds: Record<keyof HealthThresholds, { min: number; max: number }> = {
    high_risk: { min: 1, max: t.attention - 1 },
    attention: { min: t.high_risk + 1, max: t.healthy - 1 },
    healthy: { min: t.attention + 1, max: t.excellent - 1 },
    excellent: { min: t.healthy + 1, max: 100 },
  }

  return (
    <Card>
      <CardHeader
        title="Faixas de Health Score"
          subtitle="Define como o score de cada cliente é classificado em todo o sistema"
          icon={<SlidersHorizontal size={16} />}
          action={
            <button
              onClick={resetHealthThresholds}
              disabled={isDefault}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-200 disabled:opacity-40 disabled:hover:text-gray-500 transition-colors"
            >
              <RotateCcw size={12} />Restaurar padrão
            </button>
          }
        />

        <div className="px-5 py-4 space-y-5">
          {/* Preview proporcional das faixas */}
          <div className="space-y-1.5">
            <PreviewBar t={t} />
            <div className="flex justify-between text-[10px] text-gray-600 font-mono"><span>0</span><span>100</span></div>
          </div>

          {/* Faixas editáveis */}
          <div className="space-y-2">
            {EDITABLE.map(({ key, cls }) => {
              const color = HEALTH_COLORS[cls]
              const b = bounds[key]
              return (
                <div key={key} className="flex items-center gap-3 bg-app-bg/50 rounded-lg px-3 py-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-medium text-gray-200 w-28 shrink-0">{HEALTH_LABELS[cls]}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">a partir de</span>
                    <input
                      type="number"
                      value={t[key]}
                      min={b.min}
                      max={b.max}
                      onChange={(e) => updateHealthThresholds({ [key]: Number(e.target.value) })}
                      className="w-16 bg-app-bg border border-app-border rounded-md px-2 py-1 text-sm font-mono text-right text-gray-100 focus:outline-none focus:border-brand-blue/50 transition-colors"
                    />
                  </div>
                  <span className="ml-auto text-[11px] font-mono text-gray-500">{rangeText[cls]}</span>
                </div>
              )
            })}

            {/* Crítico — derivado, não editável */}
            <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-dashed border-app-border">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: HEALTH_COLORS.critical }} />
              <span className="text-sm font-medium text-gray-200 w-28 shrink-0">{HEALTH_LABELS.critical}</span>
              <span className="text-[11px] text-gray-500">abaixo de <span className="font-mono text-gray-300">{t.high_risk}</span></span>
              <span className="ml-auto text-[11px] font-mono text-gray-500">{rangeText.critical}</span>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-gray-500 bg-brand-blue/5 border border-brand-blue/15 rounded-lg px-3 py-2.5">
            <Info size={13} className="text-brand-blue shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              As faixas valem para todos os módulos, contadores, gráficos e alertas da IA — a reclassificação é
              imediata. Os limites são validados automaticamente para nunca se sobreporem. Alterações são salvas neste
              navegador.
            </p>
          </div>
        </div>
      </Card>
  )
}
