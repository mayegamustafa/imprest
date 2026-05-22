import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatUGX } from '../../lib/formatters'

/**
 * Horizontal bar chart showing spending per category, sorted descending.
 *
 * Props:
 *   data: [{ name, spent }] (will be sorted internally)
 *   height: number (default 280)
 */
const COLORS = ['#2563EB', '#1D4ED8', '#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD']

export default function CategorySpendBar({ data = [], height = 280 }) {
  const sorted = [...data].filter(d => d.spent > 0).sort((a, b) => b.spent - a.spent)
  if (sorted.length === 0) {
    return <div className="text-center py-12 text-ink-muted text-sm">No spending data.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: '#6B7280' }}
          tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: '#1F2937' }}
          width={120}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={false}
        />
        <Tooltip
          formatter={v => `UGX ${formatUGX(v)}`}
          labelStyle={{ fontWeight: 600, color: '#1F2937' }}
          contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }}
        />
        <Bar dataKey="spent">
          {sorted.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
