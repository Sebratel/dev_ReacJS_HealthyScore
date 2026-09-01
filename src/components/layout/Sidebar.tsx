import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Wifi, Wrench, Brain, ChevronLeft, ChevronRight, Zap,
  DollarSign, Briefcase, Network, PackageOpen, MessageSquare, UserMinus, Truck, AlarmClock,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { realTotals } from '@/data/realClients'
import { cn } from '@/utils/cn'

const NAV_ITEMS = [
  { path: '/',                      icon: LayoutDashboard, label: 'Dashboard',       sublabel: 'Executivo' },
  { path: '/financeiro',            icon: DollarSign,      label: 'Financeiro',      sublabel: 'Inadimplência e receita' },
  { path: '/engine-comercial',      icon: Briefcase,       label: 'Comercial',       sublabel: 'Aquisição e vendedores' },
  { path: '/engine-conexao',        icon: Wifi,            label: 'Conexão',         sublabel: 'Qualidade CPE' },
  { path: '/engine-rede',           icon: Network,         label: 'Rede',            sublabel: 'Infraestrutura' },
  { path: '/manutencao',            icon: Wrench,          label: 'Manutenção',      sublabel: 'Atendimento a campo' },
  { path: '/engine-instalacao',     icon: PackageOpen,     label: 'Instalação',      sublabel: 'Qualidade de instalação' },
  { path: '/engine-relacionamento', icon: MessageSquare,   label: 'Relacionamento',  sublabel: 'NPS · Sentimento' },
  { path: '/perfis-cancelados',     icon: UserMinus,       label: 'Cancelados',      sublabel: 'Pontuação sugerida (IA)' },
  { path: '/previsao-cancelamento', icon: AlarmClock,      label: 'Previsão',        sublabel: 'Prazo de cancelamento' },
  { path: '/retiradas',             icon: Truck,           label: 'Retiradas',       sublabel: 'Equipamentos e motoboys' },
  { path: '/ia',                    icon: Brain,           label: 'IA Preditiva',    sublabel: 'Previsões' },
  // Configurações fica só no ícone de engrenagem da TopBar (não no menu).
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const location = useLocation()

  return (
    <aside className={cn('fixed left-0 top-0 h-full flex flex-col bg-surface-container-low border-r border-outline transition-all duration-300 z-40', sidebarCollapsed ? 'w-16' : 'w-56')}>
      {/* Logo */}
      <div className={cn('flex items-center border-b border-outline h-14 shrink-0', sidebarCollapsed ? 'justify-center px-0' : 'px-4 gap-3')}>
        <img src="/logo-circular-sebratel.png" alt="Sebratel" className="w-8 h-8 rounded-full shrink-0 ring-1 ring-outline" />
        {!sidebarCollapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-on-surface tracking-tight">Health Score</span>
            <span className="text-[10px] text-on-surface-variant font-medium uppercase tracking-widest">Sebratel</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto scrollbar-thin px-2">
        {NAV_ITEMS.map(({ path, icon: Icon, label, sublabel }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
          return (
            <NavLink
              key={path}
              to={path}
              title={sidebarCollapsed ? `${label} — ${sublabel}` : undefined}
              className={cn(
                'flex items-center gap-3 rounded-2xl transition-all duration-300 ease-nexa group relative min-h-[44px]',
                sidebarCollapsed ? 'justify-center h-11 w-11 mx-auto' : 'px-3 py-2.5',
                isActive
                  ? 'bg-primary text-on-primary font-bold shadow-lg shadow-primary/20'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              )}
            >
              <Icon size={16} strokeWidth={2} className={cn('shrink-0', isActive ? 'text-on-primary' : 'text-primary')} />
              {!sidebarCollapsed && (
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-xs font-semibold truncate">{label}</span>
                  <span className={cn('text-[10px] truncate', isActive ? 'text-on-primary/70' : 'text-on-surface-variant/60')}>{sublabel}</span>
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Status pill */}
      {!sidebarCollapsed && (
        <div className="mx-3 mb-3 p-2.5 rounded-lg bg-surface-container-lowest border border-outline">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-risk-low opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-risk-low" />
            </span>
            <span className="text-[10px] text-on-surface/70">Monitoramento ativo</span>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Zap size={9} className="text-primary-strong" />
            <span className="text-[10px] text-primary-strong font-mono">{realTotals.clients.toLocaleString('pt-BR')} clientes · 7 módulos</span>
          </div>
        </div>
      )}

      {/* Collapse */}
      <button
        onClick={toggleSidebar}
        className="m-2 flex items-center justify-center h-7 rounded-lg bg-surface-container-lowest border border-outline text-on-surface-variant hover:text-on-surface hover:border-outline-strong transition-all"
      >
        {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
    </aside>
  )
}
