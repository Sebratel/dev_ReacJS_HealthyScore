import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Activity, DollarSign, Wifi, Wrench,
  TrendingUp, Brain, ChevronLeft, ChevronRight, Zap, AlertTriangle, UserSquare2,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/utils/cn'

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', sublabel: 'Executivo' },
  { path: '/clientes', icon: Users, label: 'Clientes', sublabel: 'Health Score' },
  { path: '/cliente360', icon: UserSquare2, label: 'Cliente 360°', sublabel: 'Análise Completa' },
  { path: '/financeiro', icon: DollarSign, label: 'Financeiro', sublabel: 'Inadimplência' },
  { path: '/rede', icon: Wifi, label: 'Rede', sublabel: 'Massivas' },
  { path: '/manutencao', icon: Wrench, label: 'Manutenção', sublabel: 'Protocolos' },
  { path: '/comercial', icon: TrendingUp, label: 'Comercial', sublabel: 'Vendedores' },
  { path: '/ia', icon: Brain, label: 'IA Preditiva', sublabel: 'Previsões' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const location = useLocation()

  return (
    <aside className={cn('fixed left-0 top-0 h-full flex flex-col bg-app-surface border-r border-app-border transition-all duration-300 z-40', sidebarCollapsed ? 'w-16' : 'w-56')}>
      {/* Logo */}
      <div className={cn('flex items-center border-b border-app-border h-14 shrink-0', sidebarCollapsed ? 'justify-center px-0' : 'px-4 gap-3')}>
        <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shrink-0">
          <Activity size={14} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-white tracking-tight">ChurnIQ</span>
            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Health Score</span>
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
                'flex items-center gap-3 rounded-lg transition-all duration-150 group relative',
                sidebarCollapsed ? 'justify-center h-10 w-10 mx-auto' : 'px-3 py-2.5',
                isActive ? 'bg-brand-blue/10 text-brand-blue' : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              )}
            >
              {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-blue rounded-r-full" />}
              <Icon size={16} className={cn('shrink-0', isActive ? 'text-brand-blue' : 'text-current')} />
              {!sidebarCollapsed && (
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-xs font-semibold truncate">{label}</span>
                  <span className={cn('text-[10px] truncate', isActive ? 'text-brand-blue/60' : 'text-gray-600')}>{sublabel}</span>
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Status pill */}
      {!sidebarCollapsed && (
        <div className="mx-3 mb-3 p-2.5 rounded-lg bg-app-card border border-app-border">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-gray-400">Health Engine ativo</span>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Zap size={9} className="text-brand-cyan" />
            <span className="text-[10px] text-brand-cyan font-mono">500 clientes · 6 módulos</span>
          </div>
        </div>
      )}

      {/* Collapse */}
      <button
        onClick={toggleSidebar}
        className="m-2 flex items-center justify-center h-7 rounded-lg bg-app-card border border-app-border text-gray-500 hover:text-gray-200 hover:border-app-borderLight transition-all"
      >
        {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
    </aside>
  )
}
