const bcrypt = require('bcryptjs')
const { getDatabase } = require('../db/connection')
const { currentSession } = require('../lib/session-context')

// ─── Session helpers (work for both desktop & per-request HTTP sessions) ─────
function getCurrentUser() {
  const user = currentSession().user
  if (!user) return null
  const { password_hash, ...rest } = user
  return rest
}

function getCurrentUserId() {
  return currentSession().user?.id ?? null
}

function requireAuth() {
  if (!currentSession().user) {
    throw new Error('Not authenticated. Please log in.')
  }
}

function requireRole(...allowedRoles) {
  requireAuth()
  const role = currentSession().user.role
  if (!allowedRoles.includes(role)) {
    throw new Error(`Permission denied. This action requires: ${allowedRoles.join(', ')}.`)
  }
}

function publicUser(user) {
  if (!user) return null
  const { password_hash, ...rest } = user
  return rest
}

// ─── IPC registration ─────────────────────────────────────────────────────────
function registerAuthHandlers(ipcMain) {
  ipcMain.handle('auth:login', async (event, username, password) => {
    if (!username?.trim() || !password) {
      throw new Error('Username and password are required.')
    }
    const db = getDatabase()
    const user = db.prepare(`
      SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1
    `).get(username.trim())

    if (!user) throw new Error('Invalid username or password.')

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) throw new Error('Invalid username or password.')

    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
    currentSession().user = user

    return { success: true, user: publicUser(user) }
  })

  ipcMain.handle('auth:logout', () => {
    currentSession().user = null
    return { success: true }
  })

  ipcMain.handle('auth:currentUser', () => {
    return publicUser(currentSession().user)
  })

  ipcMain.handle('auth:changePassword', async (event, oldPassword, newPassword) => {
    requireAuth()
    if (!newPassword || newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters.')
    }
    const db = getDatabase()
    const sess = currentSession()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(sess.user.id)
    const valid = await bcrypt.compare(oldPassword, user.password_hash)
    if (!valid) throw new Error('Current password is incorrect.')

    const newHash = await bcrypt.hash(newPassword, 10)
    db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?
    `).run(newHash, sess.user.id)

    sess.user.password_hash = newHash
    sess.user.must_change_password = 0
    return { success: true }
  })

  // ── User management (admin only) ──────────────────────────────────────────
  ipcMain.handle('users:list', () => {
    requireRole('admin')
    return getDatabase().prepare(`
      SELECT id, username, full_name, role, is_active, must_change_password,
             created_at, last_login_at
      FROM users
      ORDER BY username COLLATE NOCASE
    `).all()
  })

  ipcMain.handle('users:create', async (event, data) => {
    requireRole('admin')
    if (!data.username?.trim()) throw new Error('Username is required.')
    if (!data.password || data.password.length < 4) throw new Error('Password must be at least 4 characters.')
    if (!['admin','accountant','viewer'].includes(data.role)) throw new Error('Invalid role.')

    const passwordHash = await bcrypt.hash(data.password, 10)
    try {
      const result = getDatabase().prepare(`
        INSERT INTO users (username, password_hash, full_name, role, must_change_password)
        VALUES (?,?,?,?,?)
      `).run(
        data.username.trim(),
        passwordHash,
        data.full_name?.trim() || null,
        data.role,
        data.must_change_password ? 1 : 0,
      )
      return { id: result.lastInsertRowid, success: true }
    } catch (err) {
      if (err.message.includes('UNIQUE')) throw new Error('A user with that username already exists.')
      throw err
    }
  })

  ipcMain.handle('users:update', async (event, id, data) => {
    requireRole('admin')
    const db = getDatabase()
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (!target) throw new Error('User not found.')

    const sess = currentSession()
    if (id === sess.user.id) {
      if (data.role && data.role !== 'admin') {
        throw new Error("You can't change your own role.")
      }
      if (data.is_active === 0) {
        throw new Error("You can't deactivate your own account.")
      }
    }

    db.prepare(`
      UPDATE users SET
        full_name = ?,
        role = ?,
        is_active = ?
      WHERE id = ?
    `).run(
      data.full_name?.trim() || null,
      data.role || target.role,
      data.is_active === undefined ? target.is_active : (data.is_active ? 1 : 0),
      id,
    )
    return { success: true }
  })

  ipcMain.handle('users:resetPassword', async (event, id, newPassword) => {
    requireRole('admin')
    if (!newPassword || newPassword.length < 4) throw new Error('Password must be at least 4 characters.')
    const passwordHash = await bcrypt.hash(newPassword, 10)
    getDatabase().prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?
    `).run(passwordHash, id)
    return { success: true }
  })

  ipcMain.handle('users:delete', (event, id) => {
    requireRole('admin')
    const sess = currentSession()
    if (id === sess.user.id) throw new Error("You can't delete your own account.")
    const db = getDatabase()
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND is_active=1 AND id != ?").get(id).c
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (target?.role === 'admin' && adminCount === 0) {
      throw new Error('Cannot delete the only active admin.')
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    return { success: true }
  })
}

module.exports = {
  registerAuthHandlers,
  getCurrentUser,
  getCurrentUserId,
  requireAuth,
  requireRole,
}
