import { useState, useEffect } from 'react'
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, Lock, Unlock, ShieldCheck } from 'lucide-react'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import useAppStore from '../store/appStore'
import { formatUGX, periodLabel, periodOptions, periodTypeLabel } from '../lib/formatters'

export default function Terms() {
  const { terms, activeCycleId, setActiveCycleId, refreshTerms, notify } = useAppStore()
  const [expanded, setExpanded] = useState({})

  // Refresh cycle totals (total_spent, total_brought_back, etc.) every time
  // the page is visited — entries may have been added since the last bootstrap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshTerms() }, [])
  const [showTermModal, setShowTermModal] = useState(false)
  const [showCycleModal, setShowCycleModal] = useState(false)
  const [editCycle, setEditCycle] = useState(null)
  const [selectedTermId, setSelectedTermId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [termForm, setTermForm] = useState({
    period_type: 'term',
    term_number: '1',
    custom_name: '',
    year: new Date().getFullYear(),
  })
  const [cycleForm, setCycleForm] = useState({ name: '', opening_balance: '0', amount_received: '' })

  function toggleExpand(termId) {
    setExpanded(prev => ({ ...prev, [termId]: !prev[termId] }))
  }

  async function handleCreateTerm() {
    setSaving(true)
    try {
      const result = await window.electronAPI.createTerm({
        period_type: termForm.period_type,
        term_number: Number(termForm.term_number) || 1,
        custom_name: termForm.period_type === 'custom' ? termForm.custom_name : null,
        year: Number(termForm.year),
      })
      await refreshTerms()
      setShowTermModal(false)
      notify('Period created — now add the first imprest cycle inside it')

      // Expand the new period and immediately open the Add Cycle modal,
      // so the user goes straight from "create period" to "create first cycle".
      if (result?.id) {
        setExpanded(prev => ({ ...prev, [result.id]: true }))
        setTimeout(() => openCycleModal(result.id), 100)
      }
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTerm(termId) {
    if (!confirm('Delete this term and all its cycles and entries? This cannot be undone.')) return
    try {
      await window.electronAPI.deleteTerm(termId)
      await refreshTerms()
      notify('Term deleted')
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  function openCycleModal(termId, cycle = null) {
    setSelectedTermId(termId)
    if (cycle) {
      setEditCycle(cycle)
      setCycleForm({
        name: cycle.name || '',
        opening_balance: String(cycle.opening_balance),
        amount_received: String(cycle.amount_received),
      })
    } else {
      setEditCycle(null)
      const term = terms.find(t => t.id === termId)
      const termCycles = term?.cycles || []
      const lastInTerm = termCycles.slice(-1)[0]
      // Cross-term fallback: carry from the last cycle across ALL terms when
      // creating the first cycle of a brand-new term
      const allCycles  = terms.flatMap(t => t.cycles || []).sort((a, b) => a.id - b.id)
      const lastCycle  = lastInTerm || allCycles.slice(-1)[0]
      const prevBalance = lastCycle
        ? lastCycle.opening_balance + lastCycle.amount_received
          - (lastCycle.total_spent || 0) + (lastCycle.total_brought_back || 0)
        : 0
      const nextNum = (term?.cycles?.length || 0) + 1
      setCycleForm({
        name: '',
        opening_balance: String(Math.max(0, prevBalance)),
        amount_received: '',
      })
    }
    setShowCycleModal(true)
  }

  async function handleSaveCycle() {
    setSaving(true)
    try {
      const term = terms.find(t => t.id === selectedTermId)
      const nextCycleNum = editCycle ? editCycle.cycle_number : (term?.cycles?.length || 0) + 1

      if (editCycle) {
        await window.electronAPI.updateCycle(editCycle.id, {
          name: cycleForm.name,
          opening_balance: Number(cycleForm.opening_balance) || 0,
          amount_received: Number(cycleForm.amount_received) || 0,
        })
        notify('Cycle updated')
      } else {
        const result = await window.electronAPI.createCycle({
          term_id: selectedTermId,
          cycle_number: nextCycleNum,
          name: cycleForm.name,
          opening_balance: Number(cycleForm.opening_balance) || 0,
          amount_received: Number(cycleForm.amount_received) || 0,
        })
        setActiveCycleId(result.id)
        notify('Cycle created and set as active')
      }
      await refreshTerms()
      setShowCycleModal(false)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseCycle(cycleId) {
    if (!confirm('Close this cycle? It becomes read-only and the closing balance will carry forward to the next cycle.')) return
    try {
      const result = await window.electronAPI.closeCycle(cycleId)
      await refreshTerms()
      notify(`Cycle closed. Balance: UGX ${formatUGX(result.closingBalance)}`)
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function handleReopenCycle(cycleId) {
    if (!confirm('Re-open this closed cycle? You will be able to edit, add, or delete entries again.')) return
    try {
      await window.electronAPI.reopenCycle(cycleId)
      await refreshTerms()
      notify('Cycle re-opened')
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function handleDeleteCycle(cycleId) {
    if (!confirm('Delete this cycle and all its entries? This cannot be undone.')) return
    try {
      await window.electronAPI.deleteCycle(cycleId)
      await refreshTerms()
      notify('Cycle deleted')
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Imprest Periods</h2>
          <p className="text-sm text-ink-secondary">
            <strong>Period</strong> (e.g. Term 1 2025) → contains one or more <strong>Cycles</strong> → each cycle holds the vouchers
          </p>
        </div>
        <Button onClick={() => setShowTermModal(true)}>
          <Plus size={14} />
          New Period
        </Button>
      </div>

      {terms.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ink-secondary text-sm">No periods created yet.</p>
          <Button className="mt-3" onClick={() => setShowTermModal(true)}>
            <Plus size={14} /> Create First Period
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {terms.map(term => (
            <div key={term.id} className="card p-0 overflow-hidden">
              {/* Term Header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpand(term.id)}
              >
                <div className="flex items-center gap-3">
                  {expanded[term.id] ? <ChevronDown size={16} className="text-ink-secondary" /> : <ChevronRight size={16} className="text-ink-secondary" />}
                  <div>
                    <span className="text-md font-semibold text-ink">{periodLabel(term)}</span>
                    <span className="ml-3 text-xs text-ink-secondary">{(term.cycles || []).length} cycles</span>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => openCycleModal(term.id)}>
                    <Plus size={12} /> Add Cycle
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteTerm(term.id)}>
                    <Trash2 size={12} className="text-danger" />
                  </Button>
                </div>
              </div>

              {/* Cycles */}
              {expanded[term.id] && (
                <div className="border-t border-border">
                  {(term.cycles || []).length === 0 ? (
                    <div className="px-6 py-6 text-center bg-warning-light/40 border-l-4 border-warning">
                      <p className="text-sm text-ink mb-2 font-medium">No imprest cycles yet</p>
                      <p className="text-xs text-ink-secondary mb-3">
                        Add a cycle to record the opening balance, amount received, and start entering vouchers.
                      </p>
                      <Button size="sm" onClick={() => openCycleModal(term.id)}>
                        <Plus size={13} /> Add First Cycle
                      </Button>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-border">
                          <th className="text-left px-6 py-2 text-xs font-semibold text-ink-secondary uppercase tracking-wide">Cycle</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-ink-secondary uppercase tracking-wide">BFWD</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-ink-secondary uppercase tracking-wide">Received</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-ink-secondary uppercase tracking-wide">Spent</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-ink-secondary uppercase tracking-wide">Balance</th>
                          <th className="text-center px-4 py-2 text-xs font-semibold text-ink-secondary uppercase tracking-wide">Status</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(term.cycles || []).map(cycle => {
                          const netSpent = (cycle.total_spent || 0) - (cycle.total_brought_back || 0)
                          const balance = cycle.opening_balance + cycle.amount_received - netSpent
                          const isActive = cycle.id === activeCycleId
                          return (
                            <tr
                              key={cycle.id}
                              className={`border-b border-border last:border-0 cursor-pointer transition-colors ${isActive ? 'bg-accent-light' : 'hover:bg-gray-50'}`}
                              onClick={() => setActiveCycleId(cycle.id)}
                            >
                              <td className="px-6 py-2.5">
                                <div className="flex items-center gap-2">
                                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                                  <div>
                                    <p className="text-sm font-medium text-ink">{cycle.name}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums text-ink-secondary">{formatUGX(cycle.opening_balance)}</td>
                              <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums">{formatUGX(cycle.amount_received)}</td>
                              <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums text-warning">{formatUGX(cycle.total_spent || 0)}</td>
                              <td className={`px-4 py-2.5 text-right text-sm font-mono tabular-nums font-semibold ${balance < 0 ? 'text-danger' : 'text-success'}`}>
                                {formatUGX(balance)}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <Badge variant={cycle.status === 'active' ? 'success' : 'neutral'}>
                                  {cycle.status === 'active' ? 'Active' : 'Closed'}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-1 justify-end">
                                  {cycle.status === 'active' ? (
                                    <>
                                      <button
                                        title="Edit"
                                        className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-ink"
                                        onClick={() => openCycleModal(term.id, cycle)}
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        title="Close cycle (lock as read-only)"
                                        className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-warning"
                                        onClick={() => handleCloseCycle(cycle.id)}
                                      >
                                        <Lock size={13} />
                                      </button>
                                      <button
                                        title="Delete"
                                        className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-danger"
                                        onClick={() => handleDeleteCycle(cycle.id)}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="flex items-center gap-1 text-2xs text-ink-muted px-2">
                                        <ShieldCheck size={11} /> read-only
                                      </span>
                                      <button
                                        title="Re-open cycle (unlock)"
                                        className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-accent"
                                        onClick={() => handleReopenCycle(cycle.id)}
                                      >
                                        <Unlock size={13} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Term Modal */}
      <Modal
        open={showTermModal}
        onClose={() => setShowTermModal(false)}
        title="Create New Period"
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowTermModal(false)}>Cancel</Button>
          <Button onClick={handleCreateTerm} loading={saving}>Create Period</Button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className="field-label">Period Type <span className="text-danger">*</span></label>
            <select
              className="field-input"
              value={termForm.period_type}
              onChange={e => setTermForm(f => ({ ...f, period_type: e.target.value, term_number: '1' }))}
            >
              <option value="term">School Term (3 per year)</option>
              <option value="month">Month (12 per year)</option>
              <option value="quarter">Quarter (4 per year)</option>
              <option value="custom">Custom (free-form name)</option>
            </select>
          </div>

          {termForm.period_type !== 'custom' && (
            <div>
              <label className="field-label">{periodTypeLabel(termForm.period_type)} <span className="text-danger">*</span></label>
              <select
                className="field-input"
                value={termForm.term_number}
                onChange={e => setTermForm(f => ({ ...f, term_number: e.target.value }))}
              >
                {periodOptions(termForm.period_type).map(opt => (
                  <option key={opt.v} value={opt.v}>{opt.l}</option>
                ))}
              </select>
            </div>
          )}

          {termForm.period_type === 'custom' && (
            <Input
              label="Custom Period Name"
              placeholder="e.g. Project Alpha, Mid-year, FY 2025"
              value={termForm.custom_name}
              onChange={e => setTermForm(f => ({ ...f, custom_name: e.target.value }))}
              required
            />
          )}

          <Input
            label="Year"
            type="number"
            value={termForm.year}
            onChange={e => setTermForm(f => ({ ...f, year: e.target.value }))}
            min="2020"
            max="2040"
            required
          />

          {termForm.period_type === 'custom' && (
            <Input
              label="Sequence Number (within year)"
              type="number"
              value={termForm.term_number}
              onChange={e => setTermForm(f => ({ ...f, term_number: e.target.value }))}
              min="1"
              hint="Used to order custom periods. e.g. 1, 2, 3..."
            />
          )}
        </div>
      </Modal>

      {/* Create/Edit Cycle Modal */}
      <Modal
        open={showCycleModal}
        onClose={() => setShowCycleModal(false)}
        title={editCycle ? 'Edit Cycle' : 'Add Imprest Cycle'}
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCycleModal(false)}>Cancel</Button>
          <Button onClick={handleSaveCycle} loading={saving}>{editCycle ? 'Save Changes' : 'Create Cycle'}</Button>
        </>}
      >
        <div className="space-y-4">
          <Input
            label="Cycle Name (optional)"
            placeholder="e.g. 2nd Imprest Term 1 2025"
            value={cycleForm.name}
            onChange={e => setCycleForm(f => ({ ...f, name: e.target.value }))}
            hint="Leave blank to auto-generate"
          />
          <Input
            label="Opening Balance (B/F)"
            type="number"
            value={cycleForm.opening_balance}
            onChange={e => setCycleForm(f => ({ ...f, opening_balance: e.target.value }))}
            min="0"
            hint="Balance carried forward from previous cycle"
            required
          />
          <Input
            label="Amount Received"
            type="number"
            value={cycleForm.amount_received}
            onChange={e => setCycleForm(f => ({ ...f, amount_received: e.target.value }))}
            min="0"
            required
          />
          {cycleForm.opening_balance && cycleForm.amount_received && (
            <div className="bg-accent-light rounded px-3 py-2 text-sm">
              <span className="text-ink-secondary">Total Available: </span>
              <span className="font-semibold font-mono text-accent">
                UGX {formatUGX(Number(cycleForm.opening_balance) + Number(cycleForm.amount_received))}
              </span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
