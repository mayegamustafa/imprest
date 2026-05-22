import { useState, useEffect, useRef } from 'react'
import { LogIn, User, Lock, AlertCircle } from 'lucide-react'

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('Please enter both username and password.')
      return
    }
    setLoading(true)
    try {
      const result = await window.electronAPI.login(username.trim(), password)
      if (result?.success) {
        onLoggedIn(result.user)
      }
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Brand block */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 bg-sidebar rounded-md flex items-center justify-center mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
              <path d="M7 9h10M7 13h5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ink">Imprest FMS</h1>
          <p className="text-xs text-ink-secondary mt-0.5">Financial Management System</p>
        </div>

        {/* Login form card */}
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-md shadow-card p-6">
          <h2 className="text-md font-semibold text-ink mb-1">Sign in to your account</h2>
          <p className="text-xs text-ink-secondary mb-5">Enter your credentials to continue</p>

          {error && (
            <div className="bg-danger-light border border-danger/20 rounded px-3 py-2 mb-4 flex items-start gap-2">
              <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" strokeWidth={2} />
              <span className="text-xs text-danger">{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="field-label">Username</label>
              <div className="relative">
                <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  ref={inputRef}
                  type="text"
                  className="field-input pl-8"
                  placeholder="admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="field-label">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type="password"
                  className="field-input pl-8"
                  placeholder="••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-5 flex items-center justify-center gap-2 bg-accent text-white text-sm font-medium px-4 py-2 rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <LogIn size={14} />
            )}
            Sign In
          </button>

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-2xs text-ink-muted text-center leading-relaxed">
              <strong className="text-ink-secondary">First time?</strong> Default credentials are
              <br />
              <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-1">admin / admin</code>
              <br />
              You will be prompted to change the password on first sign-in.
            </p>
          </div>
        </form>

        <p className="text-2xs text-ink-muted text-center mt-4">
          Imprest FMS v1.0 · Offline · Secure
        </p>
      </div>
    </div>
  )
}
