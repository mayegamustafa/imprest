const { getDatabase } = require('../db/connection')

// ─── Filter helpers ──────────────────────────────────────────────────────────
//
// All analytics queries accept the same `filters` shape:
//   {
//     year?:        number
//     term_id?:     number
//     cycle_ids?:   number[]
//     category_ids?: number[]
//     date_from?:   'YYYY-MM-DD'
//     date_to?:     'YYYY-MM-DD'
//   }
//
// `buildEntryFilter()` returns a parameterised SQL fragment + params array
// scoped to the entries table. Use it like:
//   const { sql, params } = buildEntryFilter(filters, 'e', 'ic')
//   db.prepare(`SELECT ... WHERE ${sql}`).all(...params)
function buildEntryFilter(filters = {}, entriesAlias = 'e', cyclesAlias = 'ic') {
  const where = ['1=1']
  const params = []

  if (filters.year) {
    where.push(`t.year = ?`)
    params.push(Number(filters.year))
  }
  if (filters.term_id) {
    where.push(`${cyclesAlias}.term_id = ?`)
    params.push(Number(filters.term_id))
  }
  if (Array.isArray(filters.cycle_ids) && filters.cycle_ids.length > 0) {
    where.push(`${cyclesAlias}.id IN (${filters.cycle_ids.map(() => '?').join(',')})`)
    filters.cycle_ids.forEach(id => params.push(Number(id)))
  }
  if (filters.date_from) {
    where.push(`${entriesAlias}.date >= ?`)
    params.push(filters.date_from)
  }
  if (filters.date_to) {
    where.push(`${entriesAlias}.date <= ?`)
    params.push(filters.date_to)
  }

  return { sql: where.join(' AND '), params }
}

function buildSplitFilter(filters = {}) {
  // category_ids filter applies to entry_category_splits.category_id
  if (Array.isArray(filters.category_ids) && filters.category_ids.length > 0) {
    return {
      sql: `s.category_id IN (${filters.category_ids.map(() => '?').join(',')})`,
      params: filters.category_ids.map(Number),
    }
  }
  return { sql: '1=1', params: [] }
}

// Human-readable summary of the active filters (shown on dashboard / report header)
function scopeLabel(filters, db) {
  const parts = []
  if (filters.year) parts.push(`Year ${filters.year}`)
  if (filters.term_id) {
    const t = db.prepare('SELECT * FROM terms WHERE id=?').get(filters.term_id)
    if (t) {
      const map = { term: 'Term', month: 'Month', quarter: 'Quarter', custom: 'Period' }
      parts.push(`${map[t.period_type] || 'Period'} ${t.term_number}/${t.year}`)
    }
  }
  if (Array.isArray(filters.cycle_ids) && filters.cycle_ids.length > 0) {
    parts.push(`${filters.cycle_ids.length} cycle(s)`)
  }
  if (Array.isArray(filters.category_ids) && filters.category_ids.length > 0) {
    parts.push(`${filters.category_ids.length} category filter`)
  }
  if (filters.date_from || filters.date_to) {
    parts.push(`${filters.date_from || '…'} → ${filters.date_to || '…'}`)
  }
  return parts.length === 0 ? 'All data' : parts.join(' · ')
}

// ─── Pure data functions (also used by reports.js for PDF/Excel) ─────────────

function dashboardMetrics(filters = {}) {
  const db = getDatabase()
  const ef = buildEntryFilter(filters)

  // Totals from entries (gross / brought back / net)
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(e.amount), 0)       AS total_spent,
      COALESCE(SUM(e.balance_back), 0) AS total_brought_back,
      COUNT(e.id)                      AS vouchers_count
    FROM entries e
    JOIN imprest_cycles ic ON ic.id = e.cycle_id
    JOIN terms t ON t.id = ic.term_id
    WHERE ${ef.sql}
  `).get(...ef.params)

  // If a category filter is active, recompute total_spent from splits
  if (Array.isArray(filters.category_ids) && filters.category_ids.length > 0) {
    const sf = buildSplitFilter(filters)
    const filtered = db.prepare(`
      SELECT COALESCE(SUM(s.amount), 0) AS s
      FROM entry_category_splits s
      JOIN entries e ON e.id = s.entry_id
      JOIN imprest_cycles ic ON ic.id = e.cycle_id
      JOIN terms t ON t.id = ic.term_id
      WHERE ${ef.sql} AND ${sf.sql}
    `).get(...ef.params, ...sf.params)
    totals.total_spent = filtered.s
    totals.total_brought_back = 0  // brought-back is per-voucher, not per-category
  }

  const net_spent = totals.total_spent - totals.total_brought_back

  // Budget: pull from v_budget_status filtered by term (if a single term is
  // selected) and category_ids (if any). If no term is selected, sum all
  // budgets in the year (if year is selected) or globally.
  let budgetWhere = '1=1'
  const budgetParams = []
  if (filters.term_id) {
    budgetWhere = 'vbs.term_id = ?'
    budgetParams.push(filters.term_id)
  } else if (filters.year) {
    budgetWhere = `vbs.term_id IN (SELECT id FROM terms WHERE year = ?)`
    budgetParams.push(filters.year)
  }
  if (Array.isArray(filters.category_ids) && filters.category_ids.length > 0) {
    budgetWhere += ` AND vbs.category_id IN (${filters.category_ids.map(() => '?').join(',')})`
    filters.category_ids.forEach(id => budgetParams.push(Number(id)))
  }
  const budgetRow = db.prepare(`
    SELECT COALESCE(SUM(vbs.allocated_amount), 0) AS total_budget
    FROM v_budget_status vbs
    WHERE ${budgetWhere}
  `).get(...budgetParams)
  const total_budget = budgetRow.total_budget

  const remaining_budget = total_budget - net_spent
  const utilization_pct = total_budget > 0 ? (net_spent / total_budget) * 100 : null

  // Active cycles count (within the same filter scope)
  const activeCycles = db.prepare(`
    SELECT COUNT(DISTINCT ic.id) AS c
    FROM imprest_cycles ic
    JOIN terms t ON t.id = ic.term_id
    WHERE ic.status = 'active'
      ${filters.year ? 'AND t.year = ?' : ''}
      ${filters.term_id ? 'AND ic.term_id = ?' : ''}
  `).get(...[filters.year, filters.term_id].filter(Boolean))

  return {
    total_budget,
    total_spent: totals.total_spent,
    total_brought_back: totals.total_brought_back,
    net_spent,
    remaining_budget,
    utilization_pct,
    active_cycles_count: activeCycles.c,
    vouchers_count: totals.vouchers_count,
    scope_label: scopeLabel(filters, db),
  }
}

// Matrix: categories × cycles
function consolidatedAbstract(filters = {}) {
  const db = getDatabase()
  const ef = buildEntryFilter(filters)
  const sf = buildSplitFilter(filters)

  // Cycles in scope
  const cycles = db.prepare(`
    SELECT DISTINCT
      ic.id, ic.term_id, ic.cycle_number, ic.name,
      t.term_number, t.year, t.period_type, t.custom_name
    FROM imprest_cycles ic
    JOIN terms t ON t.id = ic.term_id
    WHERE ${ef.sql.replace(/e\.date/g, "'1900-01-01'")}
      AND ic.id IN (
        SELECT DISTINCT ic2.id
        FROM imprest_cycles ic2
        JOIN terms t2 ON t2.id = ic2.term_id
        WHERE ${ef.sql.replace(/e\./g, '').replace(/t\./g, 't2.').replace(/ic\./g, 'ic2.')}
      )
    ORDER BY t.year, t.term_number, ic.cycle_number
  `).all(...ef.params, ...ef.params)

  // Active categories (optionally filtered)
  let categories
  if (Array.isArray(filters.category_ids) && filters.category_ids.length > 0) {
    categories = db.prepare(`
      SELECT id, name FROM categories
      WHERE is_active = 1
        AND id IN (${filters.category_ids.map(() => '?').join(',')})
      ORDER BY sort_order, name
    `).all(...filters.category_ids.map(Number))
  } else {
    categories = db.prepare(
      'SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name'
    ).all()
  }

  // The big matrix query
  const cells = db.prepare(`
    SELECT
      ic.id           AS cycle_id,
      s.category_id   AS category_id,
      COALESCE(SUM(s.amount), 0) AS spent
    FROM entry_category_splits s
    JOIN entries e ON e.id = s.entry_id
    JOIN imprest_cycles ic ON ic.id = e.cycle_id
    JOIN terms t ON t.id = ic.term_id
    WHERE ${ef.sql} AND ${sf.sql}
    GROUP BY ic.id, s.category_id
  `).all(...ef.params, ...sf.params)

  // Reshape into matrix[category_id][cycle_id] = spent
  const matrix = {}
  categories.forEach(c => { matrix[c.id] = {} })
  cells.forEach(({ cycle_id, category_id, spent }) => {
    if (!matrix[category_id]) matrix[category_id] = {}
    matrix[category_id][cycle_id] = spent
  })

  // Row + column totals
  const category_totals = {}
  categories.forEach(c => {
    category_totals[c.id] = cycles.reduce((s, cyc) => s + (matrix[c.id]?.[cyc.id] || 0), 0)
  })
  const cycle_totals = {}
  cycles.forEach(cyc => {
    cycle_totals[cyc.id] = categories.reduce((s, c) => s + (matrix[c.id]?.[cyc.id] || 0), 0)
  })
  const grand_total = Object.values(category_totals).reduce((s, v) => s + v, 0)

  return {
    cycles: cycles.map(c => ({
      id: c.id,
      term_id: c.term_id,
      cycle_number: c.cycle_number,
      name: c.name,
      label: c.name || `Cycle ${c.cycle_number}`,
      term_number: c.term_number,
      year: c.year,
    })),
    categories,
    matrix,
    category_totals,
    cycle_totals,
    grand_total,
    scope_label: scopeLabel(filters, db),
  }
}

function budgetSummary(termId) {
  const db = getDatabase()
  if (!termId) throw new Error('Term ID required.')
  const term = db.prepare('SELECT * FROM terms WHERE id=?').get(termId)
  if (!term) throw new Error('Term not found.')

  // Same shape as budgets:listByTerm but presented for analytics
  const rows = db.prepare(`
    SELECT
      c.id                              AS category_id,
      c.name                            AS name,
      COALESCE(b.allocated_amount, 0)   AS allocated,
      COALESCE((
        SELECT SUM(spent) FROM v_category_spending_by_cycle
        WHERE term_id = ? AND category_id = c.id
      ), 0) AS spent
    FROM categories c
    LEFT JOIN budgets b ON b.term_id = ? AND b.category_id = c.id
    WHERE c.is_active = 1
    ORDER BY c.sort_order, c.name
  `).all(termId, termId).map(r => {
    const remaining = r.allocated - r.spent
    const util_pct = r.allocated > 0 ? (r.spent / r.allocated) * 100 : null
    let status = 'no_budget'
    if (r.allocated > 0) {
      if (r.spent > r.allocated) status = 'over'
      else if (util_pct >= 90) status = 'critical'
      else if (util_pct >= 70) status = 'high'
      else status = 'healthy'
    } else if (r.spent > 0) {
      status = 'unallocated_spend'
    }
    return { ...r, remaining, util_pct, status }
  })

  const totals = rows.reduce((acc, r) => ({
    allocated: acc.allocated + r.allocated,
    spent: acc.spent + r.spent,
  }), { allocated: 0, spent: 0 })
  totals.remaining = totals.allocated - totals.spent
  totals.util_pct = totals.allocated > 0 ? (totals.spent / totals.allocated) * 100 : null

  return { term, rows, totals }
}

// Time-series for the spending-trend line chart
function categoryTrends(filters = {}) {
  const db = getDatabase()
  const ef = buildEntryFilter(filters)
  const sf = buildSplitFilter(filters)

  // Decide bucket from date range. If a single term is selected and no date
  // range, bucket by cycle. Otherwise bucket by month.
  const useCycleBuckets = filters.term_id && !filters.date_from && !filters.date_to
  let bucket
  let bucketExpr
  let labelExpr
  if (useCycleBuckets) {
    bucket = 'cycle'
    bucketExpr = 'ic.cycle_number'
    labelExpr = `COALESCE(ic.name, 'Cycle ' || ic.cycle_number)`
  } else {
    bucket = 'month'
    bucketExpr = `strftime('%Y-%m', e.date)`
    labelExpr = `strftime('%Y-%m', e.date)`
  }

  // Top N categories by spend in scope (defaults to 6 — fits a line chart)
  const topCats = db.prepare(`
    SELECT s.category_id, c.name, SUM(s.amount) AS total
    FROM entry_category_splits s
    JOIN entries e ON e.id = s.entry_id
    JOIN imprest_cycles ic ON ic.id = e.cycle_id
    JOIN terms t ON t.id = ic.term_id
    JOIN categories c ON c.id = s.category_id
    WHERE ${ef.sql} AND ${sf.sql}
    GROUP BY s.category_id
    ORDER BY total DESC
    LIMIT 6
  `).all(...ef.params, ...sf.params)

  // Bucket spend per (top category × bucket)
  const allBuckets = db.prepare(`
    SELECT DISTINCT ${bucketExpr} AS bucket_key, ${labelExpr} AS bucket_label
    FROM entries e
    JOIN imprest_cycles ic ON ic.id = e.cycle_id
    JOIN terms t ON t.id = ic.term_id
    WHERE ${ef.sql}
    ORDER BY bucket_key
  `).all(...ef.params)

  const series = topCats.map(tc => {
    const points = allBuckets.map(b => {
      // Need bucket-level WHERE in the join. Build dynamically.
      const row = db.prepare(`
        SELECT COALESCE(SUM(s.amount), 0) AS y
        FROM entry_category_splits s
        JOIN entries e ON e.id = s.entry_id
        JOIN imprest_cycles ic ON ic.id = e.cycle_id
        JOIN terms t ON t.id = ic.term_id
        WHERE ${ef.sql} AND s.category_id = ? AND ${bucketExpr} = ?
      `).get(...ef.params, tc.category_id, b.bucket_key)
      return { x: b.bucket_label, y: row.y }
    })
    return { category_id: tc.category_id, name: tc.name, points }
  })

  return {
    bucket,
    labels: allBuckets.map(b => b.bucket_label),
    series,
  }
}

function topCategories(filters = {}, limit = 5) {
  const db = getDatabase()
  const ef = buildEntryFilter(filters)
  const sf = buildSplitFilter(filters)

  const rows = db.prepare(`
    SELECT
      c.id   AS category_id,
      c.name AS name,
      COALESCE(SUM(s.amount), 0) AS spent
    FROM categories c
    LEFT JOIN entry_category_splits s ON s.category_id = c.id
    LEFT JOIN entries e ON e.id = s.entry_id
    LEFT JOIN imprest_cycles ic ON ic.id = e.cycle_id
    LEFT JOIN terms t ON t.id = ic.term_id
    WHERE c.is_active = 1 AND (e.id IS NULL OR (${ef.sql} AND ${sf.sql}))
    GROUP BY c.id
    HAVING spent > 0
    ORDER BY spent DESC
    LIMIT ?
  `).all(...ef.params, ...sf.params, limit)

  const total = rows.reduce((s, r) => s + r.spent, 0)
  return rows.map(r => ({
    ...r,
    pct_of_total: total > 0 ? (r.spent / total) * 100 : 0,
  }))
}

function voucherTimeline(filters = {}) {
  const db = getDatabase()
  const ef = buildEntryFilter(filters)

  // Pull each voucher with its primary category (the largest split). For
  // the timeline we need a single category color per voucher.
  return db.prepare(`
    SELECT
      e.id, e.cycle_id, e.voucher_number, e.date, e.payee, e.purpose, e.amount,
      ic.cycle_number,
      (SELECT s.category_id FROM entry_category_splits s
        WHERE s.entry_id = e.id ORDER BY s.amount DESC LIMIT 1) AS category_id,
      (SELECT c.name FROM entry_category_splits s
        JOIN categories c ON c.id = s.category_id
        WHERE s.entry_id = e.id ORDER BY s.amount DESC LIMIT 1) AS category_name
    FROM entries e
    JOIN imprest_cycles ic ON ic.id = e.cycle_id
    JOIN terms t ON t.id = ic.term_id
    WHERE ${ef.sql}
    ORDER BY e.date, e.id
  `).all(...ef.params)
}

// ─── IPC registration (handlers, all read-only — accessible to any role) ────
function registerAnalyticsHandlers(ipcMain) {
  ipcMain.handle('analytics:dashboardMetrics', (event, filters) => dashboardMetrics(filters))
  ipcMain.handle('analytics:consolidatedAbstract', (event, filters) => consolidatedAbstract(filters))
  ipcMain.handle('analytics:budgetSummary', (event, termId) => budgetSummary(termId))
  ipcMain.handle('analytics:categoryTrends', (event, filters) => categoryTrends(filters))
  ipcMain.handle('analytics:topCategories', (event, filters, limit) => topCategories(filters, limit))
  ipcMain.handle('analytics:voucherTimeline', (event, filters) => voucherTimeline(filters))
}

module.exports = {
  registerAnalyticsHandlers,
  dashboardMetrics,
  consolidatedAbstract,
  budgetSummary,
  categoryTrends,
  topCategories,
  voucherTimeline,
}
