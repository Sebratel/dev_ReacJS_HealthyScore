import { Bell, Search, Settings, AlertTriangle, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard Executivo', subtitle: 'Health Score · Riscos Derivados · Visão Operacional' },
  '/clientes': { title: 'Clientes — Health Score', subtitle: 'Análise preditiva multimodular por cliente' },
  '/cliente360': { title: 'Cliente 360°', subtitle: 'Health Score · 6 Módulos · 3 Riscos · Timeline' },
  '/financeiro': { title: 'Financeiro', subtitle: 'Inadimplência, aging e receita em risco' },
  '/rede': { title: 'Rede & Massivas', subtitle: 'Eventos de rede e impacto no churn' },
  '/manutencao': { title: 'Manutenção', subtitle: 'Protocolos, SLA e reincidência técnica' },
  '/comercial': { title: 'Comercial', subtitle: 'Performance de vendedores e qualidade de aquisição' },
  '/ia': { title: 'IA Preditiva', subtitle: 'Health Score Engine · Previsões · Alertas automáticos' },
}

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchVal, setSearchVal] = useState('')
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  const page = PAGE_TITLES[location.pathname] ?? { title: 'Healthy Score Sebratel', subtitle: '' }

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-app-border bg-app-surface/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="flex flex-col leading-tight">
        <h1 className="text-sm font-semibold text-white">{page.title}</h1>
        <p className="text-[11px] text-gray-500">{page.subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden md:flex items-center">
          <Search size={13} className="absolute left-2.5 text-gray-500 pointer-events-none" />
          <input
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && searchVal.trim()) { navigate('/clientes'); setSearchVal('') } }}
            placeholder="Buscar cliente, cidade..."
            className="pl-8 pr-3 h-7 w-52 text-xs bg-app-card border border-app-border rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-blue/50 focus:bg-app-cardHover transition-all"
          />
        </div>

        <button className="relative h-7 w-7 flex items-center justify-center rounded-lg bg-app-card border border-app-border text-gray-400 hover:text-gray-100 hover:border-app-borderLight transition-all">
          <Bell size={13} />
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-risk-critical animate-pulse-slow" />
        </button>

        <div className="hidden lg:flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-risk-critical/10 border border-risk-critical/20 text-risk-critical cursor-default">
          <AlertTriangle size={11} />
          <span className="text-[11px] font-semibold">
            {/* This would be dynamic in a real app */}
            Clientes críticos
          </span>
        </div>

        <button className="h-7 w-7 flex items-center justify-center rounded-lg bg-app-card border border-app-border text-gray-400 hover:text-gray-100 hover:border-app-borderLight transition-all" aria-label="Configurações">
          <Settings size={13} />
        </button>

        <div className="flex items-center gap-2 h-7 pl-1 pr-1 rounded-lg bg-app-card border border-app-border">
          {user?.picture ? (
            <img src={user.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-gradient-brand flex items-center justify-center text-[10px] font-bold text-white">
              {(user?.name ?? 'U')[0].toUpperCase()}
            </div>
          )}
          <span className="text-xs text-gray-700 hidden md:block max-w-[120px] truncate">{user?.name ?? 'Usuário'}</span>
          <button
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
            className="h-6 w-6 flex items-center justify-center rounded-md text-gray-500 hover:text-risk-critical hover:bg-risk-critical/10 transition-all"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </header>
  )
}
