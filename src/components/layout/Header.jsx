import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import useAppStore from '../../store/appStore'
import { formatUGX } from '../../lib/formatters'
import { Wallet, User, LogOut, Key, ChevronDown } from 'lucide-react'
import ChangePasswordModal from '../ChangePasswordModal'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/terms': 'Periods & Cycles',
  '/entries': 'Expenditures',
  '/abstract': 'Abstract',
  '/reports': 'Reports',
  '/settings': 'Settings',
}

const ROLE_LABELS = {
  admin: 'Administrator',
  accountant: 'Accountant',
  viewer: 'Viewer',
}

export default function Header() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'Imprest FMS'
  const { terms, activeCycleId, currentUser, logout } = useAppStore()

  const [menuOpen, setMenuOpen] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Find active cycle info
  let activeCycle = null
  for (const term of terms) {
    const found = (term.cycles || []).find(c => c.id === activeCycleId)
    if (found) { activeCycle = { ...found, term }; break }
  }

  const balance = activeCycle
    ? activeCycle.opening_balance + activeCycle.amount_received -
      ((activeCycle.total_spent || 0) - (activeCycle.total_brought_back || 0))
    : null

  async function handleLogout() {
    if (!confirm('Sign out of Imprest FMS?')) return
    await logout()
  }

  const initials = (currentUser?.full_name || currentUser?.username || '?')
    .split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <>
      <header className="h-12 bg-surface border-b border-border flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-md font-semibold text-ink shrink-0">{title}</h1>
          {activeCycle && (
            <span className="text-xs text-ink-secondary border border-border rounded px-2 py-0.5 truncate">
              {activeCycle.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {balance !== null && (
            <div className="flex items-center gap-1.5 text-sm">
              <Wallet size={14} className="text-ink-secondary" strokeWidth={1.75} />
              <span className="text-ink-secondary text-xs">Balance:</span>
              <span className={`text-xs font-semibold font-mono tabular-nums ${balance < 0 ? 'text-danger' : 'text-success'}`}>
                UGX {formatUGX(balance)}
              </span>
            </div>
          )}

          {/* User menu */}
          {currentUser && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center text-white text-2xs font-bold">
                  {initials}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-medium text-ink leading-tight">
                    {currentUser.full_name || currentUser.username}
                  </p>
                  <p className="text-2xs text-ink-secondary leading-tight">
                    {ROLE_LABELS[currentUser.role] || currentUser.role}
                  </p>
                </div>
                <ChevronDown size={12} className="text-ink-muted" />
              </button>

              {menuOpen && (
                <div className="absolute top-full right-0 mt-1 bg-surface border border-border rounded-md shadow-dropdown py-1 min-w-[180px] z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-ink truncate">{currentUser.full_name || currentUser.username}</p>
                    <p className="text-2xs text-ink-secondary">@{currentUser.username}</p>
                  </div>
                  <button
                    onClick={() => { setShowChangePw(true); setMenuOpen(false) }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-gray-50 transition-colors"
                  >
                    <Key size={13} className="text-ink-secondary" />
                    Change Password
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); handleLogout() }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-danger-light/50 transition-colors"
                  >
                    <LogOut size={13} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <ChangePasswordModal
        open={showChangePw}
        onClose={() => setShowChangePw(false)}
        onChanged={() => {}}
      />
    </>
  )
}
