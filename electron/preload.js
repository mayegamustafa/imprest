const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Auth ────────────────────────────────────────────────────────────────────
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:currentUser'),
  changePassword: (oldPw, newPw) => ipcRenderer.invoke('auth:changePassword', oldPw, newPw),

  listUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (data) => ipcRenderer.invoke('users:create', data),
  updateUser: (id, data) => ipcRenderer.invoke('users:update', id, data),
  resetUserPassword: (id, newPassword) => ipcRenderer.invoke('users:resetPassword', id, newPassword),
  deleteUser: (id) => ipcRenderer.invoke('users:delete', id),

  // ── Settings ────────────────────────────────────────────────────────────────
  getSchoolConfig: () => ipcRenderer.invoke('settings:getSchool'),
  saveSchoolConfig: (data) => ipcRenderer.invoke('settings:saveSchool', data),

  getCategories: () => ipcRenderer.invoke('settings:getCategories'),
  saveCategory: (data) => ipcRenderer.invoke('settings:saveCategory', data),
  deleteCategory: (id) => ipcRenderer.invoke('settings:deleteCategory', id),
  reorderCategories: (ids) => ipcRenderer.invoke('settings:reorderCategories', ids),

  getSignatories: () => ipcRenderer.invoke('settings:getSignatories'),
  saveSignatory: (data) => ipcRenderer.invoke('settings:saveSignatory', data),
  deleteSignatory: (id) => ipcRenderer.invoke('settings:deleteSignatory', id),
  reorderSignatories: (ids) => ipcRenderer.invoke('settings:reorderSignatories', ids),

  getAuditLog: (opts) => ipcRenderer.invoke('settings:getAuditLog', opts),

  // ── Terms & Cycles ───────────────────────────────────────────────────────────
  getTerms: () => ipcRenderer.invoke('terms:getAll'),
  createTerm: (data) => ipcRenderer.invoke('terms:create', data),
  deleteTerm: (id) => ipcRenderer.invoke('terms:delete', id),

  getCycles: (termId) => ipcRenderer.invoke('cycles:getByTerm', termId),
  createCycle: (data) => ipcRenderer.invoke('cycles:create', data),
  updateCycle: (id, data) => ipcRenderer.invoke('cycles:update', id, data),
  closeCycle: (id) => ipcRenderer.invoke('cycles:close', id),
  reopenCycle: (id) => ipcRenderer.invoke('cycles:reopen', id),
  deleteCycle: (id) => ipcRenderer.invoke('cycles:delete', id),

  // ── Entries ──────────────────────────────────────────────────────────────────
  getEntries: (cycleId) => ipcRenderer.invoke('entries:getByCycle', cycleId),
  createEntry: (data) => ipcRenderer.invoke('entries:create', data),
  updateEntry: (id, data) => ipcRenderer.invoke('entries:update', id, data),
  deleteEntry: (id) => ipcRenderer.invoke('entries:delete', id),

  // ── Reports ──────────────────────────────────────────────────────────────────
  getLedgerData: (cycleId) => ipcRenderer.invoke('reports:getLedger', cycleId),
  getAbstractData: (cycleId) => ipcRenderer.invoke('reports:getAbstract', cycleId),
  exportPDF: (type, cycleId, options) => ipcRenderer.invoke('reports:exportPDF', type, cycleId, options),
  exportExcel: (type, cycleId, options) => ipcRenderer.invoke('reports:exportExcel', type, cycleId, options),

  // ── Budgets ──────────────────────────────────────────────────────────────────
  listBudgetsByTerm: (termId) => ipcRenderer.invoke('budgets:listByTerm', termId),
  saveBudget: (data) => ipcRenderer.invoke('budgets:saveTerm', data),
  bulkSaveBudgets: (termId, rows) => ipcRenderer.invoke('budgets:bulkSaveTerm', termId, rows),
  deleteBudget: (id) => ipcRenderer.invoke('budgets:deleteTerm', id),
  copyBudgetsFromTerm: (srcTermId, destTermId) => ipcRenderer.invoke('budgets:copyFromTerm', srcTermId, destTermId),
  listBudgetOverrides: (cycleId) => ipcRenderer.invoke('budgets:listOverrides', cycleId),
  saveBudgetOverride: (data) => ipcRenderer.invoke('budgets:saveOverride', data),
  deleteBudgetOverride: (id) => ipcRenderer.invoke('budgets:deleteOverride', id),
  effectiveBudgetsForCycle: (cycleId) => ipcRenderer.invoke('budgets:effectiveForCycle', cycleId),

  // ── Analytics ────────────────────────────────────────────────────────────────
  getDashboardMetrics: (filters) => ipcRenderer.invoke('analytics:dashboardMetrics', filters),
  getConsolidatedAbstract: (filters) => ipcRenderer.invoke('analytics:consolidatedAbstract', filters),
  getBudgetSummary: (termId) => ipcRenderer.invoke('analytics:budgetSummary', termId),
  getCategoryTrends: (filters) => ipcRenderer.invoke('analytics:categoryTrends', filters),
  getTopCategories: (filters, limit) => ipcRenderer.invoke('analytics:topCategories', filters, limit),
  getVoucherTimeline: (filters) => ipcRenderer.invoke('analytics:voucherTimeline', filters),

  // ── Dialogs ──────────────────────────────────────────────────────────────────
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),

  // ── Database ─────────────────────────────────────────────────────────────────
  backupDatabase: (destPath) => ipcRenderer.invoke('db:backup', destPath),
  restoreDatabase: (srcPath) => ipcRenderer.invoke('db:restore', srcPath),
})
