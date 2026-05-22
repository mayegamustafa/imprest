// Category Trends PDF — table of spending per bucket + simple SVG line chart.
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

const PALETTE = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#65A30D', '#EA580C']

function buildTrendsHTML(data, school) {
  const { bucket, labels, series, scope_label } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')

  // SVG line chart
  const W = 700, H = 240, P = 36
  const innerW = W - P - 12
  const innerH = H - P - 18
  const maxY = Math.max(1, ...series.flatMap(s => s.points.map(p => p.y)))
  const yTicks = 4
  const lines = series.map((s, si) => {
    const color = PALETTE[si % PALETTE.length]
    const pts = s.points.map((p, i) => {
      const x = P + (labels.length > 1 ? (i / (labels.length - 1)) * innerW : innerW / 2)
      const y = H - 18 - (p.y / maxY) * innerH
      return `${x},${y}`
    }).join(' ')
    return `<polyline points="${pts}" stroke="${color}" stroke-width="2" fill="none"/>`
  }).join('')
  const yGuides = []
  for (let i = 0; i <= yTicks; i++) {
    const y = H - 18 - (i / yTicks) * innerH
    yGuides.push(`<line x1="${P}" y1="${y}" x2="${W - 12}" y2="${y}" stroke="#E5E7EB" stroke-width="0.5"/>`)
    const label = ((maxY * i) / yTicks).toFixed(0)
    yGuides.push(`<text x="${P - 4}" y="${y + 3}" font-size="8" text-anchor="end" fill="#6B7280">${label >= 1e6 ? (label/1e6).toFixed(1)+'M' : label >= 1e3 ? (label/1e3).toFixed(0)+'K' : label}</text>`)
  }
  const xLabels = labels.map((l, i) => {
    const x = P + (labels.length > 1 ? (i / (labels.length - 1)) * innerW : innerW / 2)
    return `<text x="${x}" y="${H - 4}" font-size="8" text-anchor="middle" fill="#6B7280">${esc(l)}</text>`
  }).join('')
  const legend = series.map((s, si) => {
    const color = PALETTE[si % PALETTE.length]
    return `<div class="leg"><span class="dot" style="background:${color}"></span>${esc(s.name)}</div>`
  }).join('')

  // Table
  const headerCells = labels.map(l => `<th>${esc(l)}</th>`).join('')
  const tableRows = series.map(s => {
    const cells = labels.map(l => {
      const pt = s.points.find(p => p.x === l)
      return `<td class="money">${fmt(pt?.y || 0)}</td>`
    }).join('')
    const total = s.points.reduce((a, p) => a + p.y, 0)
    return `<tr>
      <td class="cat-name">${esc(upper(s.name))}</td>
      ${cells}
      <td class="money total-col">${fmt(total)}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family:'Courier New',monospace; font-size:9pt; padding:16mm 14mm; color:#000; background:#fff; }
  .header { text-align:center; margin-bottom:8px; }
  .header h1 { font-size:11pt; font-weight:bold; text-transform:uppercase; }
  .header h2 { font-size:10pt; font-weight:bold; margin-top:3px; }
  .scope { font-size:8.5pt; color:#444 }
  svg { display:block; margin:8px auto; }
  .legend { display:flex; flex-wrap:wrap; gap:8px; font-size:8pt; justify-content:center; margin-bottom:8px }
  .leg { display:flex; align-items:center; gap:4px }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50% }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th, td { border:1px solid #000; padding:3px 5px; font-size:8.5pt; vertical-align:middle; }
  th { background:#f0f0f0; font-weight:bold; text-align:center; }
  td.money { text-align:right; font-family:'Courier New',monospace; }
  .total-col { font-weight:bold; background:#f8f8f8 }
  .cat-name { font-weight:bold }
  @media print { @page { size:A4 portrait; margin:16mm 14mm; } body { padding:0; } }
</style></head>
<body>
  <div class="header">
    <h1>${schoolName}${location ? ' — ' + location : ''}</h1>
    <h2>CATEGORY TRENDS — BY ${bucket.toUpperCase()}</h2>
    <div class="scope">${esc(scope_label || '')}</div>
  </div>
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    ${yGuides.join('')}
    ${lines}
    ${xLabels}
  </svg>
  <div class="legend">${legend}</div>
  <table>
    <thead>
      <tr><th>CATEGORY</th>${headerCells}<th>TOTAL</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body></html>`
}

module.exports = { buildTrendsHTML }
