// CommonJS twin of src/lib/ledger.js (orderLedgerRows) for the PDF/Excel
// report builders. Keep the ordering logic in sync with the frontend so the
// printed/exported ledger matches what's on screen.
function orderLedgerRows(entries, receipts) {
  const sortedEntries = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id || 0) - (b.id || 0)
  )

  const rows = sortedEntries.map((e, i) => ({ ...e, kind: 'entry', _key: i + 1 }))

  for (const r of receipts) {
    let key
    if (r.position != null && r.position !== '') {
      key = Number(r.position)
    } else {
      const k = sortedEntries.filter(e => e.date < r.date).length
      key = k + 0.5
    }
    rows.push({ ...r, kind: 'receipt', _key: key })
  }

  rows.sort((a, b) =>
    a._key - b._key ||
    (a.kind === b.kind ? (a.id || 0) - (b.id || 0) : a.kind === 'entry' ? -1 : 1)
  )
  return rows
}

module.exports = { orderLedgerRows }
