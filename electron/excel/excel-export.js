const ExcelJS = require('exceljs')

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getDate()}.${dt.getMonth() + 1}.${String(dt.getFullYear()).slice(2)}`
}

function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function periodLabel(cycle) {
  if (cycle.period_type === 'month') {
    const months = ['','January','February','March','April','May','June','July','August','September','October','November','December']
    return `${months[cycle.term_number] || cycle.term_number} ${cycle.year}`
  }
  if (cycle.period_type === 'quarter') return `Q${cycle.term_number} ${cycle.year}`
  if (cycle.period_type === 'custom') return cycle.custom_name || `Period ${cycle.term_number} ${cycle.year}`
  return `Term ${cycle.term_number}, ${cycle.year}`
}

// ─── Ledger workbook ────────────────────────────────────────────────────────
async function buildLedgerWorkbook(data, school, options = {}) {
  const { cycle, entries, signatories } = data
  const orgName = (school?.name || 'Organization') + (school?.location ? ' - ' + school.location : '')
  const includeBalance = options.includeBalance !== false
  // Total columns count and the merge end-letter for full-width rows
  const lastCol = includeBalance ? 6 : 5
  const lastColLetter = includeBalance ? 'F' : 'E'

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'
  wb.created = new Date()

  const ws = wb.addWorksheet(`Ledger ${cycle.cycle_number}`, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 16 },
  })

  // Column widths matching the original Excel
  const cols = [
    { width: 5 },   // NO
    { width: 10 },  // DATE
    { width: 26 },  // NAME
    { width: 32 },  // PURPOSE
    { width: 14 },  // AMOUNT
  ]
  if (includeBalance) cols.push({ width: 14 })  // BALANCE
  ws.columns = cols

  let row = 1

  // Title rows
  ws.mergeCells(`A${row}:${lastColLetter}${row}`)
  const titleCell = ws.getCell(`A${row}`)
  titleCell.value = orgName.toUpperCase()
  titleCell.font = { bold: true, size: 12 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(row).height = 22
  row++

  ws.mergeCells(`A${row}:${lastColLetter}${row}`)
  const subTitle = ws.getCell(`A${row}`)
  subTitle.value = `${ordinal(cycle.cycle_number).toUpperCase()} IMPREST ACCOUNTABILITY FOR ${periodLabel(cycle).toUpperCase()}`
  subTitle.font = { bold: true, size: 11 }
  subTitle.alignment = { horizontal: 'center' }
  ws.getRow(row).height = 20
  row++

  const totalAvailable = cycle.opening_balance + cycle.amount_received
  const totalSpent = entries.reduce((s, e) => s + e.amount, 0)
  const totalBroughtBack = entries.reduce((s, e) => s + Number(e.balance_back || 0), 0)
  const netSpent = totalSpent - totalBroughtBack
  const closing = totalAvailable - netSpent
  const broughtBackEntries = entries.filter(e => Number(e.balance_back || 0) > 0)

  ws.mergeCells(`A${row}:${lastColLetter}${row}`)
  const summary = ws.getCell(`A${row}`)
  summary.value = `BFWD: ${fmt(cycle.opening_balance)}    AMOUNT RECEIVED: ${fmt(cycle.amount_received)}    AMOUNT SPENT: ${fmt(totalSpent)}/=${totalBroughtBack > 0 ? `    BROUGHT BACK: ${fmt(totalBroughtBack)}/=` : ''}    BAL: ${fmt(closing)}/=`
  summary.font = { size: 10 }
  summary.alignment = { horizontal: 'center' }
  row += 2

  // Header row
  const headers = ['NO', 'DATE', 'NAME', 'PURPOSE', 'AMOUNT']
  if (includeBalance) headers.push('BALANCE')
  const headerRow = ws.getRow(row)
  headers.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = label
    cell.font = { bold: true, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    cell.border = thinBorderAll()
  })
  headerRow.height = 18
  row++

  // Opening rows
  const openingTpl = [
    ['', 'BAL B/FWD', '', '', cycle.opening_balance],
    ['', 'RECEIVED', '', '', cycle.amount_received],
    ['', 'TOTAL', '', '', totalAvailable],
  ]
  openingTpl.forEach((data, idx) => {
    const r = ws.getRow(row)
    const cells = includeBalance ? [...data, ''] : data
    cells.forEach((v, i) => {
      const c = r.getCell(i + 1)
      c.value = v === '' ? null : v
      c.border = thinBorderAll()
      if (i === 1) c.alignment = { horizontal: 'center' }
      if (i === 4 && typeof v === 'number') c.numFmt = '#,##0'
      c.font = { size: 10, bold: idx === 2 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
    })
    row++
  })

  // Entry rows
  let runBal = totalAvailable
  entries.forEach((e, idx) => {
    runBal -= e.amount
    const r = ws.getRow(row)
    r.getCell(1).value = idx + 1
    r.getCell(2).value = formatDate(e.date)
    r.getCell(3).value = upper(e.payee)
    r.getCell(4).value = upper(e.purpose)
    r.getCell(5).value = e.amount
    if (includeBalance) r.getCell(6).value = runBal
    for (let i = 1; i <= lastCol; i++) {
      const c = r.getCell(i)
      c.border = thinBorderAll()
      c.font = { size: 10 }
      if (i === 1 || i === 2) c.alignment = { horizontal: 'center' }
      if (i === 5 || i === 6) c.numFmt = '#,##0'
    }
    row++
  })

  // Total row
  const totalRow = ws.getRow(row)
  ws.mergeCells(`A${row}:D${row}`)
  totalRow.getCell(1).value = 'TOTAL AMOUNT SPENT'
  totalRow.getCell(1).font = { bold: true, size: 10 }
  totalRow.getCell(1).alignment = { horizontal: 'right' }
  totalRow.getCell(5).value = totalSpent
  totalRow.getCell(5).numFmt = '#,##0'
  totalRow.getCell(5).font = { bold: true, size: 10 }
  if (includeBalance) {
    totalRow.getCell(6).value = totalAvailable - totalSpent
    totalRow.getCell(6).numFmt = '#,##0'
    totalRow.getCell(6).font = { bold: true, size: 10 }
  }
  for (let i = 1; i <= lastCol; i++) {
    totalRow.getCell(i).border = { ...thinBorderAll(), top: { style: 'medium' } }
    totalRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
  }
  row++

  // Balances brought back section (only if any voucher returned money)
  if (broughtBackEntries.length > 0) {
    // Section header
    ws.mergeCells(`A${row}:${lastColLetter}${row}`)
    const bbHeader = ws.getCell(`A${row}`)
    bbHeader.value = 'BALANCES BROUGHT BACK'
    bbHeader.font = { bold: true, size: 9 }
    bbHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    bbHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F5' } }
    bbHeader.border = thinBorderAll()
    row++

    // Each voucher with balance_back > 0
    broughtBackEntries.forEach(e => {
      const r = ws.getRow(row)
      r.getCell(1).value = e.voucher_number ?? ''
      r.getCell(2).value = formatDate(e.date)
      r.getCell(3).value = upper(e.payee)
      r.getCell(4).value = 'UNSPENT — RETURNED'
      r.getCell(5).value = e.balance_back
      r.getCell(5).numFmt = '#,##0'
      for (let i = 1; i <= lastCol; i++) {
        const c = r.getCell(i)
        c.border = thinBorderAll()
        c.font = { size: 10, italic: i === 4 }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFCFD' } }
        if (i === 1 || i === 2) c.alignment = { horizontal: 'center' }
      }
      row++
    })

    // Total brought back
    const tbbRow = ws.getRow(row)
    ws.mergeCells(`A${row}:D${row}`)
    tbbRow.getCell(1).value = 'TOTAL BROUGHT BACK'
    tbbRow.getCell(1).font = { bold: true, size: 10 }
    tbbRow.getCell(1).alignment = { horizontal: 'right' }
    tbbRow.getCell(5).value = totalBroughtBack
    tbbRow.getCell(5).numFmt = '#,##0'
    tbbRow.getCell(5).font = { bold: true, size: 10 }
    for (let i = 1; i <= lastCol; i++) {
      tbbRow.getCell(i).border = thinBorderAll()
      tbbRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F5' } }
    }
    row++

    // Net spent
    const netRow = ws.getRow(row)
    ws.mergeCells(`A${row}:D${row}`)
    netRow.getCell(1).value = 'NET SPENT'
    netRow.getCell(1).font = { bold: true, size: 10 }
    netRow.getCell(1).alignment = { horizontal: 'right' }
    netRow.getCell(5).value = netSpent
    netRow.getCell(5).numFmt = '#,##0'
    netRow.getCell(5).font = { bold: true, size: 10 }
    if (includeBalance) {
      netRow.getCell(6).value = closing
      netRow.getCell(6).numFmt = '#,##0'
      netRow.getCell(6).font = { bold: true, size: 10 }
    }
    for (let i = 1; i <= lastCol; i++) {
      netRow.getCell(i).border = { ...thinBorderAll(), top: { style: 'medium' } }
      netRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
    }
    row++
  }

  row += 1

  // Accountability block
  ws.mergeCells(`A${row}:${lastColLetter}${row}`)
  ws.getCell(`A${row}`).value = 'ACCOUNTABILITY'
  ws.getCell(`A${row}`).font = { bold: true, size: 10 }
  row++

  const accLines = [
    ['Total Received:', totalAvailable],
    ['Total Amount Spent:', totalSpent],
    ...(totalBroughtBack > 0 ? [
      ['Less: Balances Brought Back:', -totalBroughtBack],
      ['Net Spent:', netSpent],
    ] : []),
    ['Balance Carried Forward:', closing],
  ]
  accLines.forEach(([label, val]) => {
    ws.mergeCells(`A${row}:D${row}`)
    ws.getCell(`A${row}`).value = label
    ws.getCell(`A${row}`).font = { size: 10 }
    ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
    if (includeBalance) {
      ws.mergeCells(`E${row}:F${row}`)
    }
    const valCell = ws.getCell(`E${row}`)
    valCell.value = val
    valCell.numFmt = '#,##0" /="'
    valCell.font = { bold: true, size: 10 }
    valCell.alignment = { horizontal: 'right' }
    row++
  })

  row += 2

  // Signature block
  if (signatories && signatories.length > 0) {
    const sigRow = ws.getRow(row + 2)
    const titleRow = ws.getRow(row + 3)
    signatories.forEach((sig, i) => {
      const col = Math.floor((lastCol / signatories.length) * i) + 1
      sigRow.getCell(col).value = upper(sig.name)
      sigRow.getCell(col).font = { bold: true, size: 9 }
      sigRow.getCell(col).alignment = { horizontal: 'center' }
      sigRow.getCell(col).border = { top: { style: 'thin' } }
      titleRow.getCell(col).value = upper(sig.title)
      titleRow.getCell(col).font = { size: 9 }
      titleRow.getCell(col).alignment = { horizontal: 'center' }
    })
  }

  return wb
}

// ─── Abstract workbook ──────────────────────────────────────────────────────
async function buildAbstractWorkbook(data, school) {
  const { cycle, categories, rows, categoryTotals } = data
  const orgName = (school?.name || 'Organization') + (school?.location ? ' - ' + school.location : '')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'
  wb.created = new Date()

  const ws = wb.addWorksheet(`Abstract ${cycle.cycle_number}`, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 14 },
  })

  // Column widths: VR + N category cols + TOTAL
  const cols = [{ width: 6 }]
  categories.forEach(() => cols.push({ width: 11 }))
  cols.push({ width: 13 })
  ws.columns = cols
  const totalCols = categories.length + 2
  const lastColLetter = colLetter(totalCols)

  let row = 1

  // Title
  ws.mergeCells(`A${row}:${lastColLetter}${row}`)
  const t = ws.getCell(`A${row}`)
  t.value = orgName.toUpperCase()
  t.font = { bold: true, size: 11 }
  t.alignment = { horizontal: 'center' }
  ws.getRow(row).height = 20
  row++

  ws.mergeCells(`A${row}:${lastColLetter}${row}`)
  const sub = ws.getCell(`A${row}`)
  sub.value = `IMPREST ACCOUNTABILITY ABSTRACT FOR ${periodLabel(cycle).toUpperCase()} — CYCLE ${cycle.cycle_number}`
  sub.font = { bold: true, size: 10 }
  sub.alignment = { horizontal: 'center' }
  row++

  const totalAvailable = cycle.opening_balance + cycle.amount_received
  const grandTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0)
  const closing = totalAvailable - grandTotal

  ws.mergeCells(`A${row}:${lastColLetter}${row}`)
  ws.getCell(`A${row}`).value = `AMOUNT RECEIVED: ${fmt(cycle.amount_received)}    BALANCE B/F: ${fmt(cycle.opening_balance)}    AMOUNT SPENT: ${fmt(grandTotal)}    BALANCE: ${fmt(closing)}`
  ws.getCell(`A${row}`).font = { size: 9 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Header row
  const headerRow = ws.getRow(row)
  headerRow.getCell(1).value = 'VR\nNO.'
  headerRow.getCell(1).alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }
  categories.forEach((cat, i) => {
    const c = headerRow.getCell(i + 2)
    c.value = upper(cat.name)
    c.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }
  })
  headerRow.getCell(totalCols).value = 'TOTAL'
  headerRow.getCell(totalCols).alignment = { horizontal: 'center', vertical: 'middle' }
  for (let i = 1; i <= totalCols; i++) {
    const c = headerRow.getCell(i)
    c.font = { bold: true, size: 9 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    c.border = thinBorderAll()
  }
  headerRow.height = 32
  row++

  // Data rows
  rows.forEach(rowData => {
    const r = ws.getRow(row)
    r.getCell(1).value = rowData.voucher_number
    r.getCell(1).alignment = { horizontal: 'center' }
    let rowSum = 0
    categories.forEach((cat, i) => {
      const amt = rowData.splits[cat.id] || 0
      rowSum += amt
      const c = r.getCell(i + 2)
      if (amt > 0) {
        c.value = amt
        c.numFmt = '#,##0'
      }
      c.alignment = { horizontal: 'right' }
    })
    const totalCell = r.getCell(totalCols)
    totalCell.value = rowSum
    totalCell.numFmt = '#,##0'
    totalCell.font = { bold: true, size: 9 }
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
    for (let i = 1; i <= totalCols; i++) {
      r.getCell(i).border = thinBorderAll()
      if (!r.getCell(i).font) r.getCell(i).font = { size: 9 }
    }
    row++
  })

  // Totals row
  const totalsRow = ws.getRow(row)
  totalsRow.getCell(1).value = 'tt'
  totalsRow.getCell(1).alignment = { horizontal: 'center' }
  categories.forEach((cat, i) => {
    const v = categoryTotals[cat.id] || 0
    const c = totalsRow.getCell(i + 2)
    if (v > 0) {
      c.value = v
      c.numFmt = '#,##0'
    }
    c.alignment = { horizontal: 'right' }
  })
  totalsRow.getCell(totalCols).value = grandTotal
  totalsRow.getCell(totalCols).numFmt = '#,##0'
  for (let i = 1; i <= totalCols; i++) {
    const c = totalsRow.getCell(i)
    c.font = { bold: true, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
    c.border = { ...thinBorderAll(), top: { style: 'medium' } }
  }
  return wb
}

// ─── Combined workbook (Ledger + Abstract in one file) ──────────────────────
async function buildCombinedWorkbook(ledgerData, abstractData, school, options = {}) {
  const ledgerWb = await buildLedgerWorkbook(ledgerData, school, options)
  const absWb = await buildAbstractWorkbook(abstractData, school, options)

  // Copy abstract sheet into ledger workbook
  const absSheet = absWb.worksheets[0]
  const newSheet = ledgerWb.addWorksheet(absSheet.name, {
    pageSetup: { ...absSheet.pageSetup },
    properties: { ...absSheet.properties },
  })
  newSheet.columns = absSheet.columns.map(c => ({ width: c.width }))
  absSheet.eachRow((srcRow, rowNum) => {
    const destRow = newSheet.getRow(rowNum)
    destRow.height = srcRow.height
    srcRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const dest = destRow.getCell(colNum)
      dest.value = cell.value
      if (cell.style) dest.style = JSON.parse(JSON.stringify(cell.style))
    })
  })
  // Re-apply merges
  Object.keys(absSheet._merges || {}).forEach(addr => {
    try { newSheet.mergeCells(addr) } catch (_) {}
  })

  return ledgerWb
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function thinBorderAll() {
  return {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  }
}

function fmt(n) {
  if (n === null || n === undefined) return ''
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function colLetter(n) {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function upper(s) {
  return s == null ? '' : String(s).toUpperCase()
}

// ─── Consolidated Abstract workbook (categories × cycles) ────────────────────
async function buildConsolidatedAbstractWorkbook(data, school) {
  const { cycles, categories, matrix, category_totals, cycle_totals, grand_total, scope_label } = data
  const orgName = upper((school?.name || 'Organization') + (school?.location ? ' - ' + school.location : ''))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'
  wb.created = new Date()

  const ws = wb.addWorksheet('Consolidated Abstract', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  const cols = [{ width: 22 }]
  cycles.forEach(() => cols.push({ width: 14 }))
  cols.push({ width: 16 })
  ws.columns = cols
  const totalCols = 1 + cycles.length + 1
  const lastColL = colLetter(totalCols)

  let row = 1
  ws.mergeCells(`A${row}:${lastColL}${row}`)
  ws.getCell(`A${row}`).value = orgName
  ws.getCell(`A${row}`).font = { bold: true, size: 11 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  ws.getRow(row).height = 20
  row++

  ws.mergeCells(`A${row}:${lastColL}${row}`)
  ws.getCell(`A${row}`).value = 'CONSOLIDATED EXPENDITURE ABSTRACT'
  ws.getCell(`A${row}`).font = { bold: true, size: 10 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  if (scope_label) {
    ws.mergeCells(`A${row}:${lastColL}${row}`)
    ws.getCell(`A${row}`).value = `Scope: ${scope_label}`
    ws.getCell(`A${row}`).font = { size: 9 }
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
    row++
  }
  row++

  // Header row
  const hdr = ws.getRow(row)
  hdr.getCell(1).value = 'CATEGORY'
  cycles.forEach((cyc, i) => {
    hdr.getCell(i + 2).value = `${cyc.year}/T${cyc.term_number} C${cyc.cycle_number}`
  })
  hdr.getCell(totalCols).value = 'TOTAL'
  for (let i = 1; i <= totalCols; i++) {
    const c = hdr.getCell(i)
    c.font = { bold: true, size: 9 }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    c.border = thinBorderAll()
  }
  hdr.height = 26
  row++

  // Data rows
  categories.forEach(cat => {
    const r = ws.getRow(row)
    r.getCell(1).value = upper(cat.name)
    r.getCell(1).font = { bold: true, size: 9 }
    cycles.forEach((cyc, i) => {
      const v = matrix[cat.id]?.[cyc.id] || 0
      const c = r.getCell(i + 2)
      if (v > 0) { c.value = v; c.numFmt = '#,##0' }
      c.alignment = { horizontal: 'right' }
    })
    const tCell = r.getCell(totalCols)
    tCell.value = category_totals[cat.id] || 0
    tCell.numFmt = '#,##0'
    tCell.font = { bold: true, size: 9 }
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
    for (let i = 1; i <= totalCols; i++) {
      r.getCell(i).border = thinBorderAll()
      if (!r.getCell(i).font) r.getCell(i).font = { size: 9 }
    }
    row++
  })

  // Totals row
  const tot = ws.getRow(row)
  tot.getCell(1).value = 'TOTALS'
  cycles.forEach((cyc, i) => {
    const c = tot.getCell(i + 2)
    c.value = cycle_totals[cyc.id] || 0
    c.numFmt = '#,##0'
  })
  tot.getCell(totalCols).value = grand_total
  tot.getCell(totalCols).numFmt = '#,##0'
  for (let i = 1; i <= totalCols; i++) {
    const c = tot.getCell(i)
    c.font = { bold: true, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
    c.border = { ...thinBorderAll(), top: { style: 'medium' } }
  }
  return wb
}

// ─── Budget Performance workbook ─────────────────────────────────────────────
async function buildBudgetPerformanceWorkbook(data, school) {
  const { term, rows, totals } = data
  const orgName = upper((school?.name || 'Organization') + (school?.location ? ' - ' + school.location : ''))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'
  const ws = wb.addWorksheet('Budget Performance', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }]

  let row = 1
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = orgName
  ws.getCell(`A${row}`).font = { bold: true, size: 11 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  ws.getRow(row).height = 20
  row++

  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = `BUDGET PERFORMANCE — TERM ${term.term_number}, ${term.year}`
  ws.getCell(`A${row}`).font = { bold: true, size: 10 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Headers
  const hdr = ws.getRow(row)
  ;['CATEGORY', 'ALLOCATED', 'SPENT', 'REMAINING', 'UTIL %'].forEach((label, i) => {
    const c = hdr.getCell(i + 1)
    c.value = label
    c.font = { bold: true, size: 9 }
    c.alignment = { horizontal: 'center' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    c.border = thinBorderAll()
  })
  row++

  // Data rows
  rows.forEach(r => {
    const tr = ws.getRow(row)
    tr.getCell(1).value = upper(r.name)
    tr.getCell(2).value = r.allocated
    tr.getCell(3).value = r.spent
    tr.getCell(4).value = r.remaining
    tr.getCell(5).value = r.util_pct != null ? r.util_pct / 100 : null
    tr.getCell(5).numFmt = '0.0%'

    for (let i = 1; i <= 5; i++) {
      const c = tr.getCell(i)
      c.border = thinBorderAll()
      c.font = { size: 9 }
      if (i >= 2 && i <= 4) c.numFmt = '#,##0'
      if (i === 4 && r.remaining < 0) c.font = { size: 9, color: { argb: 'FFDC2626' }, bold: true }
    }
    row++
  })

  // Totals row
  const t = ws.getRow(row)
  t.getCell(1).value = 'TOTAL'
  t.getCell(2).value = totals.allocated
  t.getCell(3).value = totals.spent
  t.getCell(4).value = totals.remaining
  t.getCell(5).value = totals.util_pct != null ? totals.util_pct / 100 : null
  t.getCell(5).numFmt = '0.0%'
  for (let i = 1; i <= 5; i++) {
    const c = t.getCell(i)
    c.font = { bold: true, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
    c.border = { ...thinBorderAll(), top: { style: 'medium' } }
    if (i >= 2 && i <= 4) c.numFmt = '#,##0'
  }
  return wb
}

// ─── Trends workbook ────────────────────────────────────────────────────────
async function buildTrendsWorkbook(data, school) {
  const { bucket, labels, series, scope_label } = data
  const orgName = upper((school?.name || 'Organization') + (school?.location ? ' - ' + school.location : ''))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'
  const ws = wb.addWorksheet('Trends', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  const totalCols = 1 + labels.length + 1
  const lastColL = colLetter(totalCols)
  const cols = [{ width: 24 }]
  labels.forEach(() => cols.push({ width: 13 }))
  cols.push({ width: 14 })
  ws.columns = cols

  let row = 1
  ws.mergeCells(`A${row}:${lastColL}${row}`)
  ws.getCell(`A${row}`).value = orgName
  ws.getCell(`A${row}`).font = { bold: true, size: 11 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++
  ws.mergeCells(`A${row}:${lastColL}${row}`)
  ws.getCell(`A${row}`).value = `CATEGORY TRENDS — BY ${String(bucket).toUpperCase()}`
  ws.getCell(`A${row}`).font = { bold: true, size: 10 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++
  if (scope_label) {
    ws.mergeCells(`A${row}:${lastColL}${row}`)
    ws.getCell(`A${row}`).value = `Scope: ${scope_label}`
    ws.getCell(`A${row}`).font = { size: 9 }
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
    row++
  }
  row++

  const hdr = ws.getRow(row)
  hdr.getCell(1).value = 'CATEGORY'
  labels.forEach((l, i) => { hdr.getCell(i + 2).value = String(l).toUpperCase() })
  hdr.getCell(totalCols).value = 'TOTAL'
  for (let i = 1; i <= totalCols; i++) {
    const c = hdr.getCell(i)
    c.font = { bold: true, size: 9 }
    c.alignment = { horizontal: 'center' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    c.border = thinBorderAll()
  }
  row++

  series.forEach(s => {
    const tr = ws.getRow(row)
    tr.getCell(1).value = upper(s.name)
    tr.getCell(1).font = { bold: true, size: 9 }
    let total = 0
    labels.forEach((l, i) => {
      const pt = s.points.find(p => p.x === l)
      const v = pt?.y || 0
      const c = tr.getCell(i + 2)
      if (v > 0) { c.value = v; c.numFmt = '#,##0' }
      c.alignment = { horizontal: 'right' }
      total += v
    })
    const tCell = tr.getCell(totalCols)
    tCell.value = total
    tCell.numFmt = '#,##0'
    tCell.font = { bold: true, size: 9 }
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
    for (let i = 1; i <= totalCols; i++) {
      tr.getCell(i).border = thinBorderAll()
      if (!tr.getCell(i).font) tr.getCell(i).font = { size: 9 }
    }
    row++
  })

  return wb
}

// ─── Financial Summary workbook ──────────────────────────────────────────────
async function buildFinancialSummaryWorkbook(data, school) {
  const { metrics, topCategories, budgetSummary } = data
  const orgName = upper((school?.name || 'Organization') + (school?.location ? ' - ' + school.location : ''))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'
  const ws = wb.addWorksheet('Financial Summary', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }]

  let row = 1
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = orgName
  ws.getCell(`A${row}`).font = { bold: true, size: 11 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'FINANCIAL SUMMARY'
  ws.getCell(`A${row}`).font = { bold: true, size: 10 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++
  if (metrics?.scope_label) {
    ws.mergeCells(`A${row}:E${row}`)
    ws.getCell(`A${row}`).value = `Scope: ${metrics.scope_label}`
    ws.getCell(`A${row}`).font = { size: 9 }
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
    row++
  }
  row++

  // Headline metrics
  const headline = [
    ['Total Budget', metrics?.total_budget || 0],
    ['Total Spent (Net)', metrics?.net_spent || 0],
    ['Remaining', metrics?.remaining_budget || 0],
    ['Utilization', metrics?.utilization_pct != null ? metrics.utilization_pct / 100 : null],
    ['Vouchers Recorded', metrics?.vouchers_count || 0],
    ['Active Cycles', metrics?.active_cycles_count || 0],
  ]
  headline.forEach(([label, val], i) => {
    const r = ws.getRow(row)
    r.getCell(1).value = label
    r.getCell(2).value = val
    if (label === 'Utilization') r.getCell(2).numFmt = '0.0%'
    else if (typeof val === 'number' && label !== 'Vouchers Recorded' && label !== 'Active Cycles') r.getCell(2).numFmt = '#,##0'
    r.getCell(1).font = { bold: true, size: 9 }
    r.getCell(2).font = { size: 9 }
    r.getCell(1).border = thinBorderAll()
    r.getCell(2).border = thinBorderAll()
    row++
  })
  row++

  // Top categories
  ws.mergeCells(`A${row}:C${row}`)
  ws.getCell(`A${row}`).value = 'TOP EXPENDITURE CATEGORIES'
  ws.getCell(`A${row}`).font = { bold: true, size: 10 }
  ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
  row++

  ;['CATEGORY', 'SPENT', '% OF TOTAL'].forEach((l, i) => {
    const c = ws.getCell(row, i + 1)
    c.value = l
    c.font = { bold: true, size: 9 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
    c.border = thinBorderAll()
    c.alignment = { horizontal: 'center' }
  })
  row++

  ;(topCategories || []).slice(0, 5).forEach(c => {
    const r = ws.getRow(row)
    r.getCell(1).value = upper(c.name)
    r.getCell(2).value = c.spent
    r.getCell(2).numFmt = '#,##0'
    r.getCell(3).value = c.pct_of_total / 100
    r.getCell(3).numFmt = '0.0%'
    for (let i = 1; i <= 3; i++) {
      r.getCell(i).border = thinBorderAll()
      r.getCell(i).font = { size: 9 }
    }
    row++
  })

  if (budgetSummary?.rows?.length > 0) {
    row++
    ws.mergeCells(`A${row}:E${row}`)
    ws.getCell(`A${row}`).value = 'BUDGET PERFORMANCE'
    ws.getCell(`A${row}`).font = { bold: true, size: 10 }
    ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    row++

    ;['CATEGORY', 'ALLOCATED', 'SPENT', 'REMAINING', 'UTIL %'].forEach((l, i) => {
      const c = ws.getCell(row, i + 1)
      c.value = l
      c.font = { bold: true, size: 9 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
      c.border = thinBorderAll()
      c.alignment = { horizontal: 'center' }
    })
    row++

    budgetSummary.rows.filter(r => r.allocated > 0).forEach(br => {
      const r = ws.getRow(row)
      r.getCell(1).value = upper(br.name)
      r.getCell(2).value = br.allocated
      r.getCell(3).value = br.spent
      r.getCell(4).value = br.remaining
      r.getCell(5).value = br.util_pct != null ? br.util_pct / 100 : null
      r.getCell(5).numFmt = '0.0%'
      ;[2, 3, 4].forEach(i => r.getCell(i).numFmt = '#,##0')
      for (let i = 1; i <= 5; i++) {
        r.getCell(i).border = thinBorderAll()
        r.getCell(i).font = { size: 9 }
      }
      if (br.remaining < 0) {
        r.getCell(4).font = { size: 9, color: { argb: 'FFDC2626' }, bold: true }
      }
      row++
    })
  }

  return wb
}

// ─── Full Workbook: all sheets in one file ──────────────────────────────────
async function buildFullWorkbook(all, school) {
  // all = { ledger, abstract, consolidated, budget, trends, summary }
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Imprest FMS'

  // Helper to merge a workbook's sheets into wb
  async function appendSheets(srcWb) {
    for (const srcSheet of srcWb.worksheets) {
      const dest = wb.addWorksheet(srcSheet.name, {
        pageSetup: { ...srcSheet.pageSetup },
        properties: { ...srcSheet.properties },
      })
      dest.columns = srcSheet.columns.map(c => ({ width: c.width }))
      srcSheet.eachRow({ includeEmpty: true }, (srcRow, rowNum) => {
        const destRow = dest.getRow(rowNum)
        destRow.height = srcRow.height
        srcRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          const d = destRow.getCell(colNum)
          d.value = cell.value
          if (cell.style) d.style = JSON.parse(JSON.stringify(cell.style))
        })
      })
      Object.keys(srcSheet._merges || {}).forEach(addr => {
        try { dest.mergeCells(addr) } catch (_) {}
      })
    }
  }

  if (all.ledger) await appendSheets(await buildLedgerWorkbook(all.ledger.data, school, all.ledger.options))
  if (all.abstract) await appendSheets(await buildAbstractWorkbook(all.abstract.data, school, all.abstract.options))
  if (all.consolidated) await appendSheets(await buildConsolidatedAbstractWorkbook(all.consolidated.data, school))
  if (all.budget) await appendSheets(await buildBudgetPerformanceWorkbook(all.budget.data, school))
  if (all.trends) await appendSheets(await buildTrendsWorkbook(all.trends.data, school))
  if (all.summary) await appendSheets(await buildFinancialSummaryWorkbook(all.summary.data, school))

  return wb
}

module.exports = {
  buildLedgerWorkbook,
  buildAbstractWorkbook,
  buildCombinedWorkbook,
  buildConsolidatedAbstractWorkbook,
  buildBudgetPerformanceWorkbook,
  buildTrendsWorkbook,
  buildFinancialSummaryWorkbook,
  buildFullWorkbook,
}
