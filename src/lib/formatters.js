export function formatUGX(amount) {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = Number(amount)
  if (isNaN(n)) return '—'
  return n.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function formatUGXCompact(amount) {
  const n = Number(amount)
  if (isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return formatUGX(n)
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateInput(dateStr) {
  // Returns YYYY-MM-DD for <input type="date">
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function termLabel(termNumber, year) {
  const names = ['', 'Term 1', 'Term 2', 'Term 3']
  return `${names[termNumber] || `Term ${termNumber}`} ${year}`
}

const MONTH_NAMES = ['', 'January','February','March','April','May','June','July','August','September','October','November','December']

export function periodLabel(term) {
  if (!term) return ''
  const { period_type, term_number, year, custom_name } = term
  if (period_type === 'month') return `${MONTH_NAMES[term_number] || term_number} ${year}`
  if (period_type === 'quarter') return `Q${term_number} ${year}`
  if (period_type === 'custom') return custom_name || `Period ${term_number} (${year})`
  return `Term ${term_number} ${year}`
}

export function periodTypeLabel(type) {
  return ({
    term: 'Term',
    month: 'Month',
    quarter: 'Quarter',
    custom: 'Custom Period',
  })[type] || 'Period'
}

export function periodOptions(periodType) {
  if (periodType === 'term') return [{v:1,l:'Term 1'},{v:2,l:'Term 2'},{v:3,l:'Term 3'}]
  if (periodType === 'quarter') return [{v:1,l:'Q1'},{v:2,l:'Q2'},{v:3,l:'Q3'},{v:4,l:'Q4'}]
  if (periodType === 'month') return MONTH_NAMES.slice(1).map((m, i) => ({ v: i + 1, l: m }))
  return []  // custom — free text
}

export function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}
