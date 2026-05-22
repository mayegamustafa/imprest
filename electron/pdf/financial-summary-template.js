// Financial Summary PDF — single-page executive overview.
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

function buildFinancialSummaryHTML(data, school) {
  const { metrics, topCategories, budgetSummary } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')

  const topRows = (topCategories || []).slice(0, 5).map(c =>
    `<tr>
      <td>${esc(upper(c.name))}</td>
      <td class="money">${fmt(c.spent)}</td>
      <td class="money">${c.pct_of_total.toFixed(1)}%</td>
    </tr>`
  ).join('')

  const budgetRows = (budgetSummary?.rows || [])
    .filter(r => r.allocated > 0)
    .slice(0, 10)
    .map(r => {
      const color = statusColor(r.util_pct)
      return `<tr>
        <td>${esc(upper(r.name))}</td>
        <td class="money">${fmt(r.allocated)}</td>
        <td class="money">${fmt(r.spent)}</td>
        <td class="money${r.remaining < 0 ? ' over' : ''}">${fmt(r.remaining)}</td>
        <td class="util" style="color:${color}">${r.util_pct != null ? r.util_pct.toFixed(0) + '%' : '—'}</td>
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
  .scope { font-size:8.5pt; color:#444; margin-top:3px }
  .stats { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin:10px 0; }
  .stat { border:1px solid #000; padding:8px; }
  .stat .lbl { font-size:7pt; text-transform:uppercase; color:#444; margin-bottom:2px }
  .stat .val { font-size:11pt; font-weight:bold; font-family:'Courier New',monospace }
  .stat .sub { font-size:7.5pt; color:#666; margin-top:2px }
  h3 { font-size:10pt; font-weight:bold; margin:14px 0 4px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #000; padding:3px 6px; font-size:9pt; }
  th { background:#f0f0f0; font-weight:bold; text-align:center }
  td.money, td.util { text-align:right; font-family:'Courier New',monospace }
  td.money.over { color:#DC2626; font-weight:bold }
  @media print { @page { size:A4 portrait; margin:16mm 14mm; } body { padding:0; } }
</style></head>
<body>
  <div class="header">
    <h1>${schoolName}${location ? ' — ' + location : ''}</h1>
    <h2>FINANCIAL SUMMARY</h2>
    <div class="scope">${esc(metrics?.scope_label || '')}</div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="lbl">Total Budget</div>
      <div class="val">${fmt(metrics?.total_budget || 0)}</div>
    </div>
    <div class="stat">
      <div class="lbl">Total Spent (Net)</div>
      <div class="val">${fmt(metrics?.net_spent || 0)}</div>
      <div class="sub">${metrics?.vouchers_count || 0} vouchers</div>
    </div>
    <div class="stat">
      <div class="lbl">Remaining</div>
      <div class="val" style="color:${(metrics?.remaining_budget || 0) < 0 ? '#DC2626' : '#000'}">${fmt(metrics?.remaining_budget || 0)}</div>
    </div>
    <div class="stat">
      <div class="lbl">Utilization</div>
      <div class="val" style="color:${statusColor(metrics?.utilization_pct)}">${metrics?.utilization_pct != null ? metrics.utilization_pct.toFixed(1) + '%' : '—'}</div>
      <div class="sub">${metrics?.active_cycles_count || 0} active cycle(s)</div>
    </div>
  </div>

  <h3>Top Expenditure Categories</h3>
  <table>
    <thead>
      <tr><th style="width:60%">CATEGORY</th><th style="width:25%">SPENT</th><th style="width:15%">% OF TOTAL</th></tr>
    </thead>
    <tbody>${topRows || '<tr><td colspan="3" style="text-align:center;color:#888">No spending</td></tr>'}</tbody>
  </table>

  ${budgetRows ? `
    <h3>Budget Performance</h3>
    <table>
      <thead>
        <tr>
          <th>CATEGORY</th><th>ALLOCATED</th><th>SPENT</th><th>REMAINING</th><th>UTIL%</th>
        </tr>
      </thead>
      <tbody>${budgetRows}</tbody>
    </table>
  ` : ''}
</body></html>`
}

module.exports = { buildFinancialSummaryHTML }
