import { AlertTriangle, Terminal, RefreshCw, Globe, Monitor } from 'lucide-react'

export default function NoElectronError({ errorMessage }) {
  const mode = typeof window !== 'undefined' ? window.__IMPREST_MODE__ : 'unknown'
  const isWeb = mode === 'web'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="bg-surface border border-border rounded-lg shadow-card max-w-xl w-full p-7">
        <div className="w-12 h-12 mx-auto mb-4 bg-warning-light rounded-full flex items-center justify-center">
          <AlertTriangle size={22} className="text-warning" strokeWidth={1.75} />
        </div>

        <h1 className="text-lg font-semibold text-ink text-center mb-1">
          {isWeb ? 'Cannot reach the backend server' : 'Backend not connected'}
        </h1>
        <p className="text-sm text-ink-secondary text-center mb-5">
          {isWeb
            ? 'The web UI loaded, but the Imprest FMS server isn\'t responding. Make sure it\'s running.'
            : 'The app cannot access the database. You need to either run it as a desktop app, or start the web backend.'}
        </p>

        {errorMessage && (
          <div className="bg-danger-light border border-danger/20 rounded px-3 py-2 mb-4">
            <p className="text-2xs font-mono text-danger break-all">{errorMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="border border-border rounded p-4">
            <div className="flex items-center gap-2 mb-2">
              <Monitor size={14} className="text-accent" />
              <p className="text-xs font-semibold text-ink uppercase tracking-wide">Desktop mode</p>
            </div>
            <p className="text-2xs text-ink-secondary mb-2">Run as a native Windows / Linux app:</p>
            <code className="block bg-ink text-white text-2xs font-mono px-2 py-1 rounded">npm run dev</code>
          </div>

          <div className="border border-border rounded p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe size={14} className="text-accent" />
              <p className="text-xs font-semibold text-ink uppercase tracking-wide">Web mode</p>
            </div>
            <p className="text-2xs text-ink-secondary mb-2">Run as a local server, access via browser:</p>
            <code className="block bg-ink text-white text-2xs font-mono px-2 py-1 rounded">npm run dev:web</code>
          </div>
        </div>

        <div className="bg-gray-50 border border-border rounded p-3 mb-4">
          <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Terminal size={12} /> Quick checklist
          </p>
          <ul className="text-xs text-ink-secondary space-y-1 list-disc list-inside">
            <li>Open a terminal in the project folder</li>
            <li>Run one of the commands above</li>
            <li>Wait until you see <code className="bg-white px-1 rounded">Server: http://localhost:3001</code> (web) or the Electron window opens (desktop)</li>
            <li>Then refresh this page</li>
          </ul>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent-hover transition-colors"
        >
          <RefreshCw size={14} />
          Try Again
        </button>
      </div>
    </div>
  )
}
