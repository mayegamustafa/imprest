// Consolidated Abstract PDF — categories × cycles matrix, landscape.
function fmt(n) {
  if (n === null || n === undefined) return ''
  const num = Number(n)
  if (num === 0) return '-'
  return num.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]))
}
function upper(s) { return s == null ? '' : String(s).toUpperCase() }

function buildConsolidatedHTML(data, school) {
  const { cycles, categories, matrix, category_totals, cycle_totals, grand_total, scope_label } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')

  const headerCells = cycles.map(cyc => {
    const label = `${cyc.year}/T${cyc.term_number}<br>C${cyc.cycle_number}`
    return `<th class="cyc">${label}</th>`
  }).join('')

  const dataRows = categories.map(cat => {
    const cells = cycles.map(cyc =>
      `<td class="money">${fmt(matrix[cat.id]?.[cyc.id] || 0)}</td>`
    ).join('')
    const total = category_totals[cat.id] || 0
    return `<tr>
      <td class="cat-name">${esc(upper(cat.name))}</td>
      ${cells}
      <td class="money total-col">${fmt(total)}</td>
    </tr>`
  }).join('')

  const totalCells = cycles.map(cyc =>
    `<td class="money total-col">${fmt(cycle_totals[cyc.id] || 0)}</td>`
  ).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family:'Courier New',monospace; font-size:8pt; color:#000; background:#fff; padding:10mm 8mm; }
  .header { text-align:center; margin-bottom:8px; }
  .header h1 { font-size:10pt; font-weight:bold; text-transform:uppercase; }
  .header h2 { font-size:9pt; font-weight:bold; margin-top:2px; }
  .header .scope { font-size:7.5pt; margin-top:3px; color:#444 }
  table { width:100%; border-collapse:collapse; margin-top:6px; table-layout:fixed; }
  th, td { border:1px solid #000; padding:2px 4px; font-size:7.5pt; vertical-align:middle; }
  th { background:#e8e8e8; font-weight:bold; text-align:center; word-wrap:break-word; line-height:1.15; }
  .cat-name { font-weight:bold; }
  td.money { text-align:right; font-family:'Courier New',monospace; }
  .total-col { font-weight:bold; background:#f8f8f8; }
  tr.totals-row td { border-top:2px solid #000; font-weight:bold; background:#efefef; }
  @media print { @page { size:A4 landscape; margin:10mm 8mm; } body { padding:0; } }
</style></head>
<body>
  <div class="header">
    <h1>${schoolName}${location ? ' — ' + location : ''}</h1>
    <h2>CONSOLIDATED EXPENDITURE ABSTRACT</h2>
    <div class="scope">${esc(scope_label || '')}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:120px">CATEGORY</th>
        ${headerCells}
        <th style="width:90px">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows}
      <tr class="totals-row">
        <td class="cat-name">TOTALS</td>
        ${totalCells}
        <td class="money total-col">${fmt(grand_total)}</td>
      </tr>
    </tbody>
  </table>
</body></html>`
}

module.exports = { buildConsolidatedHTML }
