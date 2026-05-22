import { useState, useEffect, useCallback, useMemo } from 'react'
import { Save, Copy, Wallet, AlertCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import { StatCard } from '../components/ui/Card'
import useAppStore from '../store/appStore'
import { formatUGX, periodLabel } from '../lib/formatters'

export default function Budgets() {
  const { terms, currentUser, notify } = useAppStore()
  const isReadOnly = currentUser?.role === 'viewer'

  const [selectedTermId, setSelectedTermId] = useState('')
  const [rows, setRows] = useState([])
  const [dirty, setDirty] = useState({})  // { category_id: string }
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copySource, setCopySource] = useState('')
  const [showOverrides, setShowOverrides] = useState(false)
  const [overrideCycleId, setOverrideCycleId] = useState('')
  const [overrides, setOverrides] = useState([])
  const [dirtyOverrides, setDirtyOverrides] = useState({})

  // Pick first term by default
  useEffect(() => {
    if (!selectedTermId && terms.length > 0) {
      setSelectedTermId(String(terms[0].id))
    }
  }, [terms])

  // Cycle list for the selected term
  const cyclesInTerm = useMemo(() => {
    const t = terms.find(t => t.id === Number(selectedTermId))
    return t?.cycles || []
  }, [terms, selectedTermId])

  // Load budgets when term changes
  const load = useCallback(async () => {
    if (!selectedTermId) return
    setLoading(true)
    setDirty({})
    try {
      const data = await window.electronAPI.listBudgetsByTerm(Number(selectedTermId))
      setRows(data)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedTermId])

  useEffect(() => { load() }, [load])

  // Load overrides when cycle changes
  const loadOverrides = useCallback(async () => {
    if (!overrideCycleId) {
      setOverrides([])
      return
    }
    try {
      const data = await window.electronAPI.listBudgetOverrides(Number(overrideCycleId))
      setOverrides(data)
      setDirtyOverrides({})
    } catch (err) {
      notify(err.message, 'error')
    }
  }, [overrideCycleId])

  useEffect(() => { loadOverrides() }, [loadOverrides])

  function updateRow(categoryId, newValue) {
    setDirty(d => ({ ...d, [categoryId]: newValue }))
  }

  async function handleSave() {
    if (Object.keys(dirty).length === 0) return
    setSaving(true)
    try {
      const payload = rows.map(r => ({
        category_id: r.category_id,
        allocated_amount: dirty[r.category_id] != null
          ? Number(dirty[r.category_id] || 0)
          : r.allocated_amount,
      }))
      await window.electronAPI.bulkSaveBudgets(Number(selectedTermId), payload)
      notify('Budgets saved')
      load()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!copySource) return
    if (!confirm(`Copy budgets from the selected term? This overwrites existing allocations for the current term.`)) return
    try {
      const result = await window.electronAPI.copyBudgetsFromTerm(Number(copySource), Number(selectedTermId))
      notify(`Copied ${result.count} budget rows`)
      setShowCopyModal(false)
      setCopySource('')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  function updateOverride(categoryId, value) {
    setDirtyOverrides(o => ({ ...o, [categoryId]: value }))
  }

  async function saveOverride(category_id, raw) {
    const v = Number(raw || 0)
    try {
      if (v === 0) {
        // Find existing override and delete it
        const existing = overrides.find(o => o.category_id === category_id && o.override_id)
        if (existing) {
          await window.electronAPI.deleteBudgetOverride(existing.override_id)
        }
      } else {
        await window.electronAPI.saveBudgetOverride({
          cycle_id: Number(overrideCycleId),
          category_id,
          allocated_amount: v,
        })
      }
      notify('Override saved')
      loadOverrides()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  // Derived totals for the page header
  const totals = useMemo(() => {
    const allocated = rows.reduce((s, r) => {
      const v = dirty[r.category_id] != null ? Number(dirty[r.category_id] || 0) : r.allocated_amount
      return s + v
    }, 0)
    const spent = rows.reduce((s, r) => s + r.spent, 0)
    return {
      allocated,
      spent,
      remaining: allocated - spent,
      util_pct: allocated > 0 ? (spent / allocated) * 100 : null,
    }
  }, [rows, dirty])

  const hasDirty = Object.keys(dirty).length > 0
  const selectedTerm = terms.find(t => t.id === Number(selectedTermId))

  if (terms.length === 0) {
    return (
      <div className="card max-w-xl mx-auto py-10 text-center">
        <Wallet size={36} strokeWidth={1.25} className="mx-auto text-ink-muted mb-3" />
        <h2 className="text-md font-semibold text-ink mb-1">No periods exist yet</h2>
        <p className="text-sm text-ink-secondary">Create a period first under <strong>Periods</strong>, then come back here to assign budgets.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Budgets</h2>
          <p className="text-sm text-ink-secondary">
            Allocate funds per category. Spent and remaining update live across all cycles in the term.
          </p>
        </div>
        {hasDirty && !isReadOnly && (
          <Button onClick={handleSave} loading={saving}>
            <Save size={14} /> Save Changes ({Object.keys(dirty).length})
          </Button>
        )}
      </div>

      {/* Controls */}
      <div className="card py-3 flex items-center gap-3 flex-wrap">
        <Select
          label="Period / Term"
          value={selectedTermId}
          onChange={e => setSelectedTermId(e.target.value)}
          className="min-w-[200px]"
        >
          {terms.map(t => (
            <option key={t.id} value={t.id}>{periodLabel(t)}</option>
          ))}
        </Select>

        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={load} loading={loading} title="Reload">
            <RefreshCw size={13} />
          </Button>
        </div>

        {!isReadOnly && (
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => setShowCopyModal(true)} title="Copy budgets from another term">
              <Copy size={13} /> Copy from Term
            </Button>
          </div>
        )}
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Budget" value={`UGX ${formatUGX(totals.allocated)}`} icon={Wallet} variant="accent" />
        <StatCard label="Total Spent" value={`UGX ${formatUGX(totals.spent)}`} variant="warning" />
        <StatCard
          label="Remaining"
          value={`UGX ${formatUGX(totals.remaining)}`}
          variant={totals.remaining < 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Utilization"
          value={totals.util_pct != null ? `${totals.util_pct.toFixed(1)}%` : '—'}
          sub={totals.util_pct != null && totals.util_pct > 100 ? 'OVER BUDGET' : ''}
          variant={totals.util_pct == null ? 'default' : totals.util_pct > 100 ? 'danger' : totals.util_pct > 90 ? 'warning' : 'success'}
        />
      </div>

      {/* Budget table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-ink-muted text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-ink-muted text-sm">No active categories.</div>
        ) : (
          <table className="fin-table">
            <thead className="sticky top-0 z-10">
              <tr>
                <th>Category</th>
                <th className="text-right w-32">Allocated</th>
                <th className="text-right w-28">Spent</th>
                <th className="text-right w-28">Remaining</th>
                <th className="w-48">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const allocatedVal = dirty[r.category_id] != null
                  ? Number(dirty[r.category_id] || 0)
                  : r.allocated_amount
                const remaining = allocatedVal - r.spent
                const utilPct = allocatedVal > 0 ? (r.spent / allocatedVal) * 100 : null
                const overspent = remaining < 0
                let barColor = 'bg-success'
                if (utilPct == null) barColor = 'bg-gray-300'
                else if (utilPct >= 100) barColor = 'bg-danger'
                else if (utilPct >= 90) barColor = 'bg-danger/80'
                else if (utilPct >= 70) barColor = 'bg-warning'

                return (
                  <tr key={r.category_id} className={dirty[r.category_id] != null ? 'bg-accent-light/30' : ''}>
                    <td className="font-medium">{r.name}</td>
                    <td className="money">
                      <input
                        type="number"
                        className="field-input text-right font-mono text-sm py-1"
                        value={dirty[r.category_id] != null ? dirty[r.category_id] : r.allocated_amount || ''}
                        onChange={e => updateRow(r.category_id, e.target.value)}
                        disabled={isReadOnly}
                        min="0"
                        step="1000"
                        placeholder="0"
                      />
                    </td>
                    <td className="money text-warning">{formatUGX(r.spent)}</td>
                    <td className={`money ${overspent ? 'text-danger font-semibold' : ''}`}>
                      {formatUGX(remaining)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-sm overflow-hidden">
                          {allocatedVal > 0 && (
                            <div
                              className={`h-full ${barColor} transition-all`}
                              style={{ width: `${Math.min(100, utilPct)}%` }}
                            />
                          )}
                        </div>
                        <span className={`text-2xs font-mono tabular-nums w-10 text-right ${
                          utilPct == null ? 'text-ink-muted' : utilPct >= 100 ? 'text-danger' : utilPct >= 90 ? 'text-warning' : 'text-ink-secondary'
                        }`}>
                          {utilPct == null ? '—' : `${utilPct.toFixed(0)}%`}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-gray-50 border-t-2 border-border-strong font-bold">
                <td>TOTAL</td>
                <td className="money">{formatUGX(totals.allocated)}</td>
                <td className="money text-warning">{formatUGX(totals.spent)}</td>
                <td className={`money ${totals.remaining < 0 ? 'text-danger' : 'text-success'}`}>
                  {formatUGX(totals.remaining)}
                </td>
                <td className="text-xs">
                  {totals.util_pct != null ? `${totals.util_pct.toFixed(1)}%` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Cycle-level overrides */}
      {cyclesInTerm.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOverrides(!showOverrides)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showOverrides ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-sm font-semibold text-ink">Cycle-level overrides</span>
              <span className="text-xs text-ink-secondary">
                (optionally adjust per cycle — overrides take precedence over term budget)
              </span>
            </div>
          </button>

          {showOverrides && (
            <div className="border-t border-border p-4 space-y-3">
              <Select
                label="Cycle"
                value={overrideCycleId}
                onChange={e => setOverrideCycleId(e.target.value)}
                className="max-w-sm"
              >
                <option value="">Select a cycle...</option>
                {cyclesInTerm.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>

              {overrideCycleId && (
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="text-right w-32">Term Budget</th>
                      <th className="text-right w-40">Override (leave 0 to use term)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map(o => (
                      <tr key={o.category_id} className={o.override_id ? 'bg-accent-light/20' : ''}>
                        <td className="font-medium">{o.name}</td>
                        <td className="money text-ink-secondary">{formatUGX(o.term_budget)}</td>
                        <td className="money">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              className="field-input text-right font-mono text-sm py-1"
                              value={dirtyOverrides[o.category_id] != null ? dirtyOverrides[o.category_id] : (o.override_amount ?? '')}
                              onChange={e => updateOverride(o.category_id, e.target.value)}
                              onBlur={e => {
                                const newVal = e.target.value
                                const wasOverride = o.override_amount ?? null
                                if (Number(newVal || 0) !== Number(wasOverride || 0)) {
                                  saveOverride(o.category_id, newVal)
                                }
                              }}
                              disabled={isReadOnly}
                              min="0"
                              step="1000"
                              placeholder="—"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Copy modal */}
      <Modal
        open={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        title="Copy budgets from another period"
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCopyModal(false)}>Cancel</Button>
          <Button onClick={handleCopy} disabled={!copySource}>Copy</Button>
        </>}
      >
        <p className="text-sm text-ink-secondary mb-3">
          Source budgets will be copied into <strong>{selectedTerm ? periodLabel(selectedTerm) : ''}</strong>.
          Existing allocations for that period will be overwritten.
        </p>
        <Select
          label="Source period"
          value={copySource}
          onChange={e => setCopySource(e.target.value)}
        >
          <option value="">Select a period...</option>
          {terms.filter(t => t.id !== Number(selectedTermId)).map(t => (
            <option key={t.id} value={t.id}>{periodLabel(t)}</option>
          ))}
        </Select>
      </Modal>
    </div>
  )
}
