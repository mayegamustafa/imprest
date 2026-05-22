function formatUGX(n) {
  if (!n && n !== 0) return ''
  const num = Number(n)
  if (num === 0) return '-'
  return num.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function upper(s) {
  return s == null ? '' : String(s).toUpperCase()
}

function periodLabel(cycle) {
  const months = ['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  if (cycle.period_type === 'month') return `${months[cycle.term_number] || cycle.term_number} ${cycle.year}`
  if (cycle.period_type === 'quarter') return `Q${cycle.term_number} ${cycle.year}`
  if (cycle.period_type === 'custom') return (cycle.custom_name || `PERIOD ${cycle.term_number}`).toUpperCase() + ` ${cycle.year}`
  return `TERM ${cycle.term_number}, ${cycle.year}`
}

function buildAbstractHTML(data, school) {
  const { cycle, categories, rows, categoryTotals } = data
  const schoolName = school?.name || 'ORGANIZATION'
  const location = school?.location || ''

  const totalAvailable = cycle.opening_balance + cycle.amount_received
  // Abstract shows NET spent (= sum of category splits), per user spec —
  // balance brought back must NOT be included in "amount spent" here.
  const grandTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0)
  const totalSpent = grandTotal
  const closingBalance = totalAvailable - totalSpent
  const termLabel = periodLabel(cycle)

  const headerCells = categories.map(c =>
    `<th class="cat-header">${esc(upper(c.name))}</th>`
  ).join('')

  const dataRows = rows.map(row => {
    const catCells = categories.map(c =>
      `<td class="money">${formatUGX(row.splits[c.id] || 0)}</td>`
    ).join('')
    return `
      <tr>
        <td class="vr-num">${row.voucher_number}</td>
        ${catCells}
        <td class="money total-col">${formatUGX(row.amount)}</td>
      </tr>`
  }).join('')

  const totalCells = categories.map(c =>
    `<td class="money total-col">${formatUGX(categoryTotals[c.id] || 0)}</td>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 7.5pt;
    color: #000;
    background: #fff;
    padding: 10mm 8mm;
  }
  .header { text-align: center; margin-bottom: 8px; }
  .header h1 { font-size: 9.5pt; font-weight: bold; text-transform: uppercase; }
  .header h2 { font-size: 8.5pt; font-weight: bold; margin-top: 2px; }
  .header .summary { font-size: 7.5pt; margin-top: 3px; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #000;
    padding: 1.5px 2px;
    font-size: 7pt;
    vertical-align: middle;
    overflow: hidden;
  }
  th {
    background: #e8e8e8;
    font-weight: bold;
    text-align: center;
    word-wrap: break-word;
    writing-mode: horizontal-tb;
    font-size: 6.5pt;
    padding: 2px;
  }
  .col-vr { width: 22px; }
  .cat-header { width: auto; }
  .col-total { width: 62px; }
  td.vr-num { text-align: center; }
  td.money { text-align: right; }
  td.total-col { font-weight: bold; background: #f8f8f8; }
  tr.totals-row td {
    border-top: 2px solid #000;
    font-weight: bold;
    background: #efefef;
  }
  tr.totals-row td.money { font-weight: bold; }
  @media print {
    @page { size: A4 landscape; margin: 10mm 8mm; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(schoolName)}${location ? ' - ' + esc(location) : ''}</h1>
    <h2>IMPREST ACCOUNTABILITY ABSTRACT FOR ${termLabel} — CYCLE ${cycle.cycle_number}</h2>
    <div class="summary">
      AMOUNT RECEIVED:&nbsp;${formatUGX(cycle.amount_received)}&nbsp;&nbsp;
      BALANCE B/F:&nbsp;${formatUGX(cycle.opening_balance)}&nbsp;&nbsp;
      AMOUNT SPENT:&nbsp;${formatUGX(totalSpent)}&nbsp;&nbsp;
      BALANCE:&nbsp;${formatUGX(closingBalance)}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-vr">VR<br>NO.</th>
        ${headerCells}
        <th class="col-total">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows}
      <tr class="totals-row">
        <td class="vr-num">tt</td>
        ${totalCells}
        <td class="money total-col">${formatUGX(grandTotal)}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`
}

module.exports = { buildAbstractHTML }
