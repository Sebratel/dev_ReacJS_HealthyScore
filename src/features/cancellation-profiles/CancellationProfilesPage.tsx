import { UserMinus } from 'lucide-react'
import SuggestedScorePanel from './SuggestedScorePanel'
import CancelledClientsPanel from './CancelledClientsPanel'

// Tela de Cancelados — hoje concentra a Pontuação Sugerida pela IA: a partir
// dos padrões de cancelamento, sugere a nota de cada indicador de todas as
// engines (comparando quem cancelou com a base ativa). Os perfis de
// cancelamento manuais foram descontinuados.
export default function CancellationProfilesPage() {
  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-card-md">
        <div className="absolute -top-24 -right-12 w-80 h-80 rounded-full bg-gradient-danger opacity-[0.07] blur-3xl pointer-events-none animate-float" />
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-risk-critical/40 to-transparent" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-danger flex items-center justify-center shadow-glow-danger shrink-0">
                <UserMinus size={18} className="text-white" />
              </div>
              <h1 className="text-xl font-bold gradient-text tracking-tight">Pontuação Sugerida pela IA</h1>
            </div>
            <p className="text-xs text-gray-500 max-w-2xl leading-relaxed">
              A partir dos padrões de cancelamento, a IA sugere a pontuação de cada indicador de todas as engines —
              comparando a prevalência de cada atributo entre <strong className="text-gray-300">quem cancelou</strong> e a{' '}
              <strong className="text-gray-300">base ativa</strong>.
            </p>
          </div>
        </div>
      </div>

      <SuggestedScorePanel />

      {/* Quem cancelou — perfil compacto por cliente (dados da coorte materializada) */}
      <CancelledClientsPanel />
    </div>
  )
}
