import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAppStore } from '@/store/appStore'
import { loadRealData, isRealDataLoaded } from '@/data/realClients'
import { cn } from '@/utils/cn'

type LoadStatus = 'loading' | 'ready' | 'error'

// Tela de carregamento/erro enquanto o snapshot completo da base é baixado.
function DataGate({ status, error, onRetry }: { status: LoadStatus; error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-app-bg text-white flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <img src="/logo-circular-sebratel.png" alt="Sebratel" className="w-12 h-12 rounded-full ring-1 ring-app-border" />
        {status === 'loading' ? (
          <>
            <Loader2 size={22} className="text-brand-blue animate-spin" />
            <div>
              <p className="text-sm font-semibold text-gray-100">Conectando ao servidor…</p>
              <p className="text-[11px] text-gray-500 mt-1">Carregando os metadados da base.</p>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle size={22} className="text-risk-critical" />
            <div>
              <p className="text-sm font-semibold text-gray-100">Falha ao carregar os dados</p>
              <p className="text-[11px] text-gray-500 mt-1">{error}</p>
            </div>
            <button
              onClick={onRetry}
              className="text-[11px] px-3.5 py-1.5 rounded-lg bg-brand-blue/15 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/25 transition-all font-medium"
            >
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function MainLayout() {
  const { sidebarCollapsed } = useAppStore()
  const [status, setStatus] = useState<LoadStatus>(isRealDataLoaded() ? 'ready' : 'loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (isRealDataLoaded()) { setStatus('ready'); return }
    let alive = true
    setStatus('loading')
    loadRealData()
      .then(() => { if (alive) setStatus('ready') })
      .catch((e) => { if (alive) { setError(String(e?.message ?? e)); setStatus('error') } })
    return () => { alive = false }
  }, [attempt])

  if (status !== 'ready') {
    return <DataGate status={status} error={error} onRetry={() => setAttempt((a) => a + 1)} />
  }

  return (
    <div className="min-h-screen bg-app-bg text-white">
      <Sidebar />
      <div className={cn('flex flex-col min-h-screen transition-all duration-300', sidebarCollapsed ? 'ml-16' : 'ml-56')}>
        <TopBar />
        <main className="flex-1 p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
