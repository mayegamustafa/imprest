import { formatUGX } from '../../lib/formatters'

/**
 * BudgetProgressBars — one horizontal progress bar per category showing
 * spent vs allocated. Color-codes from green → amber → red based on
 * utilization percent. Pure CSS, no Recharts needed.
 *
 * Props:
 *   rows: [{ category_id, name, allocated, spent, remaining, util_pct, status }]
 */
export default function BudgetProgressBars({ rows = [] }) {
  const display = rows.filter(r => r.allocated > 0 || r.spent > 0)

  if (display.length === 0) {
    return (
      <div className="text-center py-8 text-ink-muted text-sm">
        No budgets allocated for this scope yet.
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {display.map(r => {
        const pct = r.util_pct ?? 0
        const fillPct = Math.min(100, Math.max(0, pct))
        // Color band
        let barClass = 'bg-success'
        let textClass = 'text-success'
        if (pct >= 100) {
          barClass = 'bg-danger'
          textClass = 'text-danger'
        } else if (pct >= 90) {
          barClass = 'bg-danger/80'
          textClass = 'text-danger'
        } else if (pct >= 70) {
          barClass = 'bg-warning'
          textClass = 'text-warning'
        }
        const noBudget = !r.allocated || r.allocated === 0
        return (
          <div key={r.category_id}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="font-medium text-ink truncate pr-2">{r.name}</span>
              <span className={`font-mono tabular-nums ${noBudget ? 'text-ink-muted' : textClass}`}>
                {noBudget
                  ? `${formatUGX(r.spent)} spent · no budget`
                  : `${formatUGX(r.spent)} / ${formatUGX(r.allocated)} · ${pct.toFixed(0)}%`}
              </span>
            </div>
            <div className="relative h-2.5 bg-gray-100 rounded-sm overflow-hidden">
              {!noBudget && (
                <div
                  className={`absolute inset-y-0 left-0 ${barClass} transition-all`}
                  style={{ width: `${fillPct}%` }}
                />
              )}
              {noBudget && r.spent > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-ink-muted/40"
                  style={{ width: '100%' }}
                />
              )}
              {/* Overspend indicator if pct > 100 */}
              {pct > 100 && (
                <div className="absolute inset-y-0 right-0 w-[2px] bg-ink-muted" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
