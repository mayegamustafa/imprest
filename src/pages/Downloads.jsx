import { useState, useEffect } from 'react'
import { Download, Monitor, Package, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'

const REPO = 'mayegamustafa/imprest'

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
  const [error, setError] = useState(null)

  function fetchRelease() {
    setLoading(true)
    setError(null)
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(r => {
        if (r.status === 404) throw new Error('No release published yet.')
        if (!r.ok) throw new Error(`GitHub API returned ${r.status}`)
        return r.json()
      })
      .then(data => { setRelease(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  useEffect(() => { fetchRelease() }, [])

  const assets = release ? parseAssets(release) : {}
  const releaseDate = release?.published_at
    ? new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Get the Desktop App</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Download the native desktop app for fully offline use — data stays on your device with no server required.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-ink-secondary py-8">
          <RefreshCw size={14} className="animate-spin" />
          Checking for the latest release…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-danger-light border border-danger/20 rounded-lg px-4 py-3 flex items-start gap-2.5 mb-4">
          <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-danger">Couldn't fetch release info</p>
            <p className="text-xs text-danger/80 mt-0.5">{error}</p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={fetchRelease}
                className="text-xs text-accent hover:underline"
              >
                Try again
              </button>
              <a
                href={`https://github.com/${REPO}/releases/latest`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent inline-flex items-center gap-1 hover:underline"
              >
                View on GitHub <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Release info + download cards */}
      {!loading && release && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center px-2 py-0.5 bg-success-light text-success text-xs font-semibold rounded">
              {release.tag_name}
            </span>
            {releaseDate && (
              <span className="text-xs text-ink-muted">Released {releaseDate}</span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <DownloadCard
              platform="Windows"
              icon={<Monitor size={18} />}
              description="Windows 10 / 11, 64-bit"
              asset={assets.windows}
              fallback={`https://github.com/${REPO}/releases/latest`}
              label=".exe installer"
            />
            <DownloadCard
              platform="Linux"
              icon={<Package size={18} />}
              description="Universal (AppImage)"
              asset={assets.appimage}
              fallback={`https://github.com/${REPO}/releases/latest`}
              label=".AppImage"
            />
            <DownloadCard
              platform="Linux (.deb)"
              icon={<Package size={18} />}
              description="Ubuntu / Debian"
              asset={assets.deb}
              fallback={`https://github.com/${REPO}/releases/latest`}
              label=".deb package"
            />
          </div>
        </>
      )}

      {/* Footer link */}
      {!loading && (
        <div className="border-t border-border pt-4">
          <a
            href={`https://github.com/${REPO}/releases`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent inline-flex items-center gap-1 hover:underline"
          >
            <ExternalLink size={12} />
            All releases on GitHub
          </a>
        </div>
      )}

      {/* Desktop note */}
      <div className="mt-6 bg-surface border border-border rounded-lg p-4">
        <p className="text-xs font-semibold text-ink mb-1">Why use the desktop app?</p>
        <ul className="text-xs text-ink-secondary space-y-1 list-disc list-inside">
          <li>Fully offline — works without internet access</li>
          <li>Data stored locally on your computer</li>
          <li>Automatic updates delivered in the background</li>
          <li>Native PDF and Excel export without a server</li>
        </ul>
      </div>
    </div>
  )
}

function DownloadCard({ platform, icon, description, asset, fallback, label }) {
  const href = asset?.browser_download_url || fallback
  const sizeMB = asset ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : null

  return (
    <a
      href={href}
      target={asset ? '_self' : '_blank'}
      rel="noreferrer"
      className="flex flex-col border border-border rounded-lg p-4 hover:border-accent hover:bg-surface transition-colors"
    >
      <div className="flex items-center gap-2 mb-1.5 text-ink">
        {icon}
        <span className="text-sm font-semibold">{platform}</span>
      </div>
      <p className="text-xs text-ink-secondary mb-3 flex-1">{description}</p>
      <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
        <span>{label}</span>
        {sizeMB && <span>{sizeMB}</span>}
      </div>
      <div className="flex items-center gap-1.5 text-accent text-xs font-medium">
        <Download size={12} />
        {asset ? 'Download' : 'View on GitHub'}
      </div>
    </a>
  )
}
