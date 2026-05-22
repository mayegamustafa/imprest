import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from 'recharts'
import { formatUGX } from '../../lib/formatters'

/**
 * Stacked bar chart: x-axis = categories, each bar stacked by cycle.
 * Optional `budgets` array draws a horizontal red reference line per
 * category showing the budget cap.
 *
 * Props:
 *   cycles: [{id, label}]  — used to derive stack keys
 *   categories: [{id, name}]
 *   matrix: { [category_id]: { [cycle_id]: spent } }
 *   budgets?: { [category_id]: allocated }
 *   height: number
 */
const PALETTE = ['#2563EB', '#1D4ED8', '#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD']

export default function StackedByCycleBar({ cycles = [], categories = [], matrix = {}, budgets = {}, height = 320 }) {
  if (!cycles.length || !categories.length) {
    return <div className="text-center py-12 text-ink-muted text-sm">No data.</div>
  }

  // Recharts expects: [{ category_name, cycle1_label: amount, cycle2_label: amount, ..., budget: cap }]
  const data = categories
    .map(c => {
      const row = { name: c.name }
      let total = 0
      cycles.forEach(cyc => {
        const v = matrix[c.id]?.[cyc.id] || 0
        row[cyc.label] = v
        total += v
      })
      row.__total = total
      if (budgets[c.id]) row.budget = budgets[c.id]
      return row
    })
    .filter(r => r.__total > 0 || r.budget > 0)
    .sort((a, b) => b.__total - a.__total)

  if (data.length === 0) {
    return <div className="text-center py-12 text-ink-muted text-sm">No spending or budgets.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: '#6B7280' }}
          angle={-30}
          textAnchor="end"
          interval={0}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#6B7280' }}
          tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={{ stroke: '#E5E7EB' }}
        />
        <Tooltip
          formatter={v => `UGX ${formatUGX(v)}`}
          labelStyle={{ fontWeight: 600, color: '#1F2937' }}
          contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {cycles.map((cyc, i) => (
          <Bar
            key={cyc.id}
            dataKey={cyc.label}
            stackId="cycles"
            fill={PALETTE[i % PALETTE.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
