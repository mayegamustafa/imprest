// CommonJS twin of src/lib/ledger.js (orderLedgerRows) for the PDF/Excel
// report builders. Keep the ordering logic in sync with the frontend so the
// printed/exported ledger matches what's on screen.
function orderLedgerRows(entries, receipts) {
  const all = [
    ...entries.map(e => ({ ...e, kind: 'entry' })),
    ...receipts.map(r => ({ ...r, kind: 'receipt' })),
  ]

  const dateSorted = [...all].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 :
    a.kind === b.kind ? (a.id || 0) - (b.id || 0) : a.kind === 'receipt' ? -1 : 1
  )
  const base = new Map()
  dateSorted.forEach((r, i) => base.set(r.kind + '-' + r.id, i + 1))

  const rows = all.map(r => {
    const b = base.get(r.kind + '-' + r.id)
    const key = (r.position != null && r.position !== '') ? Number(r.position) : b
    return { ...r, _key: key, _base: b }
  })

  rows.sort((a, b) => a._key - b._key || a._base - b._base)
  return rows
}

module.exports = { orderLedgerRows }
