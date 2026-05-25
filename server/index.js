/**
 * Imprest FMS — HTTP backend (web mode)
 *
 * Exposes the same operations as Electron IPC, but over HTTP.
 * Each request runs inside its own AsyncLocalStorage session, so multiple
 * users can connect concurrently without sharing auth state.
 *
 * Endpoints:
 *   POST /api/rpc                 — Generic JSON-RPC dispatch
 *   POST /api/export/pdf          — Stream PDF as download
 *   POST /api/export/excel        — Stream Excel as download
 *   GET  /api/backup              — Stream SQLite backup as download
 *   POST /api/restore             — Replace DB from uploaded SQLite file
 *   GET  /api/health              — Liveness probe
 *
 * Static UI is served from /dist (production build).
 *
 * Environment:
 *   PORT                — defaults to 3001
 *   IMPREST_DATA_DIR    — where to put imprest.db (defaults to ~/.imprest-fms)
 *   SESSION_SECRET      — cookie-signing secret
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const session = require('express-session')
const multer = require('multer')
const { createProxyMiddleware } = require('http-proxy-middleware')
const Database = require('better-sqlite3')

// ─── SQLite-backed session store (uses better-sqlite3, already a dependency) ──
function makeSQLiteSessionStore(Store) {
  return class SQLiteStore extends Store {
    constructor(options = {}) {
      super(options)
      const dataDir = process.env.IMPREST_DATA_DIR || path.join(os.homedir(), '.imprest-fms')
      const dbPath = path.join(dataDir, 'sessions.db')
      fs.mkdirSync(dataDir, { recursive: true })
      this._db = new Database(dbPath)
      this._db.pragma('journal_mode = WAL')
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid     TEXT PRIMARY KEY,
          data    TEXT    NOT NULL,
          expires INTEGER NOT NULL
        )
      `)
      // Prune expired rows every 15 minutes — .unref() so it won't block shutdown
      setInterval(() => {
        try { this._db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now()) } catch {}
      }, 15 * 60 * 1000).unref()
    }
    get(sid, cb) {
      try {
        const row = this._db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid)
        if (!row) return cb(null, null)
        if (row.expires <= Date.now()) {
          this._db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid)
          return cb(null, null)
        }
        cb(null, JSON.parse(row.data))
      } catch (err) { cb(err) }
    }
    set(sid, sessionData, cb) {
      try {
        const ttl = sessionData.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000
        const expires = Date.now() + ttl
        this._db.prepare(
          'INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)'
        ).run(sid, JSON.stringify(sessionData), expires)
        cb(null)
      } catch (err) { cb(err) }
    }
    destroy(sid, cb) {
      try { this._db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); cb(null) }
      catch (err) { cb(err) }
    }
    touch(sid, sessionData, cb) { this.set(sid, sessionData, cb) }
  }
}

// ─── Fail loud, not silent ───────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('\n[FATAL] Uncaught exception — server will exit:')
  console.error(err.stack || err)
  process.exit(1)
})
process.on('unhandledRejection', (err) => {
  console.error('\n[FATAL] Unhandled promise rejection — server will exit:')
  console.error(err?.stack || err)
  process.exit(1)
})

const ExcelJS = require('exceljs')
const { initDatabase, closeDatabase, getDbPath } = require('../electron/db/connection')
const { runWithSession } = require('../electron/lib/session-context')
const { bearerAuthMiddleware, signToken } = require('../electron/lib/jwt')
const { generatePDF, generateExcel } = require('../electron/ipc/reports')
const { requireRole } = require('../electron/ipc/auth')
const { parseExcelRows, buildTemplateWorkbook } = require('../electron/ipc/entries')

// ─── Initialise DB before doing anything else ────────────────────────────────
try {
  initDatabase()
} catch (err) {
  console.error('\n[FATAL] Could not open database:')
  console.error(err.message)
  console.error('\nIf this is an ABI/native-binding error, run:')
  console.error('  npm run rebuild:node')
  process.exit(1)
}

// ─── Capture all IPC handler functions via a fake ipcMain ────────────────────
const handlerRegistry = {}
const fakeIpcMain = {
  handle(method, fn) {
    handlerRegistry[method] = fn
  },
}

require('../electron/ipc/auth').registerAuthHandlers(fakeIpcMain)
require('../electron/ipc/settings').registerSettingsHandlers(fakeIpcMain)
require('../electron/ipc/terms').registerTermsHandlers(fakeIpcMain)
require('../electron/ipc/entries').registerEntriesHandlers(fakeIpcMain)
require('../electron/ipc/budgets').registerBudgetsHandlers(fakeIpcMain)
require('../electron/ipc/analytics').registerAnalyticsHandlers(fakeIpcMain)
// Also register reports' data-only handlers (the file-export endpoints handle
// PDF/Excel directly, but getLedgerData / getAbstractData go through RPC).
{
  const reports = require('../electron/ipc/reports')
  fakeIpcMain.handle('reports:getLedger', (e, cycleId) => reports.getLedgerData(cycleId))
  fakeIpcMain.handle('reports:getAbstract', (e, cycleId) => reports.getAbstractData(cycleId))
}

// ─── Method-name → handler-key mapping ───────────────────────────────────────
// Maps the camelCase names the renderer uses (matching window.electronAPI)
// to the colon-separated IPC channel names registered above.
const METHOD_MAP = {
  // Auth
  login: 'auth:login',
  logout: 'auth:logout',
  getCurrentUser: 'auth:currentUser',
  changePassword: 'auth:changePassword',
  listUsers: 'users:list',
  createUser: 'users:create',
  updateUser: 'users:update',
  resetUserPassword: 'users:resetPassword',
  deleteUser: 'users:delete',

  // Settings
  getSchoolConfig: 'settings:getSchool',
  saveSchoolConfig: 'settings:saveSchool',
  getCategories: 'settings:getCategories',
  saveCategory: 'settings:saveCategory',
  deleteCategory: 'settings:deleteCategory',
  reorderCategories: 'settings:reorderCategories',
  getSignatories: 'settings:getSignatories',
  saveSignatory: 'settings:saveSignatory',
  deleteSignatory: 'settings:deleteSignatory',
  reorderSignatories: 'settings:reorderSignatories',
  getAuditLog: 'settings:getAuditLog',

  // Terms & cycles
  getTerms: 'terms:getAll',
  createTerm: 'terms:create',
  deleteTerm: 'terms:delete',
  getCycles: 'cycles:getByTerm',
  createCycle: 'cycles:create',
  updateCycle: 'cycles:update',
  closeCycle: 'cycles:close',
  reopenCycle: 'cycles:reopen',
  deleteCycle: 'cycles:delete',

  // Entries
  getEntries: 'entries:getByCycle',
  createEntry: 'entries:create',
  updateEntry: 'entries:update',
  deleteEntry: 'entries:delete',
  bulkDeleteEntries: 'entries:bulkDelete',
  setEntryReconciled: 'entries:setReconciled',
  bulkCreateEntries: 'entries:bulkCreate',

  // Reports (data only — file exports use dedicated endpoints)
  getLedgerData: 'reports:getLedger',
  getAbstractData: 'reports:getAbstract',

  // Budgets
  listBudgetsByTerm: 'budgets:listByTerm',
  saveBudget: 'budgets:saveTerm',
  bulkSaveBudgets: 'budgets:bulkSaveTerm',
  deleteBudget: 'budgets:deleteTerm',
  copyBudgetsFromTerm: 'budgets:copyFromTerm',
  listBudgetOverrides: 'budgets:listOverrides',
  saveBudgetOverride: 'budgets:saveOverride',
  deleteBudgetOverride: 'budgets:deleteOverride',
  effectiveBudgetsForCycle: 'budgets:effectiveForCycle',

  // Analytics
  getDashboardMetrics: 'analytics:dashboardMetrics',
  getConsolidatedAbstract: 'analytics:consolidatedAbstract',
  getBudgetSummary: 'analytics:budgetSummary',
  getCategoryTrends: 'analytics:categoryTrends',
  getTopCategories: 'analytics:topCategories',
  getVoucherTimeline: 'analytics:voucherTimeline',
}

// ─── Express setup ───────────────────────────────────────────────────────────
const app = express()
const PORT = Number(process.env.PORT) || 3001

// Trust one hop of reverse proxy (Railway, nginx, etc.) so that:
//   • req.secure reflects the *original* HTTPS connection via X-Forwarded-Proto
//   • express-session can then set the Secure cookie attribute correctly
// Without this, Node sees the Railway→Node leg as plain HTTP, req.secure is
// false, and express-session silently drops the Set-Cookie header — meaning
// no cookie ever reaches the browser and every request after login is unauthed.
app.set('trust proxy', 1)

app.use(express.json({ limit: '50mb' }))

app.use(session({
  store: new (makeSQLiteSessionStore(session.Store))(),
  secret: process.env.SESSION_SECRET || 'imprest-fms-dev-secret-change-in-production',
  name: 'imprest.sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    // 'auto' delegates to req.secure: true on Railway (HTTPS), false in local dev (HTTP)
    // Requires trust proxy above to work correctly behind a reverse proxy
    secure: 'auto',
  },
}))

// Accept bearer JWTs as an alternative to cookie sessions. Runs AFTER
// express-session so cookie auth still works; bearer only fills in when
// there's no cookie session.
app.use(bearerAuthMiddleware())

// Bridge each request's session into the AsyncLocalStorage context
app.use((req, res, next) => {
  // express-session populates req.session — we use it directly as our store
  runWithSession(req.session, () => next())
})

// ─── /api/auth/token — mint a JWT for the current cookie session ────────────
// Useful when a long-lived bearer token is needed (sync engine, automation).
app.post('/api/auth/token', (req, res) => {
  const user = req.session?.user
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const token = signToken(user, { expiresIn: req.body?.expiresIn || '30d' })
    res.json({ token, expiresIn: req.body?.expiresIn || '30d' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── /api/health ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mode: 'web',
    version: '1.0.0',
    db: getDbPath(),
  })
})

// ─── /api/rpc — generic dispatch ─────────────────────────────────────────────
app.post('/api/rpc', async (req, res) => {
  const { method, args = [] } = req.body || {}
  if (!method) return res.status(400).json({ error: 'method is required' })
  const channel = METHOD_MAP[method]
  if (!channel) return res.status(404).json({ error: `Unknown method: ${method}` })
  const handler = handlerRegistry[channel]
  if (!handler) return res.status(500).json({ error: `Handler not registered: ${channel}` })
  try {
    // Call the handler with a fake "event" object as the first arg
    const result = await handler({}, ...args)
    res.json({ result })
  } catch (err) {
    console.error(`[RPC] ${method} failed:`, err.message)
    res.status(400).json({ error: err.message || 'Operation failed' })
  }
})

// ─── /api/export/pdf — returns PDF as download ──────────────────────────────
// `subject` (or legacy `cycleId`) is either a cycle ID (number) for per-cycle
// reports, a term ID for budget, or a filters object for analytics reports.
function resolveSubject(body) {
  const raw = body.subject !== undefined ? body.subject : body.cycleId
  if (raw == null) return null
  if (typeof raw === 'object') return raw  // filters object — pass through
  const n = Number(raw)
  return Number.isFinite(n) ? n : raw
}

app.post('/api/export/pdf', async (req, res) => {
  try {
    requireRole('admin', 'accountant', 'viewer')
    const { type, options = {} } = req.body
    if (!type) return res.status(400).json({ error: 'type required' })
    const subject = resolveSubject(req.body)
    const { buffer, fileName } = await generatePDF(type, subject, options)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(buffer)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── /api/export/excel — returns Excel as download ──────────────────────────
app.post('/api/export/excel', async (req, res) => {
  try {
    requireRole('admin', 'accountant', 'viewer')
    const { type, options = {} } = req.body
    if (!type) return res.status(400).json({ error: 'type required' })
    const subject = resolveSubject(req.body)
    const { buffer, fileName } = await generateExcel(type, subject, options)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(buffer)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── /api/backup — stream SQLite file ───────────────────────────────────────
app.get('/api/backup', (req, res) => {
  try {
    requireRole('admin')
    const dbPath = getDbPath()
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    res.setHeader('Content-Type', 'application/x-sqlite3')
    res.setHeader('Content-Disposition', `attachment; filename="imprest-backup-${stamp}.sqlite3"`)
    fs.createReadStream(dbPath).pipe(res)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── /api/restore — accept uploaded SQLite, replace DB ──────────────────────
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } })
app.post('/api/restore', upload.single('database'), (req, res) => {
  try {
    requireRole('admin')
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    closeDatabase()
    fs.copyFileSync(req.file.path, getDbPath())
    fs.unlinkSync(req.file.path)
    initDatabase()
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── /api/import/template — download blank import template ────────────────
app.get('/api/import/template', async (req, res) => {
  try {
    const wb = await buildTemplateWorkbook()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="imprest-import-template.xlsx"')
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── /api/import/excel — parse uploaded Excel, return rows ──────────────────
app.post('/api/import/excel', upload.single('file'), async (req, res) => {
  try {
    requireRole('admin', 'accountant')
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(req.file.path)
    const rows = parseExcelRows(workbook)
    fs.unlinkSync(req.file.path)
    res.json({ rows })
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {})
    res.status(400).json({ error: err.message })
  }
})

// ─── UI hosting ──────────────────────────────────────────────────────────────
// Dev mode: proxy non-API requests to the Vite dev server (port 5173), so
// opening http://localhost:3001 gives you the live-reloading UI from a single
// URL.
// Prod mode: serve the built UI from dist/.
//
// Mode detection (in priority order):
//   1. CLI arg "dev"          → dev mode  (used by `npm run dev:server`)
//   2. NODE_ENV=development   → dev mode
//   3. dist/ exists           → prod mode
//   4. dist/ missing          → dev mode  (proxy as best effort)
const distDir = path.join(__dirname, '..', 'dist')
const cliWantsDev = process.argv.slice(2).includes('dev')
const envWantsDev = process.env.NODE_ENV === 'development' || process.env.IMPREST_DEV === '1'
const isDev = cliWantsDev || envWantsDev || !fs.existsSync(distDir)
const VITE_URL = process.env.VITE_URL || 'http://localhost:5173'

if (isDev) {
  console.log(`  [dev] proxying UI requests to Vite at ${VITE_URL}`)
  const uiProxy = createProxyMiddleware({
    target: VITE_URL,
    changeOrigin: true,
    ws: true,                    // forward HMR WebSocket connections
    logger: { info: () => {}, warn: console.warn, error: console.error },
  })
  // Anything that's NOT /api/* goes to Vite
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    return uiProxy(req, res, next)
  })
} else if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  // Production but no build present — show a helpful page
  app.get(/^(?!\/api).*/, (req, res) => {
    res.status(503).send(`
      <!DOCTYPE html><html><head><title>Imprest FMS — UI not built</title>
      <style>body{font-family:system-ui;max-width:560px;margin:60px auto;padding:0 20px;color:#1F2937}
      code{background:#F5F6FA;padding:2px 6px;border-radius:3px;font-size:13px}
      h1{font-size:18px}p{font-size:14px;line-height:1.6}</style></head>
      <body><h1>UI build not found</h1>
      <p>The Express API is running, but the React UI hasn't been built. Either:</p>
      <p>1. <strong>For development</strong>, run <code>npm run dev:web</code> instead of <code>npm run start:web</code> &mdash; the UI will be served live with hot-reload.</p>
      <p>2. <strong>For production</strong>, build the UI first: <code>npm run build:web</code>, then <code>npm run start:web</code>.</p>
      <p>API endpoints (such as <code>/api/health</code>) work either way.</p>
      </body></html>
    `)
  })
}

// ─── Boot ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  const dataDir = process.env.IMPREST_DATA_DIR
  const isPersisted = !!dataDir

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Imprest FMS — Web Mode')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  ▶ Open in browser:  \x1b[36mhttp://localhost:${PORT}\x1b[0m`)
  console.log(`  Mode:               ${isDev ? 'development (proxying UI to Vite)' : (fs.existsSync(distDir) ? 'production (serving built UI)' : 'production (no UI build)')}`)
  console.log(`  Database:           ${getDbPath()}`)
  if (isPersisted) {
    console.log(`  Storage:            \x1b[32mPERSISTENT (IMPREST_DATA_DIR=${dataDir})\x1b[0m`)
  } else {
    console.log(`  Storage:            \x1b[33mWARNING: IMPREST_DATA_DIR not set — database is stored in the`)
    console.log(`                      home directory and will be LOST on container restart.`)
    console.log(`                      Set IMPREST_DATA_DIR to a mounted volume path to persist data.\x1b[0m`)
  }
  const adminUser = process.env.INITIAL_ADMIN_USERNAME || 'admin'
  const adminPass = process.env.INITIAL_ADMIN_PASSWORD ? '(set via env)' : 'admin'
  console.log(`  Default login:      ${adminUser} / ${adminPass}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Server is running. Press Ctrl+C to stop.')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[FATAL] Port ${PORT} is already in use.`)
    console.error(`Another server is already running. Run \`pkill -f "node server"\` and try again,`)
    console.error(`or set a different PORT: \`PORT=3002 npm run dev:server\``)
    process.exit(1)
  }
  console.error('[FATAL] Server error:', err)
  process.exit(1)
})

// Belt-and-braces: keep the event loop alive even if some lib detaches.
// app.listen() should already do this, but in some shells/wrappers (cross-env
// v10, certain process supervisors) the parent can lose track of the child
// and exit. This setInterval ensures the process stays alive until killed.
const keepAlive = setInterval(() => {}, 1 << 30)

function shutdown(signal) {
  console.log(`\nReceived ${signal} — shutting down...`)
  clearInterval(keepAlive)
  server.close(() => {
    closeDatabase()
    process.exit(0)
  })
  // Force-exit after 5s if graceful shutdown stalls
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
