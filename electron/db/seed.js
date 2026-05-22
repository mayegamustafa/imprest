const bcrypt = require('bcryptjs')

function seedDefaults(db) {
  // Default admin user — credentials can be overridden via env vars so that
  // a fresh deployment on Railway (or any server) creates YOUR account instead
  // of the generic admin/admin default.
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get()
  if (userCount.c === 0) {
    const username = process.env.INITIAL_ADMIN_USERNAME || 'admin'
    const password = process.env.INITIAL_ADMIN_PASSWORD || 'admin'
    const fullName = process.env.INITIAL_ADMIN_NAME     || 'Administrator'
    const passwordHash = bcrypt.hashSync(password, 10)
    // If a real password was supplied via env, don't force a change on first login
    const mustChange = process.env.INITIAL_ADMIN_PASSWORD ? 0 : 1
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, must_change_password)
      VALUES (?,?,?,?,?)
    `).run(username, passwordHash, fullName, 'admin', mustChange)
  }

  const schoolCount = db.prepare('SELECT COUNT(*) as c FROM school_config').get()
  if (schoolCount.c === 0) {
    db.prepare(`
      INSERT INTO school_config (id, name, location, organization_type)
      VALUES (1, 'SIR APOLLO KAGGWA BOARDING PRIMARY SCHOOL', 'OLD KAMPALA', 'school')
    `).run()
  }

  const sigCount = db.prepare('SELECT COUNT(*) as c FROM signatories').get()
  if (sigCount.c === 0) {
    const insertSig = db.prepare('INSERT INTO signatories (name, title, sort_order) VALUES (?, ?, ?)')
    const sigs = [
      ['NYAWERE JANE', 'HEADTEACHER', 0],
      ['NAKANDWE MAJORINE', 'F.A.O', 1],
      ['HINDU NALUYIMA', 'BURSAR', 2],
      ['MAYEGA MUSTAFA', 'ASST. BURSAR', 3],
    ]
    sigs.forEach(([name, title, order]) => insertSig.run(name, title, order))
  }

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get()
  if (catCount.c === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
    const categories = [
      'EMPLOYEE COSTS',
      'FEEDING',
      'VEHICLE OPERATIONS',
      'EXAMS & TESTS',
      'TRANSPORT',
      'REPAIRS',
      'HEALTH',
      'CO-CURRICULAR',
      'UTILITIES',
      'SCHOLASTIC',
      'CLEANING',
      'SECURITY',
      'UNIFORMS',
      'INTERNET & DSTV',
      'TAXES',
    ]
    categories.forEach((name, i) => insertCat.run(name, i))
  }
}

module.exports = { seedDefaults }
