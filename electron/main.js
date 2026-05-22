const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Database
const { initDatabase, getDatabase, closeDatabase, getDbPath } = require('./db/connection')

// IPC Handlers
const { registerAuthHandlers } = require('./ipc/auth')
const { registerSettingsHandlers } = require('./ipc/settings')
const { registerTermsHandlers } = require('./ipc/terms')
const { registerEntriesHandlers } = require('./ipc/entries')
const { registerReportsHandlers } = require('./ipc/reports')
const { registerBudgetsHandlers } = require('./ipc/budgets')
const { registerAnalyticsHandlers } = require('./ipc/analytics')

// Auto-updates (GitHub Releases via electron-updater) — active only in packaged builds.
const { setupAutoUpdater, shutdownAutoUpdater } = require('./updater')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#F5F6FA',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Kick off auto-update check in the background (no-op in dev)
    setupAutoUpdater(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Init DB before window
  initDatabase()

  // Register all IPC handlers
  registerAuthHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)
  registerTermsHandlers(ipcMain)
  registerEntriesHandlers(ipcMain)
  registerReportsHandlers(ipcMain, mainWindow, dialog, shell)
  registerBudgetsHandlers(ipcMain)
  registerAnalyticsHandlers(ipcMain)

  // File dialog handler
  ipcMain.handle('dialog:saveFile', async (event, { title, defaultPath, filters }) => {
    const result = await dialog.showSaveDialog(mainWindow, { title, defaultPath, filters })
    return result
  })

  ipcMain.handle('dialog:openFile', async (event, { title, filters }) => {
    const result = await dialog.showOpenDialog(mainWindow, { title, filters, properties: ['openFile'] })
    return result
  })

  ipcMain.handle('shell:openPath', async (event, filePath) => {
    await shell.openPath(filePath)
  })

  // Backup / Restore (admin only)
  const { requireRole } = require('./ipc/auth')
  ipcMain.handle('db:backup', async (event, destPath) => {
    requireRole('admin')
    const db = getDatabase()
    db.backup(destPath)
    return { success: true }
  })

  ipcMain.handle('db:restore', async (event, srcPath) => {
    requireRole('admin')
    closeDatabase()
    const dbPath = getDbPath()
    fs.copyFileSync(srcPath, dbPath)
    initDatabase()
    return { success: true }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shutdownAutoUpdater()
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

