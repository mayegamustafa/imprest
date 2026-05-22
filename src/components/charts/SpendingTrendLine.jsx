import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { formatUGX } from '../../lib/formatters'

/**
 * Multi-series line chart showing per-category spending over buckets
 * (either per-cycle or per-month, decided by the backend).
 *
 * Props:
 *   labels: string[]   — x-axis values
 *   series: [{ category_id, name, points: [{x, y}] }]
 *   height: number
 */
const PALETTE = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#65A30D', '#EA580C']

export default function SpendingTrendLine({ labels = [], series = [], height = 280 }) {
  if (!series.length || !labels.length) {
    return <div className="text-center py-12 text-ink-muted text-sm">Not enough data for trends.</div>
  }

  // Recharts expects an array of {x, ...catName: y, ...} objects
  const chartData = labels.map(label => {
    const row = { x: label }
    series.forEach(s => {
      row[s.name] = s.points.find(p => p.x === label)?.y || 0
    })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="x"
          tick={{ fontSize: 10, fill: '#6B7280' }}
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
        {series.map((s, i) => (
          <Line
            key={s.category_id}
            type="monotone"
            dataKey={s.name}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
