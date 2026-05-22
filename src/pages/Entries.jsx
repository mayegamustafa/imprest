import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Lock, FolderPlus, Layers, RotateCcw, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import SearchableSelect from '../components/ui/SearchableSelect'
import useAppStore from '../store/appStore'
import { formatUGX, formatDate, formatDateInput } from '../lib/formatters'
import { validateEntry, validateSplits } from '../lib/validators'

const PAGE_SIZE = 50
const PURPOSE_PREFIX = 'Payment for '

export default function Entries() {
  const navigate = useNavigate()
  const { activeCycleId, setActiveCycleId, categories, terms, notify } = useAppStore()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [activeTab, setActiveTab] = useState('details')
  const [page, setPage] = useState(1)

  // ── Import state ──────────────────────────────────────────────────────────
  const [importRows, setImportRows]           = useState([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCatId, setImportCatId]         = useState(null)
  const [importing, setImporting]             = useState(false)
  const [importSkip, setImportSkip]           = useState({})

  const [form, setForm] = useState({
    date: formatDateInput(new Date().toISOString()),
    payee: '',
    purpose: PURPOSE_PREFIX,
    amount: '',
    balance_back: '',
    splits: {},               // multi-category mode
    single_category_id: null, // single-category mode
    multi_mode: false,
  })

  // ── Import handlers ──────────────────────────────────────────────────────
  async function handleImportClick() {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Excel File',
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
      })
      if (result.canceled || !result.filePaths?.[0]) return
      const fileOrPath = result.filePaths[0]
      const rows = await window.electronAPI.parseExcelFile(fileOrPath)
      setImportRows(rows)
      setImportSkip({})
      setImportCatId(categories[0]?.id || null)
      setShowImportModal(true)
    } catch (err) { notify(err.message, 'error') }
  }

  async function handleBulkImport() {
    const validRows = importRows.filter((r, i) => !importSkip[i] && !r._error)
    if (validRows.length === 0) { notify('No valid rows to import', 'error'); return }
    setImporting(true)
    try {
      const result = await window.electronAPI.bulkCreateEntries({
        cycle_id: activeCycleId,
        rows: validRows,
        default_category_id: importCatId || null,
      })
      notify(
        `Imported ${result.inserted} of ${validRows.length} entries` +
        (result.errors.length ? ` (${result.errors.length} failed)` : '')
      )
      setShowImportModal(false)
      loadEntries()
    } catch (err) { notify(err.message, 'error') }
    finally { setImporting(false) }
  }

  // Find active cycle
  let activeCycle = null
  for (const term of terms) {
    const found = (term.cycles || []).find(c => c.id === activeCycleId)
    if (found) { activeCycle = found; break }
  }
  const isCycleClosed = activeCycle?.status === 'closed'

  const loadEntries = useCallback(async () => {
    if (!activeCycleId) return
    setLoading(true)
    try {
      const data = await window.electronAPI.getEntries(activeCycleId)
      setEntries(data)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [activeCycleId])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Compute running balances
  const totalAvailable = activeCycle
    ? activeCycle.opening_balance + activeCycle.amount_received
    : 0

  let runningBalance = totalAvailable
  const entriesWithBalance = entries.map((e, i) => {
    runningBalance -= e.amount
    return { ...e, seq: i + 1, runningBalance }
  })

  const filtered = entriesWithBalance.filter(e =>
    !search ||
    e.payee.toLowerCase().includes(search.toLowerCase()) ||
    e.purpose.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalSpent = entries.reduce((s, e) => s + e.amount, 0)
  const totalBroughtBack = entries.reduce((s, e) => s + Number(e.balance_back || 0), 0)
  const netSpent = totalSpent - totalBroughtBack
  const balance = totalAvailable - netSpent
  const broughtBackEntries = entries.filter(e => Number(e.balance_back || 0) > 0)

  function openCreate() {
    setEditEntry(null)
    setForm({
      date: formatDateInput(new Date().toISOString()),
      payee: '',
      purpose: PURPOSE_PREFIX,
      amount: '',
      balance_back: '',
      splits: {},
      single_category_id: null,
      multi_mode: false,
    })
    setErrors({})
    setActiveTab('details')
    setShowModal(true)
  }

  function openEdit(entry) {
    setEditEntry(entry)
    const splitsMap = {}
    ;(entry.splits || []).forEach(sp => {
      splitsMap[sp.category_id] = String(sp.amount)
    })
    const splitCount = (entry.splits || []).filter(s => Number(s.amount) > 0).length
    setForm({
      date: formatDateInput(entry.date),
      payee: entry.payee,
      purpose: entry.purpose,
      amount: String(entry.amount),
      balance_back: entry.balance_back ? String(entry.balance_back) : '',
      splits: splitsMap,
      // Default to single-category if entry has 0 or 1 split
      single_category_id: splitCount === 1 ? entry.splits[0].category_id : null,
      multi_mode: splitCount > 1,
    })
    setErrors({})
    setActiveTab('details')
    setShowModal(true)
  }

  function updateSplit(catId, value) {
    setForm(f => ({ ...f, splits: { ...f.splits, [catId]: value } }))
  }

  // Computed: net amount (what was actually spent)
  const formAmount = Number(form.amount || 0)
  const formBalanceBack = Number(form.balance_back || 0)
  const formNet = Math.max(0, formAmount - formBalanceBack)

  // For multi-mode validation
  const splitTotal = Object.values(form.splits).reduce((s, v) => s + Number(v || 0), 0)
  const splitRemaining = formNet - splitTotal
  const splitsValid = formNet > 0 && Math.abs(splitRemaining) < 0.01

  function distributeToCategory(catId) {
    const allocated = Object.entries(form.splits)
      .filter(([k]) => k !== String(catId))
      .reduce((s, [, v]) => s + Number(v || 0), 0)
    const remaining = formNet - allocated
    if (remaining > 0) updateSplit(catId, String(remaining))
  }

  async function handleSave() {
    const errs = validateEntry(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setActiveTab('details')
      return
    }

    if (formBalanceBack > formAmount) {
      setErrors({ balance_back: 'Cannot exceed voucher amount' })
      setActiveTab('details')
      return
    }

    // Build splits depending on the mode
    let splits = []
    if (form.multi_mode) {
      splits = categories
        .filter(c => Number(form.splits[c.id] || 0) > 0)
        .map(c => ({ category_id: c.id, amount: Number(form.splits[c.id]) }))
    } else if (form.single_category_id) {
      // Single category gets the full NET amount
      if (formNet > 0) {
        splits = [{ category_id: form.single_category_id, amount: formNet }]
      }
    }

    const splitErr = validateSplits(splits, form.amount, form.balance_back || 0)
    if (splitErr) {
      notify(splitErr, 'error')
      setActiveTab('categories')
      return
    }

    setSaving(true)
    try {
      const payload = {
        cycle_id: activeCycleId,
        date: form.date,
        payee: form.payee.trim(),
        purpose: form.purpose.trim(),
        amount: formAmount,
        balance_back: formBalanceBack || 0,
        splits,
      }

      if (editEntry) {
        await window.electronAPI.updateEntry(editEntry.id, payload)
        notify('Entry updated')
      } else {
        await window.electronAPI.createEntry(payload)
        notify('Entry added')
      }
      setShowModal(false)
      loadEntries()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    try {
      await window.electronAPI.deleteEntry(id)
      notify('Entry deleted')
      loadEntries()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  if (!activeCycleId) {
    // Diagnose which step the user is on so the message is actionable
    const hasPeriods = terms.length > 0
    const allCycles = terms.flatMap(t => (t.cycles || []).map(c => ({ ...c, term: t })))
    const hasAnyCycle = allCycles.length > 0
    const activeCycles = allCycles.filter(c => c.status === 'active')

    return (
      <div className="card max-w-2xl mx-auto py-10 px-8 text-center mt-6">
        {!hasPeriods ? (
          <>
            <FolderPlus size={36} strokeWidth={1.25} className="mx-auto text-ink-muted mb-3" />
            <h2 className="text-lg font-semibold text-ink mb-1">Step 1 — Create a Period</h2>
            <p className="text-sm text-ink-secondary mb-5 max-w-md mx-auto">
              Periods (Term 1 2025, January 2025, Q1 2025…) are the time wrappers
              that group your imprest cycles. Create one to start.
            </p>
            <Button onClick={() => navigate('/terms')}>
              <Plus size={14} />
              Go to Periods
            </Button>
          </>
        ) : !hasAnyCycle ? (
          <>
            <Layers size={36} strokeWidth={1.25} className="mx-auto text-ink-muted mb-3" />
            <h2 className="text-lg font-semibold text-ink mb-1">Step 2 — Add an Imprest Cycle</h2>
            <p className="text-sm text-ink-secondary mb-5 max-w-md mx-auto">
              You have a period but no <strong>cycle</strong> inside it yet.
              A cycle holds the actual money: opening balance, amount received,
              and the vouchers you spend. <strong>Open the Periods page</strong>,
              expand your period, and click <strong>Add Cycle</strong>.
            </p>
            <Button onClick={() => navigate('/terms')}>
              <Plus size={14} />
              Add a Cycle
            </Button>
          </>
        ) : (
          <>
            <Layers size={36} strokeWidth={1.25} className="mx-auto text-ink-muted mb-3" />
            <h2 className="text-lg font-semibold text-ink mb-1">Pick a cycle to record into</h2>
            <p className="text-sm text-ink-secondary mb-5">
              Click one below to make it active.
            </p>
            <div className="space-y-1.5 text-left max-w-md mx-auto">
              {(activeCycles.length > 0 ? activeCycles : allCycles).map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveCycleId(c.id)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-border rounded hover:bg-accent-light hover:border-accent transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{c.name}</p>
                    <p className="text-2xs text-ink-muted">
                      {c.status === 'closed' ? '🔒 closed' : 'active'}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-ink-muted" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="field-input pl-8"
              placeholder="Search payee or purpose..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <span className="text-xs text-ink-secondary">{filtered.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleImportClick} disabled={isCycleClosed}>
            <Upload size={14} />
            Import Excel
          </Button>
          <Button onClick={openCreate} disabled={isCycleClosed}>
            <Plus size={14} />
            Add Entry
          </Button>
        </div>
      </div>

      {isCycleClosed && (
        <div className="bg-warning-light border border-warning/30 rounded px-4 py-2.5 text-sm flex items-center gap-2">
          <Lock size={14} className="text-warning shrink-0" />
          <span className="text-warning">
            <strong>This cycle is closed</strong> — entries are read-only. To make changes, re-open it from the Periods page.
          </span>
        </div>
      )}

      {/* Summary bar */}
      <div className={`grid gap-3 ${totalBroughtBack > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {[
          { label: 'Total Available', value: formatUGX(totalAvailable), color: 'text-ink' },
          { label: 'Total Spent', value: formatUGX(totalSpent), color: 'text-warning' },
          ...(totalBroughtBack > 0 ? [{ label: 'Brought Back', value: formatUGX(totalBroughtBack), color: 'text-accent' }] : []),
          { label: 'Balance', value: formatUGX(balance), color: balance < 0 ? 'text-danger' : 'text-success' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card py-3 text-center">
            <p className="text-xs text-ink-secondary uppercase tracking-wide font-semibold">{label}</p>
            <p className={`text-lg font-bold font-mono tabular-nums mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="fin-table">
            <thead>
              <tr>
                <th className="w-10">NO</th>
                <th className="w-24">DATE</th>
                <th>PAYEE</th>
                <th>PURPOSE</th>
                <th className="text-right">AMOUNT</th>
                <th className="text-right">BALANCE</th>
                <th className="w-16 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening rows */}
              <tr className="bg-gray-50">
                <td className="text-center text-ink-muted">—</td>
                <td className="text-ink-secondary text-xs font-medium">BAL B/FWD</td>
                <td colSpan={2}></td>
                <td className="money font-semibold">{formatUGX(activeCycle?.opening_balance)}</td>
                <td></td>
                <td></td>
              </tr>
              <tr className="bg-gray-50">
                <td className="text-center text-ink-muted">—</td>
                <td className="text-ink-secondary text-xs font-medium">RECEIVED</td>
                <td colSpan={2}></td>
                <td className="money font-semibold">{formatUGX(activeCycle?.amount_received)}</td>
                <td></td>
                <td></td>
              </tr>
              <tr className="bg-gray-50 border-b-2 border-border-strong">
                <td className="text-center text-ink-muted">—</td>
                <td className="text-ink-secondary text-xs font-medium">TOTAL</td>
                <td colSpan={2}></td>
                <td className="money font-bold">{formatUGX(totalAvailable)}</td>
                <td></td>
                <td></td>
              </tr>

              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-ink-muted">Loading...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-ink-muted">No entries found.</td></tr>
              ) : paged.map(entry => (
                <tr key={entry.id}>
                  <td className="text-center text-ink-secondary text-xs">{entry.voucher_number}</td>
                  <td className="text-xs text-ink-secondary">{formatDate(entry.date)}</td>
                  <td className="font-medium">{entry.payee}</td>
                  <td className="text-ink-secondary text-sm">{entry.purpose}</td>
                  <td className="money text-ink">{formatUGX(entry.amount)}</td>
                  <td className={`money font-medium ${entry.runningBalance < 0 ? 'text-danger' : 'text-ink'}`}>
                    {formatUGX(entry.runningBalance)}
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      {isCycleClosed ? (
                        <Lock size={11} className="text-ink-muted" />
                      ) : (
                        <>
                          <button onClick={() => openEdit(entry)} className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-ink">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(entry.id)} className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-danger">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {/* Total row */}
              {!loading && entries.length > 0 && (
                <>
                  <tr className="border-t-2 border-border-strong bg-gray-50 font-bold">
                    <td colSpan={4} className="text-right pr-4 text-sm">TOTAL AMOUNT SPENT</td>
                    <td className="money text-warning">{formatUGX(totalSpent)}</td>
                    <td className="money">{formatUGX(totalAvailable - totalSpent)}</td>
                    <td></td>
                  </tr>

                  {/* Balances brought back, listed below total spent */}
                  {broughtBackEntries.length > 0 && (
                    <>
                      <tr className="bg-accent-light/30">
                        <td colSpan={7} className="text-xs font-semibold text-accent uppercase tracking-wide px-3 py-2">
                          Balances Brought Back
                        </td>
                      </tr>
                      {broughtBackEntries.map(e => (
                        <tr key={`bb-${e.id}`} className="bg-accent-light/10">
                          <td className="text-center text-xs text-ink-secondary">{e.voucher_number}</td>
                          <td className="text-xs text-ink-secondary">{formatDate(e.date)}</td>
                          <td className="text-sm">{e.payee}</td>
                          <td className="text-xs text-ink-secondary italic">unspent — returned</td>
                          <td className="money text-accent">+{formatUGX(e.balance_back)}</td>
                          <td></td>
                          <td></td>
                        </tr>
                      ))}
                      <tr className="bg-accent-light/30 font-bold">
                        <td colSpan={4} className="text-right pr-4 text-sm">TOTAL BROUGHT BACK</td>
                        <td className="money text-accent">+{formatUGX(totalBroughtBack)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                      <tr className="border-t-2 border-border-strong bg-gray-100 font-bold">
                        <td colSpan={4} className="text-right pr-4 text-sm">NET SPENT</td>
                        <td className="money text-warning">{formatUGX(netSpent)}</td>
                        <td className={`money ${balance < 0 ? 'text-danger' : 'text-success'}`}>{formatUGX(balance)}</td>
                        <td></td>
                      </tr>
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-gray-50">
            <span className="text-xs text-ink-secondary">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={13} />
              </Button>
              <Button size="sm" variant="ghost" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={13} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editEntry ? `Edit Entry #${editEntry.voucher_number}` : 'Add Expenditure Entry'}
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            {editEntry ? 'Save Changes' : 'Add Entry'}
          </Button>
        </>}
      >
        {/* Tabs */}
        <div className="flex border-b border-border mb-4">
          {['details', 'categories'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
            >
              {tab === 'details' ? 'Voucher Details' : 'Category'}
              {tab === 'categories' && form.amount && (() => {
                let ok = false
                if (formNet === 0) ok = true
                else if (form.multi_mode) ok = splitsValid
                else ok = !!form.single_category_id
                return (
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${ok ? 'bg-success-light text-success' : 'bg-gray-100 text-ink-muted'}`}>
                    {ok ? '✓' : '…'}
                  </span>
                )
              })()}
            </button>
          ))}
        </div>

        {activeTab === 'details' ? (
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              error={errors.date}
              required
            />
            <Input
              label="Amount (UGX)"
              type="number"
              placeholder="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              error={errors.amount}
              required
            />
            <Input
              label="Payee Name"
              placeholder="e.g. NANSAMBA JOYCE"
              value={form.payee}
              onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
              error={errors.payee}
              className="col-span-2"
              required
            />
            <Textarea
              label="Purpose"
              placeholder="e.g. Payment for first aid drugs"
              value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
              onFocus={e => {
                if (!form.purpose) setForm(f => ({ ...f, purpose: PURPOSE_PREFIX }))
                // place cursor at end
                requestAnimationFrame(() => {
                  e.target.selectionStart = e.target.value.length
                  e.target.selectionEnd = e.target.value.length
                })
              }}
              error={errors.purpose}
              className="col-span-2"
              rows={2}
              required
            />
            <div className="col-span-2">
              <Input
                label="Balance Brought Back (optional)"
                type="number"
                placeholder="0"
                value={form.balance_back}
                onChange={e => setForm(f => ({ ...f, balance_back: e.target.value }))}
                error={errors.balance_back}
                hint={
                  formBalanceBack > 0
                    ? `Net spent will be UGX ${formatUGX(formNet)} (${formatUGX(formAmount)} − ${formatUGX(formBalanceBack)} returned)`
                    : 'Leave blank if the full amount was spent. Otherwise enter what was returned unspent.'
                }
                min="0"
              />
            </div>
          </div>
        ) : (
          <div>
            {!form.amount ? (
              <p className="text-sm text-ink-muted text-center py-6">
                Enter the voucher amount first (in Voucher Details tab).
              </p>
            ) : formNet === 0 ? (
              <div className="bg-accent-light/50 border border-accent/30 rounded px-3 py-3 text-sm">
                <p className="text-ink">
                  <strong>Net spent is 0</strong> — the entire voucher was returned, so no category needs to be assigned.
                </p>
              </div>
            ) : (
              <>
                {/* Net summary */}
                <div className="bg-accent-light/40 border border-accent/20 rounded px-3 py-2 mb-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Voucher amount:</span>
                    <span className="font-mono font-semibold">UGX {formatUGX(form.amount)}</span>
                  </div>
                  {formBalanceBack > 0 && (
                    <>
                      <div className="flex items-center justify-between text-accent">
                        <span>Less brought back:</span>
                        <span className="font-mono font-semibold">−UGX {formatUGX(formBalanceBack)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-accent/30 pt-1.5 mt-1.5 font-bold">
                        <span>Net spent (assign to categories):</span>
                        <span className="font-mono">UGX {formatUGX(formNet)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Mode toggle */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
                    {form.multi_mode ? 'Split across multiple categories' : 'Pick a category'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, multi_mode: !f.multi_mode }))}
                    className="text-xs text-accent hover:underline"
                  >
                    {form.multi_mode ? '← back to single category' : 'split across multiple →'}
                  </button>
                </div>

                {!form.multi_mode ? (
                  /* ─── Single-category dropdown (default mode) ────────────── */
                  <SearchableSelect
                    options={categories.map(c => ({ value: c.id, label: c.name }))}
                    value={form.single_category_id}
                    onChange={(id) => setForm(f => ({ ...f, single_category_id: id }))}
                    placeholder="Select a category…"
                  />
                ) : (
                  /* ─── Multi-category split (advanced mode) ────────────────── */
                  <>
                    <div className={`flex items-center justify-between rounded px-3 py-2 mb-3 text-sm ${
                      splitsValid ? 'bg-success-light' : 'bg-warning-light'
                    }`}>
                      <span className="text-ink-secondary">Allocated:</span>
                      <span className="font-mono font-semibold">{formatUGX(splitTotal)}</span>
                      <span className={`font-mono font-semibold ${splitsValid ? 'text-success' : 'text-warning'}`}>
                        {splitsValid
                          ? '✓ Balanced'
                          : `Remaining: ${formatUGX(Math.abs(splitRemaining))}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                      {categories.map(cat => (
                        <div key={cat.id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <label className="text-xs text-ink-secondary font-medium truncate block">{cat.name}</label>
                            <input
                              type="number"
                              className="field-input text-right font-mono text-sm mt-0.5"
                              placeholder="0"
                              value={form.splits[cat.id] || ''}
                              onChange={e => updateSplit(cat.id, e.target.value)}
                              min="0"
                            />
                          </div>
                          {splitRemaining > 0.01 && !form.splits[cat.id] && (
                            <button
                              type="button"
                              title="Assign remaining"
                              onClick={() => distributeToCategory(cat.id)}
                              className="mt-5 text-xs text-accent hover:underline shrink-0"
                            >
                              +Rest
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-ink-muted mt-3">
                      Sum of category amounts must equal the net spent (UGX {formatUGX(formNet)}).
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Import Preview Modal */}
      <Modal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import from Excel"
        size="xl"
        footer={<>
          <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
          <Button
            onClick={handleBulkImport}
            loading={importing}
            disabled={importRows.filter((r, i) => !importSkip[i] && !r._error).length === 0}
          >
            Import {importRows.filter((r, i) => !importSkip[i] && !r._error).length} entries
          </Button>
        </>}
      >
        {/* Summary */}
        <div className="flex items-center gap-4 mb-3 text-sm">
          <span className="text-ink">{importRows.length} rows found</span>
          <span className="text-success">{importRows.filter(r => !r._error).length} valid</span>
          {importRows.some(r => r._error) && (
            <span className="text-danger">{importRows.filter(r => r._error).length} with errors</span>
          )}
        </div>

        {/* Default category */}
        {categories.length > 0 && (
          <div className="mb-3">
            <label className="field-label">Default Category (applied to all imported rows)</label>
            <select
              className="field-input"
              value={importCatId || ''}
              onChange={e => setImportCatId(Number(e.target.value) || null)}
            >
              <option value="">— none (assign later) —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Preview table */}
        <div className="overflow-auto max-h-80 border border-border rounded">
          <table className="fin-table">
            <thead>
              <tr>
                <th className="w-8">✓</th>
                <th>DATE</th>
                <th>PAYEE</th>
                <th>PURPOSE</th>
                <th className="text-right">AMOUNT</th>
                <th className="text-right">B/B</th>
              </tr>
            </thead>
            <tbody>
              {importRows.map((r, i) => (
                <tr
                  key={i}
                  className={
                    r._error
                      ? 'bg-red-50'
                      : importSkip[i]
                        ? 'opacity-40'
                        : ''
                  }
                >
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={!importSkip[i] && !r._error}
                      disabled={!!r._error}
                      onChange={e => setImportSkip(s => ({ ...s, [i]: !e.target.checked }))}
                    />
                  </td>
                  <td className="text-xs">{r.date}</td>
                  <td className="text-sm">{r.payee}</td>
                  <td className="text-xs text-ink-secondary">
                    {r._error
                      ? <span className="text-danger font-medium">{r._error}</span>
                      : r.purpose
                    }
                  </td>
                  <td className="money text-sm">{r.amount ? formatUGX(r.amount) : '—'}</td>
                  <td className="money text-sm text-accent">
                    {r.balance_back > 0 ? formatUGX(r.balance_back) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}
