import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import Button from '../components/ui/Button'
import useAppStore from '../store/appStore'
import { formatUGX, termLabel } from '../lib/formatters'

export default function Abstract() {
  const { terms, activeCycleId, categories } = useAppStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!activeCycleId) return
    setLoading(true)
    try {
      const result = await window.electronAPI.getAbstractData(activeCycleId)
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeCycleId])

  useEffect(() => { load() }, [load])

  if (!activeCycleId) {
    return (
      <div className="card text-center py-12 max-w-md mx-auto">
        <p className="text-ink-secondary mb-3">
          No active imprest cycle. The Abstract is auto-generated from a cycle's vouchers — go to <strong>Periods</strong>, open a period, and click <strong>Add Cycle</strong> first.
        </p>
      </div>
    )
  }

  const cycle = data?.cycle
  const rows = data?.rows || []
  const cats = data?.categories || []
  const totals = data?.categoryTotals || {}

  // Abstract shows NET spending — balance brought back is NOT included in the
  // "amount spent" totals here. The grand total = sum of category splits = net.
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0)
  const totalAvailable = cycle ? cycle.opening_balance + cycle.amount_received : 0
  const closingBalance = cycle ? totalAvailable - grandTotal : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Expenditure Abstract</h2>
          {cycle && (
            <p className="text-sm text-ink-secondary">{cycle.name} — Category breakdown</p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      {cycle && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'BAL B/FWD', value: formatUGX(cycle.opening_balance) },
            { label: 'Received', value: formatUGX(cycle.amount_received) },
            { label: 'Total Spent', value: formatUGX(grandTotal), color: 'text-warning' },
            { label: 'Balance C/F', value: formatUGX(closingBalance), color: closingBalance < 0 ? 'text-danger' : 'text-success' },
          ].map(({ label, value, color = 'text-ink' }) => (
            <div key={label} className="card py-3 text-center">
              <p className="text-xs text-ink-secondary uppercase tracking-wide font-semibold">{label}</p>
              <p className={`text-lg font-bold font-mono tabular-nums mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Abstract Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-ink-muted text-sm">Loading abstract...</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-ink-muted text-sm">No entries for this cycle. Add expenditures first.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
              <thead>
                <tr className="bg-gray-50 border-b border-border">
                  <th className="border border-border px-2 py-2 text-center font-semibold text-ink-secondary text-xs w-10 sticky left-0 bg-gray-50 z-10">
                    VR<br />NO.
                  </th>
                  {cats.map(cat => (
                    <th
                      key={cat.id}
                      className="border border-border px-1.5 py-2 text-center font-semibold text-ink-secondary"
                      style={{ fontSize: '10px', minWidth: '72px', maxWidth: '90px', wordBreak: 'break-word', lineHeight: '1.2' }}
                    >
                      {cat.name}
                    </th>
                  ))}
                  <th className="border border-border px-2 py-2 text-right font-semibold text-ink text-xs w-20 sticky right-0 bg-gray-50 z-10">
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rowTotal = Object.values(row.splits).reduce((s, v) => s + v, 0)
                  return (
                    <tr key={i} className={`border-b border-border hover:bg-accent-light/30 transition-colors ${
                      Math.abs(rowTotal - (row.net_amount ?? row.amount)) > 0.01 ? 'bg-warning-light/30' : ''
                    }`}>
                      <td className="border border-border px-2 py-1.5 text-center font-medium text-xs sticky left-0 bg-white z-10">
                        {row.voucher_number}
                      </td>
                      {cats.map(cat => {
                        const amt = row.splits[cat.id] || 0
                        return (
                          <td key={cat.id} className="border border-border px-1.5 py-1.5 text-right font-mono tabular-nums text-xs">
                            {amt > 0 ? formatUGX(amt) : <span className="text-ink-muted">—</span>}
                          </td>
                        )
                      })}
                      <td className={`border border-border px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-xs sticky right-0 z-10 ${
                        Math.abs(rowTotal - (row.net_amount ?? row.amount)) > 0.01 ? 'bg-warning-light text-warning' : 'bg-white'
                      }`}>
                        {formatUGX(rowTotal)}
                        {Math.abs(rowTotal - (row.net_amount ?? row.amount)) > 0.01 && (
                          <span className="ml-1 text-2xs text-warning">(of {formatUGX(row.net_amount ?? row.amount)})</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-border-strong font-bold">
                  <td className="border border-border px-2 py-2 text-center text-xs sticky left-0 bg-gray-100 z-10">tt</td>
                  {cats.map(cat => (
                    <td key={cat.id} className="border border-border px-1.5 py-2 text-right font-mono tabular-nums text-xs">
                      {(totals[cat.id] || 0) > 0 ? formatUGX(totals[cat.id]) : <span className="text-ink-muted">—</span>}
                    </td>
                  ))}
                  <td className="border border-border px-2 py-2 text-right font-mono tabular-nums font-bold text-sm sticky right-0 bg-gray-100 z-10">
                    {formatUGX(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Unallocated warning */}
      {rows.some(r => Object.values(r.splits).reduce((s,v)=>s+v,0) !== r.amount) && (
        <div className="bg-warning-light border border-warning/20 rounded px-4 py-3 text-sm text-warning">
          <strong>Some entries have unallocated amounts.</strong> Go to Expenditures and edit those entries to assign category splits.
          Highlighted rows show mismatches.
        </div>
      )}
    </div>
  )
}
