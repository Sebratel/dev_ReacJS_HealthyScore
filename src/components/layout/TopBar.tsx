import { useState } from 'react'
import { Bell, Settings, AlertTriangle, LogOut, Sun, Moon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useRole } from '@/features/auth/access'
import { getPreferredTheme, toggleTheme, type ThemeMode } from '@/utils/theme'

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard Executivo', subtitle: 'Resumo dos Health Scores por módulo' },
  '/financeiro': { title: 'Financeiro', subtitle: 'Inadimplência, aging e receita em risco' },
  '/engine-comercial': { title: 'Comercial', subtitle: 'Performance de vendedores e qualidade de aquisição' },
  '/engine-conexao': { title: 'Conexão', subtitle: 'Qualidade de CPE e equipamentos' },
  '/engine-rede': { title: 'Rede', subtitle: 'Infraestrutura, massivas e impacto no churn' },
  '/manutencao': { title: 'Manutenção', subtitle: 'Protocolos, SLA e reincidência técnica' },
  '/engine-instalacao': { title: 'Instalação', subtitle: 'Qualidade e SLA de instalação' },
  '/engine-relacionamento': { title: 'Relacionamento', subtitle: 'NPS, sentimento e ameaças de cancelamento' },
  '/perfis-cancelados': { title: 'Cancelados', subtitle: 'Pontuação sugerida pela IA · Perfil de quem cancelou' },
  '/ia': { title: 'IA Preditiva', subtitle: 'Health Score combinado · Previsões · Alertas automáticos' },
  '/configuracoes': { title: 'Configurações', subtitle: 'Limiares de Health Score e parâmetros globais' },
}

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { isPowerUser } = useRole()
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getPreferredTheme())
  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  const page = PAGE_TITLES[location.pathname] ?? { title: 'Health Score Sebratel', subtitle: '' }

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-outline bg-surface-container-low/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="flex flex-col leading-tight">
        <h1 className="text-sm font-semibold text-on-surface">{page.title}</h1>
        <p className="text-[11px] text-on-surface-variant">{page.subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setThemeMode(toggleTheme())}
          title={themeMode === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          aria-label={themeMode === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="h-7 w-7 flex items-center justify-center rounded-lg bg-surface-container-lowest border border-outline text-on-surface/70 hover:text-on-surface hover:border-outline-strong transition-all"
        >
          {themeMode === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button className="relative h-7 w-7 flex items-center justify-center rounded-lg bg-surface-container-lowest border border-outline text-on-surface/70 hover:text-on-surface hover:border-outline-strong transition-all">
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

        {/* Configurações (SQL + limiares) — só power_user+ */}
        {isPowerUser && (
          <button onClick={() => navigate('/configuracoes')} className="h-7 w-7 flex items-center justify-center rounded-lg bg-surface-container-lowest border border-outline text-on-surface/70 hover:text-on-surface hover:border-outline-strong transition-all" aria-label="Configurações">
            <Settings size={13} />
          </button>
        )}

        <div className="flex items-center gap-2 h-7 pl-1 pr-1 rounded-lg bg-surface-container-lowest border border-outline">
          {user?.picture ? (
            <img src={user.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-gradient-brand flex items-center justify-center text-[10px] font-bold text-on-primary">
              {(user?.name ?? 'U')[0].toUpperCase()}
            </div>
          )}
          <span className="text-xs text-on-surface-variant/75 hidden md:block max-w-[120px] truncate">{user?.name ?? 'Usuário'}</span>
          <button
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
            className="h-6 w-6 flex items-center justify-center rounded-md text-on-surface-variant hover:text-risk-critical hover:bg-risk-critical/10 transition-all"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </header>
  )
}
