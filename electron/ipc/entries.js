const { getDatabase } = require('../db/connection')
const { requireRole, getCurrentUserId } = require('./auth')
const ExcelJS = require('exceljs')

// ─── Excel parsing helpers ────────────────────────────────────────────────────
function getCellText(cell) {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (v.result !== undefined) return getCellText({ value: v.result })
    if (v.richText) return v.richText.map(r => r.text || '').join('').trim()
    if (v.text) return String(v.text).trim()
    if (v.error) return ''
  }
  return String(v).trim()
}

function parseExcelDate(val) {
  if (val === null || val === undefined) return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  // Excel serial number (days since 1900-01-00)
  if (typeof val === 'number' && val > 0 && val < 2958466) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  if (typeof val === 'object' && val !== null && val.result !== undefined) {
    return parseExcelDate(val.result)
  }
  const s = String(val).trim()
  // DD/MM/YY or DD/MM/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = '20' + y
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return s.slice(0, 10)
  const dt = new Date(s)
  if (!isNaN(dt)) return dt.toISOString().slice(0, 10)
  return null
}

function parseExcelAmount(val) {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return val
  if (typeof val === 'object' && val !== null && val.result !== undefined) {
    return parseExcelAmount(val.result)
  }
  const n = parseFloat(String(val).replace(/[, ]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseExcelRows(workbook) {
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('No worksheets found in the file.')

  let headerIdx = -1
  let colDate, colPayee, colPurpose, colAmount, colBB

  sheet.eachRow({ includeEmpty: false }, (row, rowIdx) => {
    if (headerIdx !== -1) return
    const cells = []
    row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      cells.push({ idx: colIdx, v: getCellText(cell).toLowerCase() })
    })
    const hasDate   = cells.some(c => c.v === 'date')
    const hasAmount = cells.some(c => ['amount', 'amt'].includes(c.v))
    if (hasDate && hasAmount) {
      headerIdx = rowIdx
      cells.forEach(({ idx, v }) => {
        if (v === 'date') colDate = idx
        if (['payee', 'name', 'received by', 'paid to'].includes(v)) colPayee = idx
        if (['purpose', 'description', 'particulars', 'details', 'narration'].includes(v)) colPurpose = idx
        if (['amount', 'amt'].includes(v)) colAmount = idx
        if (['balance back', 'balance_back', 'returned', 'b/b', 'bal back', 'bal. back'].includes(v)) colBB = idx
      })
    }
  })

  // No header detected — assume A=date, B=payee, C=purpose, D=amount
  if (headerIdx === -1) {
    colDate = 1; colPayee = 2; colPurpose = 3; colAmount = 4
    headerIdx = 0
  }

  const rows = []
  sheet.eachRow({ includeEmpty: false }, (row, rowIdx) => {
    if (rowIdx <= headerIdx) return

    const rawDate    = row.getCell(colDate || 1).value
    const rawPayee   = getCellText(row.getCell(colPayee || 2))
    const rawPurpose = getCellText(row.getCell(colPurpose || 3))
    const rawAmount  = row.getCell(colAmount || 4).value
    const rawBB      = colBB ? row.getCell(colBB).value : null

    if (!rawPayee && !rawDate && !rawAmount) return
    if (['total', 'sub-total', 'grand total', 'subtotal'].includes(rawPayee.toLowerCase())) return

    const date         = parseExcelDate(rawDate)
    const amount       = parseExcelAmount(rawAmount)
    const balance_back = parseExcelAmount(rawBB)

    const errors = []
    if (!date)        errors.push('invalid date')
    if (!rawPayee)    errors.push('missing payee')
    if (!rawPurpose)  errors.push('missing purpose')
    if (!(amount > 0)) errors.push('invalid or zero amount')

    rows.push({
      date: date || '',
      payee: rawPayee,
      purpose: rawPurpose,
      amount,
      balance_back,
      _error: errors.length ? errors.join('; ') : null,
    })
  })

  if (rows.length === 0) {
    throw new Error('No data rows found. Make sure your file has DATE, PAYEE, PURPOSE, AMOUNT columns.')
  }
  return rows
}

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

  ipcMain.handle('entries:parseExcel', async (event, filePath) => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    return parseExcelRows(workbook)
  })

  ipcMain.handle('entries:getImportTemplate', async () => {
    const wb  = await buildTemplateWorkbook()
    const buf = await wb.xlsx.writeBuffer()
    return Buffer.from(buf).toString('base64')
  })

  ipcMain.handle('entries:bulkCreate', (event, { cycle_id, rows, default_category_id }) => {
    requireRole('admin', 'accountant')
    const db = getDatabase()
    assertCycleEditable(db, cycle_id)
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows to import.')
    const maxV = db.prepare('SELECT MAX(voucher_number) as m FROM entries WHERE cycle_id=?').get(cycle_id)
    let nextVoucher = (maxV.m ?? 0) + 1
    const stmtEntry = db.prepare(
      `INSERT INTO entries (cycle_id, voucher_number, date, payee, purpose, amount, balance_back)
       VALUES (?,?,?,?,?,?,?)`
    )
    const stmtSplit = db.prepare(
      'INSERT INTO entry_category_splits (entry_id, category_id, amount) VALUES (?,?,?)'
    )
    let inserted = 0
    const errors = []
    db.transaction(() => {
      rows.forEach((row, i) => {
        try {
          const amount = Number(row.amount)
          const bb     = Number(row.balance_back || 0)
          if (!row.date || !row.payee?.trim() || !row.purpose?.trim() || !(amount > 0)) {
            errors.push({ row: i + 1, error: row._error || 'Missing required fields' })
            return
          }
          const res = stmtEntry.run(cycle_id, nextVoucher, row.date, row.payee.trim(), row.purpose.trim(), amount, bb)
          const entryId = res.lastInsertRowid
          const net = amount - bb
          if (net > 0.005 && default_category_id) stmtSplit.run(entryId, default_category_id, net)
          audit(db, 'entries', entryId, 'INSERT', null, { ...row, cycle_id, voucher_number: nextVoucher })
          nextVoucher++
          inserted++
        } catch (err) {
          errors.push({ row: i + 1, error: err.message })
        }
      })
    })()
    return { inserted, errors }
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

// ─── Import template builder ──────────────────────────────────────────────
async function buildTemplateWorkbook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'
  wb.created = new Date()

  const ws = wb.addWorksheet('Imprest Entries')

  ws.columns = [
    { header: 'DATE',         key: 'date',         width: 14 },
    { header: 'PAYEE',        key: 'payee',        width: 32 },
    { header: 'PURPOSE',      key: 'purpose',      width: 42 },
    { header: 'AMOUNT',       key: 'amount',       width: 18 },
    { header: 'BALANCE BACK', key: 'balance_back', width: 18 },
  ]

  // Style the header row
  const headerRow = ws.getRow(1)
  headerRow.height = 22
  headerRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFADD8E6' } } }
  })

  // Sample rows so users know exactly what format to use
  const samples = [
    ['01/05/2026', 'John Doe',     'Payment for stationery',          150000, 0    ],
    ['03/05/2026', 'ABC Supplies', 'Payment for cleaning materials',    80000, 5000 ],
    ['05/05/2026', 'Jane Smith',   'Payment for transport',             50000, 0    ],
    ['08/05/2026', 'XYZ Store',    'Payment for scholastic materials',  65000, 0    ],
  ]
  samples.forEach((data, i) => {
    const row = ws.addRow(data)
    row.height = 18
    // Number format for amount columns
    row.getCell(4).numFmt = '#,##0'
    row.getCell(5).numFmt = '#,##0'
    // Alternate row shading
    const bg = i % 2 === 0 ? 'FFF0F7FF' : 'FFFFFFFF'
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.alignment = { vertical: 'middle' }
      cell.border    = {
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
      }
    })
  })

  // Notes row
  ws.addRow([])
  const noteRow = ws.addRow([
    'NOTES:',
    'DATE: DD/MM/YYYY or YYYY-MM-DD  |  ' +
    'BALANCE BACK: cash returned to office (leave 0 if none)  |  ' +
    'Do NOT rename or reorder the column headers',
  ])
  noteRow.getCell(1).font = { bold: true, color: { argb: 'FF555555' }, size: 9 }
  noteRow.getCell(2).font = { italic: true, color: { argb: 'FF777777' }, size: 9 }

  // Freeze header row + auto-filter
  ws.views      = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2' }]
  ws.autoFilter = { from: 'A1', to: 'E1' }

  return wb
}

module.exports = { registerEntriesHandlers, parseExcelRows, buildTemplateWorkbook }
