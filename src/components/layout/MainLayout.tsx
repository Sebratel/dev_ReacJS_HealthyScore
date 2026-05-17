import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/utils/cn'

export function MainLayout() {
  const { sidebarCollapsed } = useAppStore()

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
