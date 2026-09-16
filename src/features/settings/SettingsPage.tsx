import { useState } from 'react'
import { SlidersHorizontal, RotateCcw, Info, Database, Tag, ShieldCheck, Bot } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { HEALTH_LABELS } from '@/utils/healthColors'
import { useHealthColors } from '@/hooks/useHealthColors'
import type { HealthClassification } from '@/types'
import { useAppStore } from '@/store/appStore'
import type { HealthThresholds } from '@/utils/health'
import { DEFAULT_HEALTH_THRESHOLDS } from '@/utils/health'
import { cn } from '@/utils/cn'
import { QueriesPanel } from './queries/QueriesPanel'
import { IndicatorNamesTab } from './IndicatorNamesTab'
import { AccessPanel } from './AccessPanel'
import { AiProviderPanel } from './AiProviderPanel'
import { useRole } from '@/features/auth/access'

// Chaves editáveis (limite inferior de cada faixa), de cima para baixo.
const EDITABLE: { key: keyof HealthThresholds; cls: HealthClassification }[] = [
  { key: 'excellent', cls: 'excellent' },
  { key: 'healthy', cls: 'healthy' },
  { key: 'attention', cls: 'attention' },
  { key: 'high_risk', cls: 'high_risk' },
]

function PreviewBar({ t }: { t: HealthThresholds }) {
  const healthColors = useHealthColors()
  // Larguras proporcionais que somam 100 (crítico → excelente, da esquerda p/ direita).
  const segments: { cls: HealthClassification; width: number }[] = [
    { cls: 'critical', width: t.high_risk },
    { cls: 'high_risk', width: t.attention - t.high_risk },
    { cls: 'attention', width: t.healthy - t.attention },
    { cls: 'healthy', width: t.excellent - t.healthy },
    { cls: 'excellent', width: 100 - t.excellent },
  ]
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full">
      {segments.map((s) => (
        <div key={s.cls} style={{ width: `${s.width}%`, backgroundColor: healthColors[s.cls] }} title={`${HEALTH_LABELS[s.cls]} — ${s.width}%`} />
      ))}
    </div>
  )
}

type Tab = 'health' | 'names' | 'queries' | 'ia' | 'access'

const TABS: { key: Tab; label: string; icon: typeof SlidersHorizontal; adminOnly?: boolean }[] = [
  { key: 'health', label: 'Health Score', icon: SlidersHorizontal },
  { key: 'names', label: 'Nomenclaturas', icon: Tag },
  { key: 'queries', label: 'Queries do Sistema', icon: Database },
  { key: 'ia', label: 'Provedor de IA', icon: Bot, adminOnly: true },
  { key: 'access', label: 'Usuários e Acessos', icon: ShieldCheck, adminOnly: true },
]

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('health')
  const { isAdmin } = useRole()
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin)
  // Se um não-admin cair na aba de acessos (ex.: estado antigo), volta pra health.
  const active = tabs.some((t) => t.key === tab) ? tab : 'health'
  const wide = active === 'queries' || active === 'access' || active === 'ia'
  return (
    <div className={cn('space-y-5', wide ? 'max-w-5xl' : 'max-w-3xl')}>
      {/* Seletor de abas */}
      <div className="inline-flex gap-1 rounded-xl border border-outline bg-surface-container-lowest p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
              active === key ? 'bg-primary/15 text-primary' : 'text-on-surface/70 hover:text-on-surface',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {active === 'health' ? <HealthThresholdsTab />
        : active === 'names' ? <IndicatorNamesTab />
        : active === 'queries' ? <QueriesPanel />
        : active === 'ia' ? <AiProviderPanel />
        : <AccessPanel />}
    </div>
  )
}

function HealthThresholdsTab() {
  const healthColors = useHealthColors()
  const t = useAppStore((s) => s.healthThresholds)
  const updateHealthThresholds = useAppStore((s) => s.updateHealthThresholds)
  const resetHealthThresholds = useAppStore((s) => s.resetHealthThresholds)
  // As faixas valem para TODOS os setores, então só admin publica. Power user
  // setorial vê em leitura — melhor do que deixar mexer num campo que não salva.
  const { isAdmin } = useRole()

  const isDefault =
    t.excellent === DEFAULT_HEALTH_THRESHOLDS.excellent &&
    t.healthy === DEFAULT_HEALTH_THRESHOLDS.healthy &&
    t.attention === DEFAULT_HEALTH_THRESHOLDS.attention &&
    t.high_risk === DEFAULT_HEALTH_THRESHOLDS.high_risk

  // Faixa exibida (limite inferior–superior) de cada classificação.
  const rangeText: Record<HealthClassification, string> = {
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
              disabled={isDefault || !isAdmin}
              className="flex items-center gap-1.5 text-[11px] text-on-surface-variant hover:text-on-surface disabled:opacity-40 disabled:hover:text-on-surface-variant transition-colors"
            >
              <RotateCcw size={12} />Restaurar padrão
            </button>
          }
        />

        <div className="px-5 py-4 space-y-5">
          {/* Preview proporcional das faixas */}
          <div className="space-y-1.5">
            <PreviewBar t={t} />
            <div className="flex justify-between text-[10px] text-on-surface-variant/90 font-mono"><span>0</span><span>100</span></div>
          </div>

          {/* Faixas editáveis */}
          <div className="space-y-2">
            {EDITABLE.map(({ key, cls }) => {
              const color = healthColors[cls]
              const b = bounds[key]
              return (
                <div key={key} className="flex items-center gap-3 bg-surface/50 rounded-lg px-3 py-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-medium text-on-surface w-28 shrink-0">{HEALTH_LABELS[cls]}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-on-surface-variant">a partir de</span>
                    <input
                      type="number"
                      value={t[key]}
                      min={b.min}
                      max={b.max}
                      disabled={!isAdmin}
                      onChange={(e) => updateHealthThresholds({ [key]: Number(e.target.value) })}
                      className="w-16 bg-surface border border-outline rounded-md px-2 py-1 text-sm font-mono text-right text-on-surface focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  <span className="ml-auto text-[11px] font-mono text-on-surface-variant">{rangeText[cls]}</span>
                </div>
              )
            })}

            {/* Crítico — derivado, não editável */}
            <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-dashed border-outline">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: healthColors.critical }} />
              <span className="text-sm font-medium text-on-surface w-28 shrink-0">{HEALTH_LABELS.critical}</span>
              <span className="text-[11px] text-on-surface-variant">abaixo de <span className="font-mono text-on-surface/85">{t.high_risk}</span></span>
              <span className="ml-auto text-[11px] font-mono text-on-surface-variant">{rangeText.critical}</span>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-on-surface-variant bg-primary/5 border border-primary/15 rounded-lg px-3 py-2.5">
            <Info size={13} className="text-primary shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              As faixas valem para todos os módulos, contadores, gráficos e alertas da IA — a reclassificação é
              imediata. Os limites são validados automaticamente para nunca se sobreporem. Alterações são salvas como
              <strong> config oficial no servidor</strong> (valem para todos os usuários).
              {!isAdmin && (
                <> Como valem para <strong>todos os setores</strong>, só um <strong>administrador</strong> altera —
                aqui você vê as faixas em vigor.</>
              )}
            </p>
          </div>
        </div>
      </Card>
  )
}
