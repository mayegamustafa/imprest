// Builds the ordered ledger: vouchers (date order) with mid-cycle receipts
// placed by their manual `position` when set, otherwise auto-placed by date.
//
// Each returned row is tagged `kind: 'entry' | 'receipt'` and carries a numeric
// `_key` used for ordering and for computing drag drop positions. Entries get
// integer keys (1..N in date order); receipts get their stored `position`, or
// `k + 0.5` (after the k-th earlier-dated voucher) when unplaced.
export function orderLedgerRows(entries, receipts) {
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

// Given the ordered rows (from orderLedgerRows) and a drop relative to a target
// row, returns the new numeric position to persist for the dragged receipt.
// `before` = dropping above the target row (else below it).
export function dropPosition(orderedRows, targetKey, before) {
  const idx = orderedRows.findIndex(r => r._key === targetKey)
  if (idx === -1) return targetKey
  let aboveKey, belowKey
  if (before) {
    belowKey = orderedRows[idx]._key
    aboveKey = orderedRows[idx - 1]?._key ?? belowKey - 1
  } else {
    aboveKey = orderedRows[idx]._key
    belowKey = orderedRows[idx + 1]?._key ?? aboveKey + 1
  }
  return (aboveKey + belowKey) / 2
}
