import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatUGX } from '../../lib/formatters'

/**
 * Grouped bar chart: per category, two bars (allocated and spent).
 *
 * Props:
 *   rows: [{ name, allocated, spent }]
 *   height: number
 */
export default function BudgetVsActualBar({ rows = [], height = 280 }) {
  const data = rows.filter(r => r.allocated > 0 || r.spent > 0)
  if (data.length === 0) {
    return <div className="text-center py-12 text-ink-muted text-sm">No budget data.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 50 }}>
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
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="allocated" fill="#94A3B8" name="Budget" />
        <Bar dataKey="spent" fill="#2563EB" name="Spent" />
      </BarChart>
    </ResponsiveContainer>
  )
}
