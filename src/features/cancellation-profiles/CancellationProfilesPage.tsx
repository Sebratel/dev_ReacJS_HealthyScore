import { useState } from 'react'
import { UserMinus, Sparkles, Users } from 'lucide-react'
import { cn } from '@/utils/cn'
import SuggestedScorePanel from './SuggestedScorePanel'
import CancelledClientsPanel from './CancelledClientsPanel'

// Tela de Cancelados — organizada em abas para reduzir a poluição visual:
//   • Pontuação IA  → sugestão de notas a partir dos padrões de cancelamento
//   • Cancelados    → perfis de quem cancelou (motivo como faixa + filtro)
const TABS = [
  { key: 'suggestion' as const, label: 'Pontuação IA', icon: Sparkles, hint: 'Notas sugeridas a partir de quem cancelou × base ativa' },
  { key: 'clients' as const, label: 'Cancelados', icon: Users, hint: 'Perfis de quem cancelou, por motivo' },
]

export default function CancellationProfilesPage() {
  const [tab, setTab] = useState<'suggestion' | 'clients'>('suggestion')
  const active = TABS.find((t) => t.key === tab)!

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Cabeçalho compacto + abas */}
      <div className="rounded-2xl border border-outline bg-surface-container-lowest shadow-card-md px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-danger flex items-center justify-center shadow-glow-danger shrink-0">
              <UserMinus size={16} className="text-on-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold gradient-text tracking-tight leading-none">Cancelados</h1>
              <p className="text-[11px] text-on-surface-variant mt-1 truncate">{active.hint}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-surface-container-low border border-outline shrink-0">
            {TABS.map((t) => {
              const Icon = t.icon
              const sel = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    sel ? 'bg-gradient-brand text-[#fff] shadow-glow' : 'text-on-surface/70 hover:text-on-surface',
                  )}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Painel da aba ativa (montado sob demanda) */}
      {tab === 'suggestion' ? <SuggestedScorePanel /> : <CancelledClientsPanel />}
    </div>
  )
}
