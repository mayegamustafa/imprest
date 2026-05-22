function formatUGX(n) {
  if (!n && n !== 0) return ''
  return Number(n).toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function upper(s) {
  return s == null ? '' : String(s).toUpperCase()
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getDate()}.${dt.getMonth() + 1}.${String(dt.getFullYear()).slice(2)}`
}

function ordinalName(n) {
  const suffixes = ['th','st','nd','rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

function periodLabel(cycle) {
  const months = ['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  if (cycle.period_type === 'month') return `${months[cycle.term_number] || cycle.term_number} ${cycle.year}`
  if (cycle.period_type === 'quarter') return `Q${cycle.term_number} ${cycle.year}`
  if (cycle.period_type === 'custom') return (cycle.custom_name || `PERIOD ${cycle.term_number}`).toUpperCase() + ` ${cycle.year}`
  return `TERM ${cycle.term_number}, ${cycle.year}`
}

function buildLedgerHTML(data, school, options = {}) {
  const { cycle, entries, signatories } = data
  const schoolName = school?.name || 'SCHOOL'
  const location = school?.location || ''
  // includeBalance: show the running BALANCE column (default true)
  const includeBalance = options.includeBalance !== false

  const totalAvailable = cycle.opening_balance + cycle.amount_received
  const totalSpent = entries.reduce((s, e) => s + e.amount, 0)
  const totalBroughtBack = entries.reduce((s, e) => s + Number(e.balance_back || 0), 0)
  const netSpent = totalSpent - totalBroughtBack
  const closingBalance = totalAvailable - netSpent
  const broughtBackEntries = entries.filter(e => Number(e.balance_back || 0) > 0)

  // Build running balance rows
  let runningBalance = totalAvailable
  const rows = entries.map((e, idx) => {
    runningBalance -= e.amount
    return { ...e, seq: idx + 1, runningBalance }
  })

  const periodLbl = periodLabel(cycle)
  const cycleLabel = `${ordinalName(cycle.cycle_number).toUpperCase()} IMPREST ACCOUNTABILITY FOR ${periodLbl}`

  const signatureBlock = signatories.map(sig => `
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">${esc(upper(sig.name))}</div>
      <div class="sig-title">${esc(upper(sig.title))}</div>
    </div>
  `).join('')

  const entryRows = rows.map(e => `
    <tr>
      <td class="num">${e.seq}</td>
      <td class="center">${formatDate(e.date)}</td>
      <td>${esc(upper(e.payee))}</td>
      <td>${esc(upper(e.purpose))}</td>
      <td class="money">${formatUGX(e.amount)}</td>
      ${includeBalance ? `<td class="money">${formatUGX(e.runningBalance)}</td>` : ''}
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    color: #000;
    background: #fff;
    padding: 16mm 14mm;
  }
  .header { text-align: center; margin-bottom: 10px; }
  .header h1 { font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
  .header h2 { font-size: 10pt; font-weight: bold; margin-top: 3px; }
  .header .summary { font-size: 8.5pt; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #000; padding: 2px 5px; font-size: 8.5pt; vertical-align: middle; }
  th { background: #f0f0f0; font-weight: bold; text-align: center; }
  td.num { text-align: center; width: 28px; }
  td.center { text-align: center; }
  td.money { text-align: right; width: 90px; font-family: 'Courier New', monospace; }
  tr.opening td { background: #fafafa; font-weight: bold; }
  tr.total-row td { border-top: 2px solid #000; font-weight: bold; }
  tr.total-row td.money { font-weight: bold; }
  .accountability { margin-top: 14px; border: 1px solid #000; padding: 8px 12px; }
  .accountability h3 { font-size: 9pt; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; }
  .acc-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 8.5pt; }
  .acc-row span:last-child { font-weight: bold; min-width: 100px; text-align: right; }
  .signatures { margin-top: 24px; display: flex; justify-content: space-between; gap: 12px; }
  .sig-block { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #000; margin-bottom: 4px; margin-top: 20px; }
  .sig-name { font-weight: bold; font-size: 8pt; }
  .sig-title { font-size: 7.5pt; }
  @media print {
    @page { size: A4 portrait; margin: 16mm 14mm; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(schoolName)}${location ? ' - ' + esc(location) : ''}</h1>
    <h2>${cycleLabel}</h2>
    <div class="summary">
      BFWD:&nbsp;${formatUGX(cycle.opening_balance)}&nbsp;&nbsp;&nbsp;
      AMOUNT RECEIVED:&nbsp;${formatUGX(cycle.amount_received)}&nbsp;&nbsp;&nbsp;
      AMOUNT SPENT:&nbsp;${formatUGX(totalSpent)}/=&nbsp;&nbsp;&nbsp;
      BAL:&nbsp;${formatUGX(closingBalance)}/=
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:28px">NO</th>
        <th style="width:66px">DATE</th>
        <th>NAME</th>
        <th>PURPOSE</th>
        <th style="width:90px">AMOUNT</th>
        ${includeBalance ? '<th style="width:95px">BALANCE</th>' : ''}
      </tr>
    </thead>
    <tbody>
      <tr class="opening">
        <td></td><td class="center">BAL B/FWD</td><td></td><td></td>
        <td class="money">${formatUGX(cycle.opening_balance)}</td>
        ${includeBalance ? '<td></td>' : ''}
      </tr>
      <tr class="opening">
        <td></td><td class="center">RECEIVED</td><td></td><td></td>
        <td class="money">${formatUGX(cycle.amount_received)}</td>
        ${includeBalance ? '<td></td>' : ''}
      </tr>
      <tr class="opening">
        <td></td><td class="center">TOTAL</td><td></td><td></td>
        <td class="money">${formatUGX(totalAvailable)}</td>
        ${includeBalance ? '<td></td>' : ''}
      </tr>
      ${entryRows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right; font-weight:bold">TOTAL AMOUNT SPENT</td>
        <td class="money">${formatUGX(totalSpent)}</td>
        ${includeBalance ? `<td class="money">${formatUGX(totalAvailable - totalSpent)}</td>` : ''}
      </tr>
      ${broughtBackEntries.length > 0 ? `
        <tr><td colspan="${includeBalance ? 6 : 5}" style="background:#f0f4f8; padding:4px 8px; font-size:8pt; font-weight:bold; text-transform:uppercase;">Balances Brought Back</td></tr>
        ${broughtBackEntries.map(e => `
          <tr style="background:#fafcfd">
            <td class="num">${rows.find(r => r.id === e.id)?.seq ?? ''}</td>
            <td class="center">${formatDate(e.date)}</td>
            <td>${esc(upper(e.payee))}</td>
            <td style="font-style:italic; color:#555">UNSPENT — RETURNED</td>
            <td class="money" style="color:#1F4F8B">+${formatUGX(e.balance_back)}</td>
            ${includeBalance ? '<td></td>' : ''}
          </tr>
        `).join('')}
        <tr class="total-row" style="background:#e8f0f5">
          <td colspan="4" style="text-align:right; font-weight:bold">TOTAL BROUGHT BACK</td>
          <td class="money">+${formatUGX(totalBroughtBack)}</td>
          ${includeBalance ? '<td></td>' : ''}
        </tr>
        <tr class="total-row" style="background:#f5f5f5; border-top: 2px solid #000">
          <td colspan="4" style="text-align:right; font-weight:bold">NET SPENT</td>
          <td class="money">${formatUGX(netSpent)}</td>
          ${includeBalance ? `<td class="money">${formatUGX(closingBalance)}</td>` : ''}
        </tr>
      ` : ''}
    </tbody>
  </table>

  <div class="accountability">
    <h3>Accountability</h3>
    <div class="acc-row"><span>Total Received:</span><span>${formatUGX(totalAvailable)}/=</span></div>
    <div class="acc-row"><span>Total Amount Spent:</span><span>${formatUGX(totalSpent)}/=</span></div>
    ${totalBroughtBack > 0 ? `
      <div class="acc-row"><span>Less: Balances Brought Back:</span><span>(${formatUGX(totalBroughtBack)})/=</span></div>
      <div class="acc-row" style="border-top: 1px solid #999; padding-top: 3px; margin-top: 3px"><span>Net Spent:</span><span>${formatUGX(netSpent)}/=</span></div>
    ` : ''}
    <div class="acc-row" style="border-top: 1px solid #000; padding-top: 3px; margin-top: 3px"><span>Balance Carried Forward:</span><span>${formatUGX(closingBalance)}/=</span></div>
  </div>

  <div class="signatures">
    ${signatureBlock}
  </div>
</body>
</html>`
}

module.exports = { buildLedgerHTML }
