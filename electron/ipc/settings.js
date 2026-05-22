const { getDatabase } = require('../db/connection')
const { requireRole, getCurrentUserId } = require('./auth')

function registerSettingsHandlers(ipcMain) {
  // ── School Config ────────────────────────────────────────────────────────────
  ipcMain.handle('settings:getSchool', () => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM school_config WHERE id = 1').get() || {}
  })

  ipcMain.handle('settings:saveSchool', (event, data) => {
    requireRole('admin')
    const db = getDatabase()
    const orgType = data.organization_type || 'school'
    const existing = db.prepare('SELECT id FROM school_config WHERE id = 1').get()
    if (existing) {
      db.prepare(`
        UPDATE school_config
        SET name=?, location=?, organization_type=?, logo_path=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `).run(data.name, data.location || '', orgType, data.logo_path ?? null)
    } else {
      db.prepare(`
        INSERT INTO school_config (id, name, location, organization_type, logo_path)
        VALUES (1,?,?,?,?)
      `).run(data.name, data.location || '', orgType, data.logo_path ?? null)
    }
    audit(db, 'school_config', 1, 'UPDATE', null, data)
    return { success: true }
  })

  // ── Categories ───────────────────────────────────────────────────────────────
  ipcMain.handle('settings:getCategories', () => {
    return getDatabase().prepare('SELECT * FROM categories ORDER BY sort_order, name').all()
  })

  ipcMain.handle('settings:saveCategory', (event, data) => {
    requireRole('admin')
    const db = getDatabase()
    if (data.id) {
      const old = db.prepare('SELECT * FROM categories WHERE id=?').get(data.id)
      db.prepare('UPDATE categories SET name=?, is_active=? WHERE id=?')
        .run(data.name, data.is_active ?? 1, data.id)
      audit(db, 'categories', data.id, 'UPDATE', old, data)
      return { id: data.id }
    } else {
      const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories').get().m ?? -1
      const result = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?,?)')
        .run(data.name, maxOrder + 1)
      audit(db, 'categories', result.lastInsertRowid, 'INSERT', null, data)
      return { id: result.lastInsertRowid }
    }
  })

  ipcMain.handle('settings:deleteCategory', (event, id) => {
    requireRole('admin')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM categories WHERE id=?').get(id)
    db.prepare('DELETE FROM categories WHERE id=?').run(id)
    audit(db, 'categories', id, 'DELETE', old, null)
    return { success: true }
  })

  ipcMain.handle('settings:reorderCategories', (event, ids) => {
    requireRole('admin')
    const db = getDatabase()
    const update = db.prepare('UPDATE categories SET sort_order=? WHERE id=?')
    const updateMany = db.transaction((list) => {
      list.forEach((id, idx) => update.run(idx, id))
    })
    updateMany(ids)
    return { success: true }
  })

  // ── Signatories ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:getSignatories', () => {
    return getDatabase().prepare('SELECT * FROM signatories ORDER BY sort_order').all()
  })

  ipcMain.handle('settings:saveSignatory', (event, data) => {
    requireRole('admin')
    const db = getDatabase()
    if (data.id) {
      const old = db.prepare('SELECT * FROM signatories WHERE id=?').get(data.id)
      db.prepare('UPDATE signatories SET name=?, title=?, is_active=? WHERE id=?')
        .run(data.name, data.title, data.is_active ?? 1, data.id)
      audit(db, 'signatories', data.id, 'UPDATE', old, data)
      return { id: data.id }
    } else {
      const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM signatories').get().m ?? -1
      const result = db.prepare('INSERT INTO signatories (name, title, sort_order) VALUES (?,?,?)')
        .run(data.name, data.title, maxOrder + 1)
      audit(db, 'signatories', result.lastInsertRowid, 'INSERT', null, data)
      return { id: result.lastInsertRowid }
    }
  })

  ipcMain.handle('settings:deleteSignatory', (event, id) => {
    requireRole('admin')
    const db = getDatabase()
    const old = db.prepare('SELECT * FROM signatories WHERE id=?').get(id)
    db.prepare('DELETE FROM signatories WHERE id=?').run(id)
    audit(db, 'signatories', id, 'DELETE', old, null)
    return { success: true }
  })

  ipcMain.handle('settings:reorderSignatories', (event, ids) => {
    requireRole('admin')
    const db = getDatabase()
    const update = db.prepare('UPDATE signatories SET sort_order=? WHERE id=?')
    const updateMany = db.transaction((list) => {
      list.forEach((id, idx) => update.run(idx, id))
    })
    updateMany(ids)
    return { success: true }
  })

  // ── Audit Log ────────────────────────────────────────────────────────────────
  ipcMain.handle('settings:getAuditLog', (event, opts = {}) => {
    requireRole('admin')
    const limit = Math.min(opts.limit ?? 200, 1000)
    return getDatabase().prepare(`
      SELECT a.id, a.table_name, a.record_id, a.action,
             a.old_values, a.new_values, a.timestamp,
             a.user_id, u.username, u.full_name
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.timestamp DESC, a.id DESC
      LIMIT ?
    `).all(limit)
  })
}

function audit(db, tableName, recordId, action, oldValues, newValues) {
  db.prepare(`
    INSERT INTO audit_log (table_name, record_id, action, user_id, old_values, new_values)
    VALUES (?,?,?,?,?,?)
  `).run(
    tableName,
    recordId,
    action,
    getCurrentUserId(),
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
  )
}

module.exports = { registerSettingsHandlers }
