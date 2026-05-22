import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Terms from './pages/Terms'
import Entries from './pages/Entries'
import Abstract from './pages/Abstract'
import Budgets from './pages/Budgets'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Login from './pages/Login'
import NoElectronError from './components/NoElectronError'
import ChangePasswordModal from './components/ChangePasswordModal'
import useAppStore from './store/appStore'

function AppShell() {
  const { currentUser, setCurrentUser } = useAppStore()
  const [bootstrapping, setBootstrapping] = useState(true)
  const [backendError, setBackendError] = useState(null)
  const [showForceChangePw, setShowForceChangePw] = useState(false)

  // Check that the backend is reachable, then restore session if any
  useEffect(() => {
    let mounted = true
    window.electronAPI.getCurrentUser()
      .then(user => {
        if (!mounted) return
        if (user) {
          setCurrentUser(user)
          if (user.must_change_password) setShowForceChangePw(true)
        }
        setBootstrapping(false)
      })
      .catch(err => {
        console.error('Backend not reachable:', err)
        if (mounted) {
          setBackendError(err.message || 'Could not reach backend')
          setBootstrapping(false)
        }
      })
    return () => { mounted = false }
  }, [])

  function handleLoggedIn(user) {
    setCurrentUser(user)
    if (user.must_change_password) setShowForceChangePw(true)
  }

  function handlePasswordChanged() {
    setShowForceChangePw(false)
    setCurrentUser({ ...currentUser, must_change_password: 0 })
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-ink-secondary text-sm">Loading...</div>
      </div>
    )
  }

  if (backendError) {
    return <NoElectronError errorMessage={backendError} />
  }

  if (!currentUser) {
    return <Login onLoggedIn={handleLoggedIn} />
  }

  return (
    <>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="terms" element={<Terms />} />
            <Route path="entries" element={<Entries />} />
            <Route path="abstract" element={<Abstract />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>

      <ChangePasswordModal
        open={showForceChangePw}
        forced={true}
        onClose={() => setShowForceChangePw(false)}
        onChanged={handlePasswordChanged}
      />
    </>
  )
}

export default function App() {
  return <AppShell />
}
