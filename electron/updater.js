/**
 * Auto-updater integration with GitHub Releases via electron-updater.
 *
 * Behavior:
 *   - Silently checks for updates 30 seconds after window load (avoids
 *     interrupting startup) and then once per hour while running.
 *   - Downloads the update in the background.
 *   - When the update is ready, prompts the user once with "Install now"
 *     or "Install on next launch".
 *
 * Configuration is read entirely from electron-builder.yml `publish` block,
 * so this code is environment-agnostic.
 */
const { dialog, app } = require('electron')

let _initialized = false
let _intervalHandle = null

function setupAutoUpdater(mainWindow) {
  if (_initialized) return
  _initialized = true

  // Skip in dev mode (no signed binary, no GitHub release for `main`)
  if (!app.isPackaged) {
    console.log('[updater] dev mode — auto-updates disabled')
    return
  }

  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch (err) {
    console.warn('[updater] electron-updater not available:', err.message)
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  // Pretty-print events to the console for diagnosis
  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for update…')
  })
  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version)
  })
  autoUpdater.on('update-not-available', () => {
    console.log('[updater] already up to date')
  })
  autoUpdater.on('download-progress', (p) => {
    console.log(`[updater] downloading ${p.percent.toFixed(1)}% (${p.transferred}/${p.total})`)
  })
  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err?.message || err)
  })
  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[updater] update downloaded:', info.version)
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart and install', 'Install on next launch'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Imprest FMS ${info.version} is ready to install.`,
      detail: 'The new version will be installed automatically when you choose to restart, or on the next time you launch the app.',
    })
    if (result.response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  // First check 30s after startup; then hourly
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => console.warn('[updater]', err.message))
  }, 30_000)

  _intervalHandle = setInterval(() => {
    autoUpdater.checkForUpdates().catch(err => console.warn('[updater]', err.message))
  }, 60 * 60 * 1000)
}

function shutdownAutoUpdater() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle)
    _intervalHandle = null
  }
}

module.exports = { setupAutoUpdater, shutdownAutoUpdater }
