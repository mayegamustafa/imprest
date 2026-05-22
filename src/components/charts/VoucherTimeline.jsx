import { useMemo, useState } from 'react'
import { formatUGX, formatDate } from '../../lib/formatters'

/**
 * Gantt-style voucher timeline. Vouchers are rendered as colored dots on a
 * horizontal date axis, grouped by category. Hovering shows details.
 *
 * Props:
 *   vouchers: [{ id, date, voucher_number, payee, purpose, amount,
 *                category_id, category_name, cycle_number }]
 *   height: number
 */
const PALETTE = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#65A30D', '#EA580C', '#0EA5E9', '#84CC16', '#A855F7', '#F59E0B', '#EF4444', '#10B981', '#6366F1']

export default function VoucherTimeline({ vouchers = [], height = 380 }) {
  const [hovered, setHovered] = useState(null)

  const { categories, dates, dotPositions, dateLabels } = useMemo(() => {
    if (vouchers.length === 0) return { categories: [], dates: [], dotPositions: [], dateLabels: [] }

    // Unique categories (kept in order of first appearance)
    const catSeen = new Map()
    vouchers.forEach(v => {
      if (v.category_id && !catSeen.has(v.category_id)) {
        catSeen.set(v.category_id, v.category_name || '?')
      }
    })
    const cats = [...catSeen.entries()].map(([id, name]) => ({ id, name }))

    // Date range
    const ds = vouchers.map(v => new Date(v.date).getTime()).sort((a, b) => a - b)
    const minD = ds[0]
    const maxD = ds[ds.length - 1]
    const span = Math.max(maxD - minD, 1)

    const positions = vouchers.map(v => {
      const t = new Date(v.date).getTime()
      const xPct = ((t - minD) / span) * 100
      const catIdx = cats.findIndex(c => c.id === v.category_id)
      return { v, xPct, catIdx: catIdx >= 0 ? catIdx : 0 }
    })

    // Date labels — evenly spaced 6 markers
    const labels = []
    for (let i = 0; i < 6; i++) {
      const t = minD + (span * i) / 5
      labels.push({ xPct: (i / 5) * 100, label: formatDate(new Date(t)) })
    }

    return { categories: cats, dates: ds, dotPositions: positions, dateLabels: labels }
  }, [vouchers])

  if (vouchers.length === 0) {
    return <div className="text-center py-12 text-ink-muted text-sm">No vouchers in scope.</div>
  }

  const rowH = Math.max(28, Math.floor((height - 40) / Math.max(categories.length, 1)))
  const innerHeight = rowH * categories.length

  return (
    <div className="relative">
      <div className="relative border border-border rounded bg-surface overflow-hidden" style={{ height: innerHeight + 36 }}>
        {/* Category rows */}
        <div className="absolute inset-x-0 top-0" style={{ height: innerHeight }}>
          {categories.map((cat, i) => (
            <div
              key={cat.id}
              className="absolute inset-x-0 flex items-center px-2 border-b border-border/40"
              style={{ top: i * rowH, height: rowH }}
            >
              <span className="text-2xs font-medium text-ink-secondary truncate w-28 shrink-0">{cat.name}</span>
              <div className="flex-1 h-full relative">
                {/* gridlines */}
                {dateLabels.map((d, j) => (
                  <div
                    key={j}
                    className="absolute top-0 bottom-0 border-l border-border/30"
                    style={{ left: `${d.xPct}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Dots */}
        <div className="absolute top-0" style={{ left: '112px', right: '8px', height: innerHeight }}>
          {dotPositions.map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full cursor-pointer transition-transform hover:scale-150"
              onMouseEnter={() => setHovered(p.v)}
              onMouseLeave={() => setHovered(null)}
              style={{
                left: `${p.xPct}%`,
                top: p.catIdx * rowH + rowH / 2 - 5,
                width: Math.min(20, Math.max(6, Math.sqrt(p.v.amount / 10000))),
                height: Math.min(20, Math.max(6, Math.sqrt(p.v.amount / 10000))),
                background: PALETTE[p.catIdx % PALETTE.length],
                opacity: hovered && hovered.id !== p.v.id ? 0.3 : 0.85,
                transform: 'translateX(-50%)',
              }}
              title={`${p.v.payee} — ${formatUGX(p.v.amount)} (${formatDate(p.v.date)})`}
            />
          ))}
        </div>

        {/* Date axis */}
        <div className="absolute bottom-0 left-[112px] right-[8px] h-9 border-t border-border bg-gray-50">
          {dateLabels.map((d, j) => (
            <span
              key={j}
              className="absolute top-1 text-2xs text-ink-muted font-mono"
              style={{ left: `${d.xPct}%`, transform: 'translateX(-50%)' }}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>

      {/* Hover detail card */}
      {hovered && (
        <div className="absolute top-2 right-2 bg-ink text-white text-xs rounded px-3 py-2 shadow-modal max-w-xs">
          <p className="font-semibold">VR #{hovered.voucher_number} · {formatDate(hovered.date)}</p>
          <p className="opacity-90 text-2xs mt-0.5">{hovered.payee}</p>
          <p className="opacity-70 text-2xs">{hovered.purpose}</p>
          <p className="font-mono font-bold mt-1">UGX {formatUGX(hovered.amount)}</p>
          <p className="text-2xs opacity-70">{hovered.category_name}</p>
        </div>
      )}
    </div>
  )
}
