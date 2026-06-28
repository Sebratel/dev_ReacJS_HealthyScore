import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { useAuthStore } from '@/store/authStore'

const LoginPage = lazy(() => import('@/features/auth/LoginPage'))

const DashboardPage         = lazy(() => import('@/features/dashboard/DashboardPage'))
const FieldEnginePage         = lazy(() => import('@/features/field-engine/FieldEnginePage'))
const InstallationEnginePage  = lazy(() => import('@/features/installation-engine/InstallationEnginePage'))
const AiPredictivePage      = lazy(() => import('@/features/ai/AiPredictivePage'))
const FinancialEnginePage   = lazy(() => import('@/features/financial-engine/FinancialEnginePage'))
const CommercialEnginePage  = lazy(() => import('@/features/commercial-engine/CommercialEnginePage'))
const ConnectionEnginePage  = lazy(() => import('@/features/connection-engine/ConnectionEnginePage'))
const NetworkEnginePage         = lazy(() => import('@/features/network-engine/NetworkEnginePage'))
const RelationshipEnginePage    = lazy(() => import('@/features/relationship-engine/RelationshipEnginePage'))
const SettingsPage              = lazy(() => import('@/features/settings/SettingsPage'))

function PageLoader() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}

function PageSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

// Protege as rotas autenticadas — sem usuário → vai para /login
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Rota de login — já autenticado → vai para o dashboard
function LoginRoute() {
  const user = useAuthStore((s) => s.user)
  if (user) return <Navigate to="/" replace />
  return <Suspense fallback={<PageLoader />}><LoginPage /></Suspense>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginRoute /> },
  {
    path: '/',
    element: <RequireAuth><MainLayout /></RequireAuth>,
    children: [
      { index: true,                    element: <PageSuspense><DashboardPage /></PageSuspense> },
      { path: 'financeiro',             element: <PageSuspense><FinancialEnginePage /></PageSuspense> },
      { path: 'manutencao',             element: <PageSuspense><FieldEnginePage /></PageSuspense> },
      { path: 'engine-instalacao',      element: <PageSuspense><InstallationEnginePage /></PageSuspense> },
      { path: 'ia',                     element: <PageSuspense><AiPredictivePage /></PageSuspense> },
      { path: 'engine-comercial',       element: <PageSuspense><CommercialEnginePage /></PageSuspense> },
      { path: 'engine-conexao',         element: <PageSuspense><ConnectionEnginePage /></PageSuspense> },
      { path: 'engine-rede',            element: <PageSuspense><NetworkEnginePage /></PageSuspense> },
      { path: 'engine-relacionamento',  element: <PageSuspense><RelationshipEnginePage /></PageSuspense> },
      { path: 'configuracoes',          element: <PageSuspense><SettingsPage /></PageSuspense> },
      // Rotas antigas removidas → redireciona para o dashboard
      { path: 'clientes',               element: <Navigate to="/" replace /> },
      { path: 'cliente360',             element: <Navigate to="/" replace /> },
      { path: 'cancelamentos',          element: <Navigate to="/" replace /> },
      { path: 'concorrencia',           element: <Navigate to="/" replace /> },
    ],
  },
])
