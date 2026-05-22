const { getDatabase } = require('../db/connection')
const { requireRole, getCurrentUserId } = require('./auth')

// ─── Audit helper ────────────────────────────────────────────────────────────
function audit(db, tableName, recordId, action, oldValues, newValues) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, user_id, old_values, new_values)
    VALUES (?,?,?,?,?,?)
  `).run(
    tableName, recordId, action,
    getCurrentUserId(),
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
  )
}

// ─── Guards ──────────────────────────────────────────────────────────────────
function assertCycleEditable(db, cycleId) {
  const c = db.prepare('SELECT status FROM imprest_cycles WHERE id=?').get(cycleId)
  if (!c) throw new Error('Cycle not found.')
  if (c.status === 'closed') {
    throw new Error('This cycle is closed. Re-open it from the Periods page to change its overrides.')
  }
}

// ─── Registration ────────────────────────────────────────────────────────────
function registerBudgetsHandlers(ipcMain) {
  // ── Term-level budgets ────────────────────────────────────────────────────
  //
  // budgets:listByTerm returns one row per active category (LEFT JOIN so
  // categories without a budget yet still appear with allocated=0). Spent
  // comes from v_category_spending_by_cycle aggregated per category for
  // the term.
  ipcMain.handle('budgets:listByTerm', (event, termId) => {
    const db = getDatabase()
    if (!termId) throw new Error('Term ID required.')
    return db.prepare(`
      SELECT
        c.id                              AS category_id,
        c.name                            AS name,
        c.sort_order                      AS sort_order,
        COALESCE(b.id, 0)                 AS budget_id,
        COALESCE(b.allocated_amount, 0)   AS allocated_amount,
        COALESCE(b.notes, '')             AS notes,
        COALESCE((
          SELECT SUM(spent) FROM v_category_spending_by_cycle
          WHERE term_id = ? AND category_id = c.id
        ), 0) AS spent
      FROM categories c
      LEFT JOIN budgets b ON b.term_id = ? AND b.category_id = c.id
      WHERE c.is_active = 1
      ORDER BY c.sort_order, c.name
    `).all(termId, termId).map(r => ({
      ...r,
      remaining: r.allocated_amount - r.spent,
      util_pct: r.allocated_amount > 0 ? (r.spent / r.allocated_amount) * 100 : null,
    }))
  })

  // Upsert one budget row
  ipcMain.handle('budgets:saveTerm', (event, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const { term_id, category_id, allocated_amount, notes } = data
    if (!term_id || !category_id) throw new Error('term_id and category_id required.')
    if (Number(allocated_amount) < 0) throw new Error('Allocated amount cannot be negative.')

    const existing = db.prepare('SELECT * FROM budgets WHERE term_id=? AND category_id=?')
      .get(term_id, category_id)

    if (existing) {
      db.prepare(`
        UPDATE budgets SET allocated_amount=?, notes=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(Number(allocated_amount), notes || null, existing.id)
      audit(db, 'budgets', existing.id, 'UPDATE', existing, data)
      return { id: existing.id, success: true }
    } else {
      const r = db.prepare(`
        INSERT INTO budgets (term_id, category_id, allocated_amount, notes)
        VALUES (?,?,?,?)
      `).run(term_id, category_id, Number(allocated_amount), notes || null)
      audit(db, 'budgets', r.lastInsertRowid, 'INSERT', null, data)
      return { id: r.lastInsertRowid, success: true }
    }
  })

  // Bulk save the entire budget form for a term in a single transaction
  ipcMain.handle('budgets:bulkSaveTerm', (event, termId, rows) => {
    requireRole('admin', 'accountant')
    if (!termId) throw new Error('Term ID required.')
    if (!Array.isArray(rows)) throw new Error('rows must be an array.')
    const db = getDatabase()

    const upsert = db.prepare(`
      INSERT INTO budgets (term_id, category_id, allocated_amount, notes)
      VALUES (?,?,?,?)
      ON CONFLICT(term_id, category_id) DO UPDATE SET
        allocated_amount = excluded.allocated_amount,
        notes            = excluded.notes,
        updated_at       = CURRENT_TIMESTAMP
    `)

    const txn = db.transaction((list) => {
      list.forEach(r => {
        if (Number(r.allocated_amount) < 0) throw new Error('Allocated amount cannot be negative.')
        upsert.run(termId, r.category_id, Number(r.allocated_amount || 0), r.notes || null)
      })
    })
    txn(rows)
    audit(db, 'budgets', termId, 'UPDATE', null, { termId, count: rows.length })
    return { success: true, count: rows.length }
  })

  ipcMain.handle('budgets:deleteTerm', (event, id) => {
    requireRole('admin')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM budgets WHERE id=?').get(id)
    if (!old) throw new Error('Budget row not found.')
    db.prepare('DELETE FROM budgets WHERE id=?').run(id)
    audit(db, 'budgets', id, 'DELETE', old, null)
    return { success: true }
  })

  // Copy all budgets from a source term to a destination term
  ipcMain.handle('budgets:copyFromTerm', (event, srcTermId, destTermId) => {
    requireRole('admin', 'accountant')
    if (!srcTermId || !destTermId) throw new Error('Both source and destination term IDs required.')
    if (srcTermId === destTermId) throw new Error('Source and destination must be different.')

    const db = getDatabase()
    const src = db.prepare('SELECT * FROM budgets WHERE term_id=?').all(srcTermId)
    if (src.length === 0) throw new Error('Source term has no budget rows to copy.')

    const upsert = db.prepare(`
      INSERT INTO budgets (term_id, category_id, allocated_amount, notes)
      VALUES (?,?,?,?)
      ON CONFLICT(term_id, category_id) DO UPDATE SET
        allocated_amount = excluded.allocated_amount,
        updated_at       = CURRENT_TIMESTAMP
    `)
    const txn = db.transaction(() => {
      src.forEach(r => upsert.run(destTermId, r.category_id, r.allocated_amount, r.notes))
    })
    txn()
    audit(db, 'budgets', destTermId, 'INSERT', null, { copiedFrom: srcTermId, count: src.length })
    return { success: true, count: src.length }
  })

  // ── Per-cycle overrides ──────────────────────────────────────────────────
  // For a cycle, returns one row per active category showing both the term
  // budget and the per-cycle override (if any). Useful for the "Cycle
  // Overrides" expandable section on the Budgets page.
  ipcMain.handle('budgets:listOverrides', (event, cycleId) => {
    const db = getDatabase()
    if (!cycleId) throw new Error('Cycle ID required.')
    const cycle = db.prepare(`
      SELECT ic.term_id FROM imprest_cycles ic WHERE ic.id=?
    `).get(cycleId)
    if (!cycle) throw new Error('Cycle not found.')

    return db.prepare(`
      SELECT
        c.id                            AS category_id,
        c.name                          AS name,
        c.sort_order                    AS sort_order,
        COALESCE(b.allocated_amount, 0) AS term_budget,
        bo.id                           AS override_id,
        bo.allocated_amount             AS override_amount,
        bo.notes                        AS notes
      FROM categories c
      LEFT JOIN budgets b
        ON b.term_id = ? AND b.category_id = c.id
      LEFT JOIN budget_overrides bo
        ON bo.cycle_id = ? AND bo.category_id = c.id
      WHERE c.is_active = 1
      ORDER BY c.sort_order
    `).all(cycle.term_id, cycleId)
  })

  ipcMain.handle('budgets:saveOverride', (event, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const { cycle_id, category_id, allocated_amount, notes } = data
    if (!cycle_id || !category_id) throw new Error('cycle_id and category_id required.')
    if (Number(allocated_amount) < 0) throw new Error('Override amount cannot be negative.')
    assertCycleEditable(db, cycle_id)

    const existing = db.prepare(
      'SELECT * FROM budget_overrides WHERE cycle_id=? AND category_id=?'
    ).get(cycle_id, category_id)

    if (existing) {
      db.prepare('UPDATE budget_overrides SET allocated_amount=?, notes=? WHERE id=?')
        .run(Number(allocated_amount), notes || null, existing.id)
      audit(db, 'budget_overrides', existing.id, 'UPDATE', existing, data)
      return { id: existing.id, success: true }
    } else {
      const r = db.prepare(`
        INSERT INTO budget_overrides (cycle_id, category_id, allocated_amount, notes)
        VALUES (?,?,?,?)
      `).run(cycle_id, category_id, Number(allocated_amount), notes || null)
      audit(db, 'budget_overrides', r.lastInsertRowid, 'INSERT', null, data)
      return { id: r.lastInsertRowid, success: true }
    }
  })

  ipcMain.handle('budgets:deleteOverride', (event, id) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM budget_overrides WHERE id=?').get(id)
    if (!old) throw new Error('Override not found.')
    assertCycleEditable(db, old.cycle_id)
    db.prepare('DELETE FROM budget_overrides WHERE id=?').run(id)
    audit(db, 'budget_overrides', id, 'DELETE', old, null)
    return { success: true }
  })

  // Resolved effective budget per (cycle, category): override if exists, else
  // term budget. Used by analytics queries when computing per-cycle utilization.
  ipcMain.handle('budgets:effectiveForCycle', (event, cycleId) => {
    const db = getDatabase()
    if (!cycleId) throw new Error('Cycle ID required.')
    const cycle = db.prepare('SELECT term_id FROM imprest_cycles WHERE id=?').get(cycleId)
    if (!cycle) throw new Error('Cycle not found.')

    return db.prepare(`
      SELECT
        c.id   AS category_id,
        c.name AS name,
        COALESCE(bo.allocated_amount, b.allocated_amount, 0) AS effective_amount,
        CASE WHEN bo.id IS NOT NULL THEN 'override' ELSE 'term' END AS source
      FROM categories c
      LEFT JOIN budgets b           ON b.term_id  = ? AND b.category_id = c.id
      LEFT JOIN budget_overrides bo ON bo.cycle_id = ? AND bo.category_id = c.id
      WHERE c.is_active = 1
      ORDER BY c.sort_order
    `).all(cycle.term_id, cycleId)
  })
}

module.exports = { registerBudgetsHandlers }
