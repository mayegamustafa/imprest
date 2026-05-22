export function validateEntry(data) {
  const errors = {}

  if (!data.date) errors.date = 'Date is required'
  if (!data.payee?.trim()) errors.payee = 'Payee name is required'
  if (!data.purpose?.trim()) errors.purpose = 'Purpose is required'

  const amount = Number(data.amount)
  if (!data.amount || isNaN(amount) || amount <= 0) {
    errors.amount = 'Amount must be greater than 0'
  }

  return errors
}

export function validateSplits(splits, totalAmount, balanceBack = 0) {
  const net = Number(totalAmount) - Number(balanceBack || 0)
  if (net < 0.005) return null  // whole voucher returned, no splits required
  const positiveSplits = splits.filter(sp => Number(sp.amount) > 0)
  if (positiveSplits.length === 0) {
    return 'At least one category is required.'
  }
  const splitsTotal = positiveSplits.reduce((s, sp) => s + Number(sp.amount || 0), 0)
  const diff = Math.abs(splitsTotal - net)
  if (diff > 0.01) {
    return `Allocated ${splitsTotal.toLocaleString()} of ${net.toLocaleString()} net spent — ${diff.toLocaleString()} remaining`
  }
  return null
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0
}
