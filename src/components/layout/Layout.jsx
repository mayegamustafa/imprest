import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import useAppStore from '../../store/appStore'
import Notification from '../ui/Notification'

export default function Layout() {
  const bootstrap = useAppStore(s => s.bootstrap)

  useEffect(() => {
    bootstrap()
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
      <Notification />
    </div>
  )
}
