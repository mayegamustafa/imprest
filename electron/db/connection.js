const path = require('path')
const fs = require('fs')

let db = null

function getDbPath() {
  // Try Electron first (gives us per-user app data dir on each OS)
  try {
    const electron = require('electron')
    if (electron && electron.app && typeof electron.app.getPath === 'function') {
      const userData = electron.app.getPath('userData')
      return path.join(userData, 'imprest.db')
    }
  } catch (err) {
    // Not in Electron context — fall through to standalone path
  }

  // Standalone (web/server) mode
  const dataDir = process.env.IMPREST_DATA_DIR
    || path.join(require('os').homedir(), '.imprest-fms')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  return path.join(dataDir, 'imprest.db')
}

function initDatabase() {
  if (db) return db  // already initialized
  const Database = require('better-sqlite3')
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')

  const dbPath = getDbPath()
  db = new Database(dbPath)

  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')

  db.exec(schema)
  runMigrations(db)

  const { seedDefaults } = require('./seed')
  seedDefaults(db)

  return db
}

function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

function runMigrations(db) {
  const hasColumn = (table, col) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all()
    return cols.some(c => c.name === col)
  }

  if (!hasColumn('school_config', 'organization_type')) {
    db.exec(`ALTER TABLE school_config ADD COLUMN organization_type TEXT NOT NULL DEFAULT 'school'`)
  }
  if (!hasColumn('terms', 'period_type')) {
    db.exec(`ALTER TABLE terms ADD COLUMN period_type TEXT NOT NULL DEFAULT 'term'`)
  }
  if (!hasColumn('terms', 'custom_name')) {
    db.exec(`ALTER TABLE terms ADD COLUMN custom_name TEXT`)
  }
  if (!hasColumn('audit_log', 'user_id')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN user_id INTEGER REFERENCES users(id)`)
  }
  if (!hasColumn('entries', 'balance_back')) {
    db.exec(`ALTER TABLE entries ADD COLUMN balance_back REAL NOT NULL DEFAULT 0`)
  }
}

function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

module.exports = { initDatabase, getDatabase, closeDatabase, getDbPath }
