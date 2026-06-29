const { getDatabase } = require('../db/connection')
const { requireRole, getCurrentUserId } = require('./auth')

function registerTermsHandlers(ipcMain) {
  // ── Terms ────────────────────────────────────────────────────────────────────
  ipcMain.handle('terms:getAll', () => {
    const db = getDatabase()
    const terms = db.prepare(`
      SELECT id, term_number, year, period_type, custom_name, created_at
      FROM terms
      ORDER BY year DESC, period_type, term_number DESC
    `).all()
    return terms.map(term => {
      const cycles = db.prepare(`
        SELECT *,
          (opening_balance + amount_received
            + (SELECT COALESCE(SUM(amount),0) FROM cycle_receipts WHERE cycle_id = imprest_cycles.id)) AS total_available,
          (SELECT COALESCE(SUM(amount),0) FROM cycle_receipts WHERE cycle_id = imprest_cycles.id) AS total_additional_received,
          (SELECT COALESCE(SUM(amount),0) FROM entries WHERE cycle_id = imprest_cycles.id) AS total_spent,
        (SELECT COALESCE(SUM(balance_back),0) FROM entries WHERE cycle_id = imprest_cycles.id) AS total_brought_back
        FROM imprest_cycles
        WHERE term_id = ?
        ORDER BY cycle_number
      `).all(term.id)
      return { ...term, cycles }
    })
  })

  ipcMain.handle('terms:create', (event, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const periodType = data.period_type || 'term'
    try {
      const result = db.prepare(`
        INSERT INTO terms (term_number, year, period_type, custom_name)
        VALUES (?,?,?,?)
      `).run(data.term_number, data.year, periodType, data.custom_name ?? null)
      audit(db, 'terms', result.lastInsertRowid, 'INSERT', null, data)
      return { id: result.lastInsertRowid, success: true }
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        throw new Error(`This period already exists for ${data.year}.`)
      }
      throw err
    }
  })

  ipcMain.handle('terms:delete', (event, id) => {
    requireRole('admin')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM terms WHERE id=?').get(id)
    db.prepare('DELETE FROM terms WHERE id=?').run(id)
    audit(db, 'terms', id, 'DELETE', old, null)
    return { success: true }
  })

  // ── Cycles ───────────────────────────────────────────────────────────────────
  ipcMain.handle('cycles:getByTerm', (event, termId) => {
    const db = getDatabase()
    return db.prepare(`
      SELECT *,
        (opening_balance + amount_received
          + (SELECT COALESCE(SUM(amount),0) FROM cycle_receipts WHERE cycle_id = imprest_cycles.id)) AS total_available,
        (SELECT COALESCE(SUM(amount),0) FROM cycle_receipts WHERE cycle_id = imprest_cycles.id) AS total_additional_received,
        (SELECT COALESCE(SUM(amount),0) FROM entries WHERE cycle_id = imprest_cycles.id) AS total_spent,
        (SELECT COALESCE(SUM(balance_back),0) FROM entries WHERE cycle_id = imprest_cycles.id) AS total_brought_back
      FROM imprest_cycles
      WHERE term_id = ?
      ORDER BY cycle_number
    `).all(termId)
  })

  ipcMain.handle('cycles:create', (event, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const ordinal = ['1st','2nd','3rd','4th','5th','6th']
    const term = db.prepare('SELECT * FROM terms WHERE id=?').get(data.term_id)
    const cycleName = data.name || `${ordinal[data.cycle_number - 1] || data.cycle_number + 'th'} Imprest - Term ${term.term_number} ${term.year}`

    try {
      const result = db.prepare(`
        INSERT INTO imprest_cycles (term_id, cycle_number, name, opening_balance, amount_received)
        VALUES (?,?,?,?,?)
      `).run(data.term_id, data.cycle_number, cycleName, data.opening_balance ?? 0, data.amount_received ?? 0)
      audit(db, 'imprest_cycles', result.lastInsertRowid, 'INSERT', null, data)
      return { id: result.lastInsertRowid, success: true }
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        throw new Error(`Cycle ${data.cycle_number} already exists for this term.`)
      }
      throw err
    }
  })

  ipcMain.handle('cycles:update', (event, id, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM imprest_cycles WHERE id=?').get(id)
    if (!old) throw new Error('Cycle not found.')
    if (old.status === 'closed') {
      throw new Error('This cycle is closed. Re-open it before editing.')
    }
    db.prepare(`
      UPDATE imprest_cycles SET name=?, opening_balance=?, amount_received=? WHERE id=?
    `).run(data.name, data.opening_balance, data.amount_received, id)
    audit(db, 'imprest_cycles', id, 'UPDATE', old, data)
    return { success: true }
  })

  ipcMain.handle('cycles:close', (event, id) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const cycle = db.prepare(`
      SELECT *,
        (opening_balance + amount_received
          + (SELECT COALESCE(SUM(amount),0) FROM cycle_receipts WHERE cycle_id = imprest_cycles.id)) AS total_available,
        (SELECT COALESCE(SUM(amount),0) FROM entries WHERE cycle_id = imprest_cycles.id) AS total_spent,
        (SELECT COALESCE(SUM(balance_back),0) FROM entries WHERE cycle_id = imprest_cycles.id) AS total_brought_back
      FROM imprest_cycles WHERE id=?
    `).get(id)

    if (!cycle) throw new Error('Cycle not found.')
    if (cycle.status === 'closed') throw new Error('Cycle is already closed.')

    const netSpent = cycle.total_spent - (cycle.total_brought_back || 0)
    const closingBalance = cycle.total_available - netSpent

    db.prepare("UPDATE imprest_cycles SET status='closed' WHERE id=?").run(id)
    audit(db, 'imprest_cycles', id, 'UPDATE', cycle, { status: 'closed', closingBalance })

    return { success: true, closingBalance }
  })

  ipcMain.handle('cycles:reopen', (event, id) => {
    requireRole('admin')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM imprest_cycles WHERE id=?').get(id)
    if (!old) throw new Error('Cycle not found.')
    if (old.status !== 'closed') throw new Error('Cycle is not closed.')
    db.prepare("UPDATE imprest_cycles SET status='active' WHERE id=?").run(id)
    audit(db, 'imprest_cycles', id, 'UPDATE', old, { status: 'active' })
    return { success: true }
  })

  ipcMain.handle('cycles:delete', (event, id) => {
    requireRole('admin')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM imprest_cycles WHERE id=?').get(id)
    if (!old) throw new Error('Cycle not found.')
    if (old.status === 'closed') {
      throw new Error('This cycle is closed. Re-open it before deleting.')
    }
    db.prepare('DELETE FROM imprest_cycles WHERE id=?').run(id)
    audit(db, 'imprest_cycles', id, 'DELETE', old, null)
    return { success: true }
  })

  // ── Cycle receipts (mid-cycle top-ups) ───────────────────────────────────────
  const assertCycleEditable = (db, cycleId) => {
    const cycle = db.prepare('SELECT * FROM imprest_cycles WHERE id=?').get(cycleId)
    if (!cycle) throw new Error('Cycle not found.')
    if (cycle.status === 'closed') {
      throw new Error('This cycle is closed. Re-open it before recording money received.')
    }
    return cycle
  }

  ipcMain.handle('receipts:getByCycle', (event, cycleId) => {
    const db = getDatabase()
    return db.prepare(
      'SELECT * FROM cycle_receipts WHERE cycle_id = ? ORDER BY date, id'
    ).all(cycleId)
  })

  ipcMain.handle('receipts:create', (event, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    assertCycleEditable(db, data.cycle_id)
    const amount = Number(data.amount)
    if (!(amount > 0)) throw new Error('Amount must be greater than zero.')
    const result = db.prepare(`
      INSERT INTO cycle_receipts (cycle_id, date, amount, source)
      VALUES (?,?,?,?)
    `).run(data.cycle_id, data.date, amount, data.source?.trim() || null)
    audit(db, 'cycle_receipts', result.lastInsertRowid, 'INSERT', null, data)
    return { id: result.lastInsertRowid, success: true }
  })

  ipcMain.handle('receipts:update', (event, id, data) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM cycle_receipts WHERE id=?').get(id)
    if (!old) throw new Error('Receipt not found.')
    assertCycleEditable(db, old.cycle_id)
    const amount = Number(data.amount)
    if (!(amount > 0)) throw new Error('Amount must be greater than zero.')
    db.prepare(
      'UPDATE cycle_receipts SET date=?, amount=?, source=? WHERE id=?'
    ).run(data.date, amount, data.source?.trim() || null, id)
    audit(db, 'cycle_receipts', id, 'UPDATE', old, data)
    return { success: true }
  })

  ipcMain.handle('receipts:delete', (event, id) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM cycle_receipts WHERE id=?').get(id)
    if (!old) throw new Error('Receipt not found.')
    assertCycleEditable(db, old.cycle_id)
    db.prepare('DELETE FROM cycle_receipts WHERE id=?').run(id)
    audit(db, 'cycle_receipts', id, 'DELETE', old, null)
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

module.exports = { registerTermsHandlers }
