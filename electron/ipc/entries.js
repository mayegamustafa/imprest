const { getDatabase } = require('../db/connection')
const { requireRole, getCurrentUserId } = require('./auth')

// ─── Guards ───────────────────────────────────────────────────────────────────
function assertCycleEditable(db, cycleId) {
  const cycle = db.prepare('SELECT status FROM imprest_cycles WHERE id=?').get(cycleId)
  if (!cycle) throw new Error('Cycle not found.')
  if (cycle.status === 'closed') {
    throw new Error('This cycle is closed. Re-open it from the Periods page to make changes.')
  }
}

function assertEntryCycleEditable(db, entryId) {
  const row = db.prepare('SELECT cycle_id FROM entries WHERE id=?').get(entryId)
  if (!row) throw new Error('Entry not found.')
  assertCycleEditable(db, row.cycle_id)
  return row.cycle_id
}

/**
 * Validate the category splits sum to the NET spent (amount - balance_back).
 *
 * If net is zero (whole voucher returned), no splits are required.
 * Otherwise, the splits must sum to exactly the net amount, since the splits
 * represent the true category spending shown in the abstract.
 */
function validateSplitsRequired(splits, amount, balanceBack = 0) {
  const netAmount = Number(amount) - Number(balanceBack)
  if (netAmount < 0.005) {
    // Whole voucher was returned — splits not required
    return
  }
  if (!Array.isArray(splits) || splits.filter(s => Number(s.amount) > 0).length === 0) {
    throw new Error('At least one category split is required.')
  }
  const total = splits.reduce((s, sp) => s + Number(sp.amount || 0), 0)
  if (Math.abs(total - netAmount) > 0.01) {
    throw new Error(
      `Category total (${total.toLocaleString()}) must equal net spent ` +
      `(${netAmount.toLocaleString()} = ${Number(amount).toLocaleString()} amount ` +
      `- ${Number(balanceBack).toLocaleString()} brought back).`
    )
  }
}

function registerEntriesHandlers(ipcMain) {
  ipcMain.handle('entries:getByCycle', (event, cycleId) => {
    const db = getDatabase()
    const entries = db.prepare(`
      SELECT e.*,
        ROW_NUMBER() OVER (ORDER BY e.date, e.id) AS row_seq
      FROM entries e
      WHERE e.cycle_id = ?
      ORDER BY e.date, e.id
    `).all(cycleId)

    // Attach category splits to each entry
    const getSplits = db.prepare(`
      SELECT s.*, c.name AS category_name
      FROM entry_category_splits s
      JOIN categories c ON c.id = s.category_id
      WHERE s.entry_id = ?
      ORDER BY c.sort_order
    `)
    return entries.map(e => ({ ...e, splits: getSplits.all(e.id) }))
  })

  ipcMain.handle('entries:create', (event, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const { cycle_id, date, payee, purpose, amount, splits } = data
    const balanceBack = Number(data.balance_back || 0)

    // ── Guards ──
    assertCycleEditable(db, cycle_id)
    if (!date || !payee?.trim() || !purpose?.trim()) {
      throw new Error('Date, payee, and purpose are required.')
    }
    if (!(Number(amount) > 0)) {
      throw new Error('Amount must be greater than zero.')
    }
    if (balanceBack < 0 || balanceBack > Number(amount)) {
      throw new Error('Balance brought back must be between 0 and the voucher amount.')
    }
    validateSplitsRequired(splits, amount, balanceBack)

    // Auto voucher number: next in sequence for this cycle
    const maxVoucher = db.prepare('SELECT MAX(voucher_number) as m FROM entries WHERE cycle_id=?').get(cycle_id)
    const voucherNumber = (maxVoucher.m ?? 0) + 1

    const insertEntry = db.prepare(`
      INSERT INTO entries (cycle_id, voucher_number, date, payee, purpose, amount, balance_back)
      VALUES (?,?,?,?,?,?,?)
    `)
    const insertSplit = db.prepare(`
      INSERT INTO entry_category_splits (entry_id, category_id, amount)
      VALUES (?,?,?)
    `)

    const run = db.transaction(() => {
      const result = insertEntry.run(cycle_id, voucherNumber, date, payee.trim(), purpose.trim(), amount, balanceBack)
      const entryId = result.lastInsertRowid
      ;(splits || []).forEach(sp => {
        if (Number(sp.amount) > 0) insertSplit.run(entryId, sp.category_id, sp.amount)
      })
      audit(db, 'entries', entryId, 'INSERT', null, { ...data, voucher_number: voucherNumber })
      return entryId
    })

    const entryId = run()
    return { id: entryId, voucher_number: voucherNumber, success: true }
  })

  ipcMain.handle('entries:update', (event, id, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const { date, payee, purpose, amount, splits } = data
    const balanceBack = Number(data.balance_back || 0)

    // ── Guards ──
    assertEntryCycleEditable(db, id)
    if (!date || !payee?.trim() || !purpose?.trim()) {
      throw new Error('Date, payee, and purpose are required.')
    }
    if (!(Number(amount) > 0)) {
      throw new Error('Amount must be greater than zero.')
    }
    if (balanceBack < 0 || balanceBack > Number(amount)) {
      throw new Error('Balance brought back must be between 0 and the voucher amount.')
    }
    validateSplitsRequired(splits, amount, balanceBack)

    const old = db.prepare('SELECT * FROM entries WHERE id=?').get(id)

    const run = db.transaction(() => {
      db.prepare(`
        UPDATE entries
        SET date=?, payee=?, purpose=?, amount=?, balance_back=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(date, payee.trim(), purpose.trim(), amount, balanceBack, id)

      // Replace splits
      db.prepare('DELETE FROM entry_category_splits WHERE entry_id=?').run(id)
      const insertSplit = db.prepare('INSERT INTO entry_category_splits (entry_id, category_id, amount) VALUES (?,?,?)')
      ;(splits || []).forEach(sp => {
        if (Number(sp.amount) > 0) insertSplit.run(id, sp.category_id, sp.amount)
      })
      audit(db, 'entries', id, 'UPDATE', old, data)
    })

    run()
    return { success: true }
  })

  ipcMain.handle('entries:delete', (event, id) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    assertEntryCycleEditable(db, id)
    const old = db.prepare('SELECT * FROM entries WHERE id=?').get(id)
    if (!old) throw new Error('Entry not found.')
    // Splits deleted via ON DELETE CASCADE
    db.prepare('DELETE FROM entries WHERE id=?').run(id)
    audit(db, 'entries', id, 'DELETE', old, null)
    return { success: true }
  })
}

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

module.exports = { registerEntriesHandlers }
