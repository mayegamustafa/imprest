/**
 * Web shim — exposes a `window.electronAPI`-compatible object that talks to
 * the Express server via HTTP. Installed automatically when not running in
 * Electron, so the rest of the React app needs no changes.
 *
 * Special methods that involve files (export, backup, restore) hit dedicated
 * REST endpoints; everything else goes through /api/rpc.
 */

const RPC_URL = '/api/rpc'

async function rpc(method, args) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ method, args }),
  })
  const text = await res.text()
  let payload
  try { payload = text ? JSON.parse(text) : {} } catch { payload = { error: text } }
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`)
  return payload.result
}

async function downloadFile(url, body, fallbackName) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Export failed (HTTP ${res.status})`)
  }

  // Try to extract filename from Content-Disposition
  const cd = res.headers.get('Content-Disposition') || ''
  const match = cd.match(/filename="?([^"]+)"?/)
  const fileName = match ? match[1] : fallbackName

  const blob = await res.blob()
  triggerBrowserDownload(blob, fileName)
  return { success: true, fileName }
}

function triggerBrowserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

const webApi = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  login: (u, p) => rpc('login', [u, p]),
  logout: () => rpc('logout', []),
  getCurrentUser: () => rpc('getCurrentUser', []),
  changePassword: (o, n) => rpc('changePassword', [o, n]),

  listUsers: () => rpc('listUsers', []),
  createUser: (data) => rpc('createUser', [data]),
  updateUser: (id, data) => rpc('updateUser', [id, data]),
  resetUserPassword: (id, pw) => rpc('resetUserPassword', [id, pw]),
  deleteUser: (id) => rpc('deleteUser', [id]),

  // ── Settings ───────────────────────────────────────────────────────────────
  getSchoolConfig: () => rpc('getSchoolConfig', []),
  saveSchoolConfig: (data) => rpc('saveSchoolConfig', [data]),
  getCategories: () => rpc('getCategories', []),
  saveCategory: (data) => rpc('saveCategory', [data]),
  deleteCategory: (id) => rpc('deleteCategory', [id]),
  reorderCategories: (ids) => rpc('reorderCategories', [ids]),
  getSignatories: () => rpc('getSignatories', []),
  saveSignatory: (data) => rpc('saveSignatory', [data]),
  deleteSignatory: (id) => rpc('deleteSignatory', [id]),
  reorderSignatories: (ids) => rpc('reorderSignatories', [ids]),
  getAuditLog: (opts) => rpc('getAuditLog', [opts]),

  // ── Terms & cycles ─────────────────────────────────────────────────────────
  getTerms: () => rpc('getTerms', []),
  createTerm: (data) => rpc('createTerm', [data]),
  deleteTerm: (id) => rpc('deleteTerm', [id]),
  getCycles: (termId) => rpc('getCycles', [termId]),
  createCycle: (data) => rpc('createCycle', [data]),
  updateCycle: (id, data) => rpc('updateCycle', [id, data]),
  closeCycle: (id) => rpc('closeCycle', [id]),
  reopenCycle: (id) => rpc('reopenCycle', [id]),
  deleteCycle: (id) => rpc('deleteCycle', [id]),

  // ── Entries ────────────────────────────────────────────────────────────────
  getEntries: (cycleId) => rpc('getEntries', [cycleId]),
  createEntry: (data) => rpc('createEntry', [data]),
  updateEntry: (id, data) => rpc('updateEntry', [id, data]),
  deleteEntry:         (id)   => rpc('deleteEntry', [id]),
  parseExcelFile: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/import/excel', { method: 'POST', credentials: 'include', body: fd })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e.error || `HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.rows
  },
  bulkCreateEntries:   (data) => rpc('bulkCreateEntries', [data]),

  // ── Reports (data) ─────────────────────────────────────────────────────────
  getLedgerData: (cycleId) => rpc('getLedgerData', [cycleId]),
  getAbstractData: (cycleId) => rpc('getAbstractData', [cycleId]),

  // ── Budgets ────────────────────────────────────────────────────────────────
  listBudgetsByTerm: (termId) => rpc('listBudgetsByTerm', [termId]),
  saveBudget: (data) => rpc('saveBudget', [data]),
  bulkSaveBudgets: (termId, rows) => rpc('bulkSaveBudgets', [termId, rows]),
  deleteBudget: (id) => rpc('deleteBudget', [id]),
  copyBudgetsFromTerm: (src, dest) => rpc('copyBudgetsFromTerm', [src, dest]),
  listBudgetOverrides: (cycleId) => rpc('listBudgetOverrides', [cycleId]),
  saveBudgetOverride: (data) => rpc('saveBudgetOverride', [data]),
  deleteBudgetOverride: (id) => rpc('deleteBudgetOverride', [id]),
  effectiveBudgetsForCycle: (cycleId) => rpc('effectiveBudgetsForCycle', [cycleId]),

  // ── Analytics ──────────────────────────────────────────────────────────────
  getDashboardMetrics: (filters) => rpc('getDashboardMetrics', [filters]),
  getConsolidatedAbstract: (filters) => rpc('getConsolidatedAbstract', [filters]),
  getBudgetSummary: (termId) => rpc('getBudgetSummary', [termId]),
  getCategoryTrends: (filters) => rpc('getCategoryTrends', [filters]),
  getTopCategories: (filters, limit) => rpc('getTopCategories', [filters, limit]),
  getVoucherTimeline: (filters) => rpc('getVoucherTimeline', [filters]),

  // ── File exports (use dedicated endpoints + browser download) ──────────────
  exportPDF: (type, subject, options = {}) =>
    downloadFile('/api/export/pdf', { type, subject, options }, `${type}.pdf`),

  exportExcel: (type, subject, options = {}) =>
    downloadFile('/api/export/excel', { type, subject, options }, `${type}.xlsx`),

  // ── File dialogs (no-op in web — exports auto-download) ────────────────────
  saveFileDialog: async () => ({ canceled: false, filePath: '__web__' }),
  openFileDialog: async ({ filters } = {}) => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      const exts = filters?.[0]?.extensions
      if (exts) input.accept = exts.map(e => '.' + e).join(',')
      input.onchange = () => {
        if (input.files?.[0]) {
          // Smuggle the File object via filePaths so consumer code can detect it
          resolve({ canceled: false, filePaths: [input.files[0]] })
        } else {
          resolve({ canceled: true, filePaths: [] })
        }
      }
      input.click()
    })
  },
  openPath: async () => {},  // no-op in web

  // ── Backup / Restore ───────────────────────────────────────────────────────
  backupDatabase: async () => {
    const a = document.createElement('a')
    a.href = '/api/backup'
    a.download = `imprest-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return { success: true }
  },
  restoreDatabase: async (file) => {
    if (!(file instanceof File)) {
      throw new Error('Web restore requires a File object — pick a .sqlite3 file from the file dialog.')
    }
    const fd = new FormData()
    fd.append('database', file)
    const res = await fetch('/api/restore', { method: 'POST', credentials: 'include', body: fd })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json()
  },
}

export default webApi
