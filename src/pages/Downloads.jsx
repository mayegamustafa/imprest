import { useState, useEffect } from 'react'
import { Download, Monitor, Package, ExternalLink, RefreshCw, Loader } from 'lucide-react'

const REPO = 'mayegamustafa/imprest'

function detectOS() {
  const ua = navigator.userAgent
  if (/Win/i.test(ua)) return 'windows'
  if (/Mac/i.test(ua)) return 'mac'
  return 'linux'
}

function parseAssets(release) {
  const assets = release?.assets || []
  return {
    windows: assets.find(a => a.name.endsWith('.exe')),
    appimage: assets.find(a => a.name.endsWith('.AppImage')),
    deb: assets.find(a => a.name.endsWith('.deb')),
  }
}

export default function Downloads() {
  const [release, setRelease] = useState(null)
  const [loading, setLoading] = useState(true)
  const [noRelease, setNoRelease] = useState(false)
  const [error, setError] = useState(null)
  const os = detectOS()

  function fetchRelease() {
    setLoading(true); setError(null); setNoRelease(false)
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(r => {
        if (r.status === 404) { setNoRelease(true); setLoading(false); return null }
        if (!r.ok) throw new Error(`Could not reach download server (${r.status})`)
        return r.json()
      })
      .then(data => { if (data) { setRelease(data); setLoading(false) } })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  useEffect(() => { fetchRelease() }, [])

  const assets = release ? parseAssets(release) : {}

  const platforms = [
    { key: 'windows', label: 'Windows',      sub: 'Windows 10 / 11',    icon: <Monitor size={20} />, asset: assets.windows  },
    { key: 'appimage', label: 'Linux',        sub: 'Universal AppImage', icon: <Package size={20} />, asset: assets.appimage },
    { key: 'deb',      label: 'Linux (.deb)', sub: 'Ubuntu / Debian',    icon: <Package size={20} />, asset: assets.deb      },
  ]

  const primary = platforms.find(p => os === 'windows' ? p.key === 'windows' : p.key === 'appimage') || platforms[0]
  const others  = platforms.filter(p => p.key !== primary.key)

  return (
    <div className="max-w-lg">
      <div className="mb-7">
        <h1 className="text-xl font-bold text-ink">Download Desktop App</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Works fully offline. Your data stays on your device.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader size={24} className="animate-spin text-accent" />
          <p className="text-sm text-ink-secondary">Checking for latest version…</p>
        </div>
      )}

      {!loading && noRelease && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="w-14 h-14 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Download size={24} className="text-accent" />
          </div>
          <h2 className="text-base font-semibold text-ink mb-2">Installer coming soon</h2>
          <p className="text-sm text-ink-secondary mb-5">
            The desktop installer is being prepared and will appear here automatically once ready.
          </p>
          <button
            onClick={fetchRelease}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors"
          >
            <RefreshCw size={14} /> Check again
          </button>
        </div>
      )}

      {!loading && error && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <button onClick={fetchRelease} className="text-sm text-accent hover:underline inline-flex items-center gap-1.5">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      )}

      {!loading && release && (
        <>
          {/* Primary platform — big button */}
          <a
            href={primary.asset?.browser_download_url || `https://github.com/${REPO}/releases/latest`}
            target={primary.asset ? '_self' : '_blank'}
            rel="noreferrer"
            className="flex items-center gap-4 w-full bg-accent hover:bg-accent-hover text-white rounded-xl px-5 py-4 transition-colors mb-4"
          >
            <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center shrink-0">
              {primary.icon}
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-sm">Download for {primary.label}</p>
              <p className="text-xs text-white/70">
                {primary.sub} · {release.tag_name}
                {primary.asset ? ` · ${(primary.asset.size / 1024 / 1024).toFixed(0)} MB` : ''}
              </p>
            </div>
            <Download size={20} className="shrink-0 opacity-80" />
          </a>

          {/* Other platforms — smaller cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {others.map(p => (
              <a
                key={p.key}
                href={p.asset?.browser_download_url || `https://github.com/${REPO}/releases/latest`}
                target={p.asset ? '_self' : '_blank'}
                rel="noreferrer"
                className="flex items-center gap-3 border border-border rounded-lg px-4 py-3 hover:border-accent transition-colors"
              >
                <span className="text-ink-muted shrink-0">{p.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{p.label}</p>
                  <p className="text-xs text-ink-muted truncate">{p.sub}</p>
                </div>
              </a>
            ))}
          </div>

          <div className="border-t border-border pt-4 mb-6">
            <a href={`https://github.com/${REPO}/releases`} target="_blank" rel="noreferrer"
              className="text-xs text-accent inline-flex items-center gap-1 hover:underline">
              <ExternalLink size={12} /> View all releases
            </a>
          </div>
        </>
      )}

      {!loading && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-xs font-semibold text-ink mb-1">Why use the desktop app?</p>
          <ul className="text-xs text-ink-secondary space-y-1 list-disc list-inside">
            <li>Works without internet</li>
            <li>Data stored securely on your device</li>
            <li>Updates automatically in the background</li>
          </ul>
        </div>
      )}
    </div>
  )
}
