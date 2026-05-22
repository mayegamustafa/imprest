import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatUGX } from '../../lib/formatters'

/**
 * Donut chart of top spending categories.
 *
 * Props:
 *   data: [{ name, spent, pct_of_total }]
 *   height: number
 */
const PALETTE = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#94A3B8']

export default function TopCategoriesPie({ data = [], height = 280 }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-12 text-ink-muted text-sm">No spending data.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="spent"
          nameKey="name"
          innerRadius="50%"
          outerRadius="80%"
          paddingAngle={1}
          stroke="#fff"
          strokeWidth={2}
          label={({ pct_of_total }) => pct_of_total > 4 ? `${pct_of_total.toFixed(0)}%` : ''}
          labelLine={false}
        >
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip
          formatter={v => `UGX ${formatUGX(v)}`}
          contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10 }}
          formatter={(value, _entry, idx) => {
            const item = data[idx]
            return `${value} (${item?.pct_of_total.toFixed(0)}%)`
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
