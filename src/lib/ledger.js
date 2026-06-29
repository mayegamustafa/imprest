// Builds the ordered ledger from vouchers + mid-cycle receipts. Any row may be
// dragged: a row with a manual `position` uses it as its sort key; unplaced rows
// fall back to their position in date order. Both kinds share one key space, so
// vouchers and receipts can be freely interleaved by the user.
//
// Each returned row is tagged `kind: 'entry' | 'receipt'` and carries `_key`
// (effective sort key) and `_base` (its 1..M index in date order, used as a
// stable tiebreak and as the fallback key when unplaced).
export function orderLedgerRows(entries, receipts) {
  const all = [
    ...entries.map(e => ({ ...e, kind: 'entry' })),
    ...receipts.map(r => ({ ...r, kind: 'receipt' })),
  ]

  // Baseline: date order over ALL rows (receipt before entry on the same day —
  // money in, then out). Gives each row a stable integer slot 1..M.
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
