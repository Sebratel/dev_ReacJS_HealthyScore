import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { SkeletonCard } from '@/components/ui/SkeletonCard'

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'))
const Customer360Page = lazy(() => import('@/features/customer360/Customer360Page'))
const FinancialPage = lazy(() => import('@/features/financial/FinancialPage'))
const NetworkPage = lazy(() => import('@/features/network/NetworkPage'))
const MaintenancePage = lazy(() => import('@/features/maintenance/MaintenancePage'))
const CommercialPage = lazy(() => import('@/features/commercial/CommercialPage'))
const AiPredictivePage = lazy(() => import('@/features/ai/AiPredictivePage'))

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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <PageSuspense><DashboardPage /></PageSuspense> },
      { path: 'clientes', element: <PageSuspense><CustomersPage /></PageSuspense> },
      { path: 'cliente360', element: <PageSuspense><Customer360Page /></PageSuspense> },
      { path: 'financeiro', element: <PageSuspense><FinancialPage /></PageSuspense> },
      { path: 'rede', element: <PageSuspense><NetworkPage /></PageSuspense> },
      { path: 'manutencao', element: <PageSuspense><MaintenancePage /></PageSuspense> },
      { path: 'comercial', element: <PageSuspense><CommercialPage /></PageSuspense> },
      { path: 'ia', element: <PageSuspense><AiPredictivePage /></PageSuspense> },
    ],
  },
])
