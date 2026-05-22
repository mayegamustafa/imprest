import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Receipt,
  BarChart2,
  Wallet,
  FileText,
  Settings,
} from 'lucide-react'
import { clsx } from 'clsx'
import useAppStore from '../../store/appStore'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/terms', icon: FolderOpen, label: 'Periods' },
  { to: '/entries', icon: Receipt, label: 'Expenditures' },
  { to: '/abstract', icon: BarChart2, label: 'Abstract' },
  { to: '/budgets', icon: Wallet, label: 'Budgets' },
  { to: '/reports', icon: FileText, label: 'Reports' },
]

export default function Sidebar() {
  const school = useAppStore(s => s.school)
  const currentUser = useAppStore(s => s.currentUser)
  const isAdmin = currentUser?.role === 'admin'

  return (
    <aside className="w-[220px] min-w-[220px] bg-sidebar flex flex-col h-screen sticky top-0">
      {/* Branding */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-accent rounded flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
              <path d="M7 9h10M7 13h5"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-bold leading-tight truncate">Imprest FMS</p>
            <p className="text-sidebar-text text-2xs leading-tight truncate">
              {school?.location || 'Financial Management'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx('nav-item', isActive && 'active')
              }
            >
              <Icon size={16} strokeWidth={1.75} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        {isAdmin && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <NavLink
              to="/settings"
              className={({ isActive }) => clsx('nav-item', isActive && 'active')}
            >
              <Settings size={16} strokeWidth={1.75} className="shrink-0" />
              <span>Settings</span>
            </NavLink>
          </div>
        )}
      </nav>

      {/* School name footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-sidebar-text text-2xs leading-tight truncate">
          {school?.name || 'Loading...'}
        </p>
      </div>
    </aside>
  )
}
