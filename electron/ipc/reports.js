const path = require('path')
const fs = require('fs')
const os = require('os')
const { getDatabase } = require('../db/connection')
const { buildLedgerHTML } = require('../pdf/ledger-template')
const { buildAbstractHTML } = require('../pdf/abstract-template')
const { buildConsolidatedHTML } = require('../pdf/consolidated-template')
const { buildBudgetHTML } = require('../pdf/budget-template')
const { buildTrendsHTML } = require('../pdf/trends-template')
const { buildFinancialSummaryHTML } = require('../pdf/financial-summary-template')
const { renderPDF } = require('../pdf/renderer')
const {
  buildLedgerWorkbook,
  buildAbstractWorkbook,
  buildCombinedWorkbook,
  buildConsolidatedAbstractWorkbook,
  buildBudgetPerformanceWorkbook,
  buildTrendsWorkbook,
  buildFinancialSummaryWorkbook,
  buildFullWorkbook,
} = require('../excel/excel-export')
const analytics = require('./analytics')

// ─── Pure data + file builders (no Electron deps) ────────────────────────────
function getLedgerData(cycleId) {
  const db = getDatabase()
  const cycle = db.prepare(`
    SELECT ic.*, t.term_number, t.year, t.period_type, t.custom_name,
      (ic.opening_balance + ic.amount_received) AS total_available,
      (SELECT COALESCE(SUM(amount),0) FROM entries WHERE cycle_id = ic.id) AS total_spent,
      (SELECT COALESCE(SUM(balance_back),0) FROM entries WHERE cycle_id = ic.id) AS total_brought_back
    FROM imprest_cycles ic
    JOIN terms t ON t.id = ic.term_id
    WHERE ic.id = ?
  `).get(cycleId)

  if (!cycle) throw new Error('Cycle not found')
  cycle.net_spent = cycle.total_spent - cycle.total_brought_back
  cycle.closing_balance = cycle.total_available - cycle.net_spent

  const entries = db.prepare(`SELECT * FROM entries WHERE cycle_id=? ORDER BY date, id`).all(cycleId)
  const signatories = db.prepare('SELECT * FROM signatories WHERE is_active=1 ORDER BY sort_order').all()

  return { cycle, entries, signatories }
}

function getAbstractData(cycleId) {
  const db = getDatabase()
  const cycle = db.prepare(`
    SELECT ic.*, t.term_number, t.year, t.period_type, t.custom_name,
      (ic.opening_balance + ic.amount_received) AS total_available,
      (SELECT COALESCE(SUM(amount),0) FROM entries WHERE cycle_id = ic.id) AS total_spent,
      (SELECT COALESCE(SUM(balance_back),0) FROM entries WHERE cycle_id = ic.id) AS total_brought_back
    FROM imprest_cycles ic
    JOIN terms t ON t.id = ic.term_id
    WHERE ic.id = ?
  `).get(cycleId)

  if (!cycle) throw new Error('Cycle not found')
  cycle.net_spent = cycle.total_spent - cycle.total_brought_back
  cycle.closing_balance = cycle.total_available - cycle.net_spent

  const categories = db.prepare('SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order').all()
  const entries = db.prepare('SELECT * FROM entries WHERE cycle_id=? ORDER BY date, id').all(cycleId)

  const allSplits = db.prepare(`
    SELECT s.* FROM entry_category_splits s
    JOIN entries e ON e.id = s.entry_id
    WHERE e.cycle_id = ?
  `).all(cycleId)

  const splitMap = {}
  allSplits.forEach(sp => {
    if (!splitMap[sp.entry_id]) splitMap[sp.entry_id] = {}
    splitMap[sp.entry_id][sp.category_id] = sp.amount
  })

  const rows = entries.map(e => ({
    voucher_number: e.voucher_number,
    amount: e.amount,
    balance_back: Number(e.balance_back || 0),
    net_amount: e.amount - Number(e.balance_back || 0),
    splits: splitMap[e.id] || {},
  }))

  const categoryTotals = {}
  categories.forEach(c => { categoryTotals[c.id] = 0 })
  rows.forEach(row => {
    categories.forEach(c => { categoryTotals[c.id] += row.splits[c.id] || 0 })
  })

  const signatories = db.prepare('SELECT * FROM signatories WHERE is_active=1 ORDER BY sort_order').all()
  return { cycle, categories, rows, categoryTotals, signatories }
}

function getCycleMeta(cycleId) {
  const db = getDatabase()
  const cycle = db.prepare(`
    SELECT ic.*, t.term_number, t.year, t.period_type, t.custom_name
    FROM imprest_cycles ic JOIN terms t ON t.id=ic.term_id WHERE ic.id=?
  `).get(cycleId)
  const school = db.prepare('SELECT * FROM school_config WHERE id=1').get()
  return { cycle, school }
}

function getSchool() {
  return getDatabase().prepare('SELECT * FROM school_config WHERE id=1').get()
}

// File-name helper. cycleOrFilters is either a cycle row (for per-cycle reports)
// or a filters object (for analytics reports). Resolves term_id from the DB
// when only filters are given, so the filename still says T1_2025 not AllPeriods.
function defaultFileName(type, cycleOrFilters, ext) {
  let c = cycleOrFilters || {}
  // If we got a filters bag with term_id but no term_number/year, look it up
  if (c.term_id && !c.term_number) {
    const t = getDatabase().prepare('SELECT term_number, year FROM terms WHERE id=?').get(c.term_id)
    if (t) c = { ...c, term_number: t.term_number, year: t.year }
  }
  const yr = (c.term_number && c.year) ? `T${c.term_number}_${c.year}`
           : c.year ? String(c.year)
           : ''
  const cy = c.cycle_number ? `_C${c.cycle_number}` : ''
  switch (type) {
    case 'abstract':          return `Abstract_${yr}${cy}.${ext}`
    case 'combined':          return `Imprest_${yr}${cy}.${ext}`
    case 'consolidated':      return `Consolidated_${yr || 'AllPeriods'}.${ext}`
    case 'budget':            return `Budget_${yr || 'Term'}.${ext}`
    case 'trends':            return `Trends_${yr || 'AllPeriods'}.${ext}`
    case 'financial_summary': return `Summary_${yr || 'AllPeriods'}.${ext}`
    case 'full_workbook':     return `ImprestFull_${yr || 'AllPeriods'}.${ext}`
    case 'ledger':
    default:                  return `Ledger_${yr}${cy}.${ext}`
  }
}

// ─── PDF generator ──────────────────────────────────────────────────────────
//
// `subject` is either:
//   - a cycleId (number) for per-cycle reports (ledger, abstract)
//   - a filters object { year?, term_id?, cycle_ids?, ... } for analytics
//     reports (consolidated, trends, financial_summary)
//   - a termId (number) for budget — we accept either shape and resolve.
//
async function generatePDF(type, subject, options = {}) {
  const school = getSchool()
  let html, fileNameSubject

  switch (type) {
    case 'ledger': {
      const data = getLedgerData(subject)
      html = buildLedgerHTML(data, school, options)
      fileNameSubject = data.cycle
      break
    }
    case 'abstract': {
      const data = getAbstractData(subject)
      html = buildAbstractHTML(data, school, options)
      fileNameSubject = data.cycle
      break
    }
    case 'consolidated': {
      const filters = typeof subject === 'object' ? subject : {}
      const data = analytics.consolidatedAbstract(filters)
      html = buildConsolidatedHTML(data, school)
      fileNameSubject = filters
      break
    }
    case 'budget': {
      const termId = typeof subject === 'object' ? subject.term_id : subject
      if (!termId) throw new Error('Budget report requires a term.')
      const data = analytics.budgetSummary(termId)
      html = buildBudgetHTML(data, school)
      fileNameSubject = data.term
      break
    }
    case 'trends': {
      const filters = typeof subject === 'object' ? subject : {}
      const data = analytics.categoryTrends(filters)
      html = buildTrendsHTML(data, school)
      fileNameSubject = filters
      break
    }
    case 'financial_summary': {
      const filters = typeof subject === 'object' ? subject : {}
      const data = {
        metrics: analytics.dashboardMetrics(filters),
        topCategories: analytics.topCategories(filters, 5),
        budgetSummary: filters.term_id ? analytics.budgetSummary(filters.term_id) : null,
      }
      html = buildFinancialSummaryHTML(data, school)
      fileNameSubject = filters
      break
    }
    default:
      throw new Error(`Unknown PDF report type: ${type}`)
  }

  const tmpPath = path.join(os.tmpdir(), `imprest-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  await renderPDF(html, tmpPath)
  const buffer = fs.readFileSync(tmpPath)
  fs.unlinkSync(tmpPath)
  return { buffer, fileName: defaultFileName(type, fileNameSubject, 'pdf') }
}

// ─── Excel generator ────────────────────────────────────────────────────────
async function generateExcel(type, subject, options = {}) {
  const school = getSchool()
  let wb, fileNameSubject

  switch (type) {
    case 'ledger': {
      const data = getLedgerData(subject)
      wb = await buildLedgerWorkbook(data, school, options)
      fileNameSubject = data.cycle
      break
    }
    case 'abstract': {
      const data = getAbstractData(subject)
      wb = await buildAbstractWorkbook(data, school, options)
      fileNameSubject = data.cycle
      break
    }
    case 'combined': {
      const ledgerData = getLedgerData(subject)
      const abstractData = getAbstractData(subject)
      wb = await buildCombinedWorkbook(ledgerData, abstractData, school, options)
      fileNameSubject = ledgerData.cycle
      break
    }
    case 'consolidated': {
      const filters = typeof subject === 'object' ? subject : {}
      wb = await buildConsolidatedAbstractWorkbook(analytics.consolidatedAbstract(filters), school)
      fileNameSubject = filters
      break
    }
    case 'budget': {
      const termId = typeof subject === 'object' ? subject.term_id : subject
      if (!termId) throw new Error('Budget report requires a term.')
      const data = analytics.budgetSummary(termId)
      wb = await buildBudgetPerformanceWorkbook(data, school)
      fileNameSubject = data.term
      break
    }
    case 'trends': {
      const filters = typeof subject === 'object' ? subject : {}
      wb = await buildTrendsWorkbook(analytics.categoryTrends(filters), school)
      fileNameSubject = filters
      break
    }
    case 'financial_summary': {
      const filters = typeof subject === 'object' ? subject : {}
      const data = {
        metrics: analytics.dashboardMetrics(filters),
        topCategories: analytics.topCategories(filters, 5),
        budgetSummary: filters.term_id ? analytics.budgetSummary(filters.term_id) : null,
      }
      wb = await buildFinancialSummaryWorkbook(data, school)
      fileNameSubject = filters
      break
    }
    case 'full_workbook': {
      // subject can be { cycleId, filters } — combine everything.
      const cycleId = subject?.cycleId
      const filters = subject?.filters || (cycleId ? { cycle_ids: [cycleId] } : {})
      const all = {}
      if (cycleId) {
        all.ledger    = { data: getLedgerData(cycleId), options }
        all.abstract  = { data: getAbstractData(cycleId), options }
      }
      all.consolidated = { data: analytics.consolidatedAbstract(filters) }
      if (filters.term_id) {
        all.budget = { data: analytics.budgetSummary(filters.term_id) }
      }
      all.trends  = { data: analytics.categoryTrends(filters) }
      all.summary = {
        data: {
          metrics: analytics.dashboardMetrics(filters),
          topCategories: analytics.topCategories(filters, 5),
          budgetSummary: filters.term_id ? analytics.budgetSummary(filters.term_id) : null,
        },
      }
      wb = await buildFullWorkbook(all, school)
      fileNameSubject = filters
      break
    }
    default:
      throw new Error(`Unknown Excel report type: ${type}`)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return { buffer: Buffer.from(buffer), fileName: defaultFileName(type, fileNameSubject, 'xlsx') }
}

// ─── Electron IPC bindings (use save dialog) ─────────────────────────────────
function registerReportsHandlers(ipcMain, mainWindowRef, dialog, shell) {
  ipcMain.handle('reports:getLedger', (event, cycleId) => getLedgerData(cycleId))
  ipcMain.handle('reports:getAbstract', (event, cycleId) => getAbstractData(cycleId))

  ipcMain.handle('reports:exportPDF', async (event, type, cycleId, options = {}) => {
    const { buffer, fileName } = await generatePDF(type, cycleId, options)
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export PDF',
      defaultPath: fileName,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    fs.writeFileSync(filePath, buffer)
    shell.openPath(filePath)
    return { success: true, filePath }
  })

  ipcMain.handle('reports:exportExcel', async (event, type, cycleId, options = {}) => {
    const { buffer, fileName } = await generateExcel(type, cycleId, options)
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Excel',
      defaultPath: fileName,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    fs.writeFileSync(filePath, buffer)
    shell.openPath(filePath)
    return { success: true, filePath }
  })
}

module.exports = {
  registerReportsHandlers,
  // Pure functions — used by the Express server
  getLedgerData,
  getAbstractData,
  generatePDF,
  generateExcel,
}
