// Budget Performance PDF — table + inline progress bars rendered as CSS.
function fmt(n) {
  if (n === null || n === undefined) return ''
  const num = Number(n)
  return num.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]))
}
function upper(s) { return s == null ? '' : String(s).toUpperCase() }

function statusColor(util) {
  if (util == null) return '#9CA3AF'
  if (util >= 100) return '#DC2626'
  if (util >= 90) return '#EA580C'
  if (util >= 70) return '#D97706'
  return '#059669'
}

function buildBudgetHTML(data, school) {
  const { term, rows, totals } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')
  const termLabel = `TERM ${term.term_number}, ${term.year}`

  const tableRows = rows.map(r => {
    const fill = Math.min(100, r.util_pct ?? 0)
    const color = statusColor(r.util_pct)
    return `<tr>
      <td>${esc(upper(r.name))}</td>
      <td class="money">${fmt(r.allocated)}</td>
      <td class="money">${fmt(r.spent)}</td>
      <td class="money${r.remaining < 0 ? ' over' : ''}">${fmt(r.remaining)}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar" style="width:${fill}%; background:${color}"></div>
        </div>
        <div class="util-num" style="color:${color}">${r.util_pct != null ? r.util_pct.toFixed(0) + '%' : '—'}</div>
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family:'Courier New',monospace; font-size:9pt; padding:16mm 14mm; color:#000; background:#fff; }
  .header { text-align:center; margin-bottom:10px; }
  .header h1 { font-size:11pt; font-weight:bold; text-transform:uppercase; }
  .header h2 { font-size:10pt; font-weight:bold; margin-top:3px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th, td { border:1px solid #000; padding:4px 6px; font-size:9pt; vertical-align:middle; }
  th { background:#f0f0f0; font-weight:bold; text-align:center; }
  td.money { text-align:right; font-family:'Courier New',monospace; }
  td.money.over { color:#DC2626; font-weight:bold; }
  .bar-wrap { width:100%; height:10px; background:#f0f0f0; border:1px solid #ccc; border-radius:2px; overflow:hidden; }
  .bar { height:100%; }
  .util-num { font-size:8pt; text-align:right; margin-top:2px; font-weight:bold; }
  tr.total-row td { background:#f5f5f5; font-weight:bold; border-top:2px solid #000; }
  @media print { @page { size:A4 portrait; margin:16mm 14mm; } body { padding:0; } }
</style></head>
<body>
  <div class="header">
    <h1>${schoolName}${location ? ' — ' + location : ''}</h1>
    <h2>BUDGET PERFORMANCE REPORT — ${termLabel}</h2>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30%">CATEGORY</th>
        <th style="width:15%">ALLOCATED</th>
        <th style="width:15%">SPENT</th>
        <th style="width:15%">REMAINING</th>
        <th style="width:25%">UTILIZATION</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td>TOTAL</td>
        <td class="money">${fmt(totals.allocated)}</td>
        <td class="money">${fmt(totals.spent)}</td>
        <td class="money${totals.remaining < 0 ? ' over' : ''}">${fmt(totals.remaining)}</td>
        <td>
          ${totals.util_pct != null
            ? `<div class="bar-wrap"><div class="bar" style="width:${Math.min(100, totals.util_pct)}%; background:${statusColor(totals.util_pct)}"></div></div>
               <div class="util-num" style="color:${statusColor(totals.util_pct)}">${totals.util_pct.toFixed(1)}%</div>`
            : '—'}
        </td>
      </tr>
    </tbody>
  </table>
</body></html>`
}

module.exports = { buildBudgetHTML }
