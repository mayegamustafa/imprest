import { useState, useEffect, useCallback, useMemo } from 'react'
import { FileText, Download, Printer, FileSpreadsheet, Layers } from 'lucide-react'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import FilterBar from '../components/FilterBar'
import useFilterParams from '../hooks/useFilterParams'
import useAppStore from '../store/appStore'
import { periodLabel, formatUGX } from '../lib/formatters'

const REPORT_TYPES = [
  { value: 'ledger',            label: 'Imprest Ledger',        scope: 'cycle' },
  { value: 'abstract',          label: 'Expenditure Abstract',  scope: 'cycle' },
  { value: 'consolidated',      label: 'Consolidated Abstract', scope: 'filters' },
  { value: 'budget',            label: 'Budget Performance',    scope: 'term' },
  { value: 'trends',            label: 'Category Trends',       scope: 'filters' },
  { value: 'financial_summary', label: 'Financial Summary',     scope: 'filters' },
  { value: 'full_workbook',     label: 'Full Workbook (Excel)', scope: 'filters' },
]

export default function Reports() {
  const { terms, activeCycleId } = useAppStore()
  const { filters, setFilter, setFilters, reset } = useFilterParams()

  const [selectedCycleId, setSelectedCycleId] = useState(activeCycleId || '')
  const [reportType, setReportType] = useState('ledger')
  const [includeBalance, setIncludeBalance] = useState(true)
  const [previewHtml, setPreviewHtml] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [scopeMessage, setScopeMessage] = useState('')

  const currentType = REPORT_TYPES.find(t => t.value === reportType)
  const scope = currentType?.scope || 'cycle'
  const isPdfSupported = reportType !== 'full_workbook'

  // Flatten cycles for cycle picker
  const allCycles = useMemo(() => {
    const result = []
    for (const term of terms) {
      for (const cycle of (term.cycles || [])) {
        result.push({ ...cycle, termLabel: periodLabel(term) })
      }
    }
    return result
  }, [terms])

  useEffect(() => {
    if (activeCycleId && !selectedCycleId) setSelectedCycleId(activeCycleId)
  }, [activeCycleId])

  // What "subject" do we send the generator? Depends on scope.
  function buildSubject() {
    if (scope === 'cycle') return Number(selectedCycleId)
    if (scope === 'term') {
      if (!filters.term_id) {
        throw new Error('Pick a Term in the filter bar — this report is per-term.')
      }
      return filters.term_id
    }
    if (reportType === 'full_workbook') {
      return { cycleId: selectedCycleId ? Number(selectedCycleId) : null, filters }
    }
    return filters
  }

  const loadPreview = useCallback(async () => {
    setScopeMessage('')
    setLoadingPreview(true)
    try {
      let html = ''
      if (scope === 'cycle') {
        if (!selectedCycleId) {
          setPreviewHtml('')
          setScopeMessage('Pick a cycle to preview this report.')
          return
        }
        if (reportType === 'ledger') {
          const data = await window.electronAPI.getLedgerData(Number(selectedCycleId))
          html = await buildLedgerPreviewHTML(data, { includeBalance })
        } else if (reportType === 'abstract') {
          const data = await window.electronAPI.getAbstractData(Number(selectedCycleId))
          html = await buildAbstractPreviewHTML(data)
        }
      } else if (scope === 'term') {
        if (!filters.term_id) {
          setPreviewHtml('')
          setScopeMessage('Pick a Term in the filter bar — this report is per-term.')
          return
        }
        const data = await window.electronAPI.getBudgetSummary(filters.term_id)
        html = await buildBudgetPreviewHTML(data)
      } else if (reportType === 'consolidated') {
        const data = await window.electronAPI.getConsolidatedAbstract(filters)
        html = await buildConsolidatedPreviewHTML(data)
      } else if (reportType === 'trends') {
        const data = await window.electronAPI.getCategoryTrends(filters)
        html = await buildTrendsPreviewHTML(data)
      } else if (reportType === 'financial_summary') {
        const metrics = await window.electronAPI.getDashboardMetrics(filters)
        const topCats = await window.electronAPI.getTopCategories(filters, 5)
        const budgetSummary = filters.term_id ? await window.electronAPI.getBudgetSummary(filters.term_id) : null
        html = await buildSummaryPreviewHTML({ metrics, topCategories: topCats, budgetSummary })
      } else if (reportType === 'full_workbook') {
        setPreviewHtml('')
        setScopeMessage('Full Workbook is Excel-only — click "Export Excel" to generate.')
        return
      }
      setPreviewHtml(html)
    } catch (err) {
      console.error(err)
      setScopeMessage(err.message)
      setPreviewHtml('')
    } finally {
      setLoadingPreview(false)
    }
  }, [selectedCycleId, reportType, includeBalance, JSON.stringify(filters), scope])

  useEffect(() => { loadPreview() }, [loadPreview])

  async function handleExportPDF() {
    setExporting(true)
    try {
      const subject = buildSubject()
      await window.electronAPI.exportPDF(reportType, subject, { includeBalance })
    } catch (err) {
      alert(err.message)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportExcel(typeOverride) {
    const useType = typeOverride || reportType
    setExportingExcel(true)
    try {
      const subject = (REPORT_TYPES.find(t => t.value === useType)?.scope === 'cycle')
        ? Number(selectedCycleId)
        : useType === 'budget'
          ? (filters.term_id || null)
          : useType === 'full_workbook'
            ? { cycleId: selectedCycleId ? Number(selectedCycleId) : null, filters }
            : filters
      if (subject === null || (subject !== undefined && (subject === '' || (typeof subject === 'number' && !subject)))) {
        throw new Error('Missing required selection — pick a cycle or set filters first.')
      }
      await window.electronAPI.exportExcel(useType, subject, { includeBalance })
    } catch (err) {
      alert(err.message)
    } finally {
      setExportingExcel(false)
    }
  }

  function handlePrint() {
    const iframe = document.getElementById('report-preview')
    if (iframe) iframe.contentWindow.print()
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Controls */}
      <div className="card shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <Select
            label="Report Type"
            value={reportType}
            onChange={e => setReportType(e.target.value)}
            className="min-w-[220px]"
          >
            {REPORT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>

          {/* Cycle picker — for cycle-scoped reports */}
          {(scope === 'cycle' || reportType === 'full_workbook') && (
            <Select
              label={reportType === 'full_workbook' ? 'Cycle (optional)' : 'Cycle'}
              value={selectedCycleId}
              onChange={e => setSelectedCycleId(e.target.value)}
              className="min-w-[260px]"
            >
              <option value="">{reportType === 'full_workbook' ? 'No specific cycle' : 'Select a cycle...'}</option>
              {allCycles.map(c => (
                <option key={c.id} value={c.id}>{c.termLabel} — {c.name}</option>
              ))}
            </Select>
          )}

          {/* Include-balance toggle for ledger */}
          {reportType === 'ledger' && (
            <label className="flex items-center gap-2 mt-5 px-3 py-1.5 border border-border rounded cursor-pointer hover:border-accent hover:bg-accent-light/30 transition-colors select-none">
              <input
                type="checkbox"
                checked={includeBalance}
                onChange={e => setIncludeBalance(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span className="text-sm text-ink">Include running balance column</span>
            </label>
          )}

          <div className="flex gap-2 mt-4 flex-wrap">
            {isPdfSupported && (
              <>
                <Button variant="secondary" onClick={handlePrint} disabled={!previewHtml}>
                  <Printer size={14} /> Print
                </Button>
                <Button onClick={handleExportPDF} loading={exporting}>
                  <Download size={14} /> Export PDF
                </Button>
              </>
            )}
            <Button
              variant={isPdfSupported ? 'secondary' : 'primary'}
              onClick={() => handleExportExcel()}
              loading={exportingExcel}
            >
              <FileSpreadsheet size={14} /> Export Excel
            </Button>
            {scope === 'cycle' && (
              <Button
                variant="secondary"
                onClick={() => handleExportExcel('combined')}
                loading={exportingExcel}
                title="Single .xlsx with both Ledger and Abstract sheets"
              >
                <FileSpreadsheet size={14} /> Excel (Combined)
              </Button>
            )}
            {scope !== 'cycle' && reportType !== 'full_workbook' && (
              <Button
                variant="secondary"
                onClick={() => handleExportExcel('full_workbook')}
                loading={exportingExcel}
                title="Full multi-sheet workbook combining all analytics reports"
              >
                <Layers size={14} /> Full Workbook
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar — only for analytics/term-scoped reports */}
      {scope !== 'cycle' && (
        <FilterBar
          filters={filters}
          setFilter={setFilter}
          setFilters={setFilters}
          reset={reset}
        />
      )}

      {/* Preview */}
      <div className="card p-0 flex-1 min-h-0 overflow-hidden">
        {scopeMessage ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-ink-muted px-6">
            <FileText size={36} strokeWidth={1} className="mb-3" />
            <p className="text-sm">{scopeMessage}</p>
          </div>
        ) : loadingPreview ? (
          <div className="flex items-center justify-center h-64 text-ink-muted text-sm">
            Generating preview...
          </div>
        ) : previewHtml ? (
          <iframe
            id="report-preview"
            srcDoc={previewHtml}
            className="w-full h-full border-0"
            style={{ minHeight: '600px' }}
            title="Report Preview"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center text-ink-muted px-6">
            <FileText size={36} strokeWidth={1} className="mb-3" />
            <p className="text-sm">Make a selection above to preview the report.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Preview helpers (mirror the PDF templates) ─────────────────────────────
function fmt(n) {
  if (!n && n !== 0) return ''
  const num = Number(n)
  if (isNaN(num)) return ''
  return num.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getDate()}.${dt.getMonth() + 1}.${String(dt.getFullYear()).slice(2)}`
}
function upper(s) { return s == null ? '' : String(s).toUpperCase() }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}
function periodLabelPreview(cycle) {
  const months = ['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  if (cycle.period_type === 'month') return `${months[cycle.term_number] || cycle.term_number} ${cycle.year}`
  if (cycle.period_type === 'quarter') return `Q${cycle.term_number} ${cycle.year}`
  if (cycle.period_type === 'custom') return ((cycle.custom_name || `PERIOD ${cycle.term_number}`).toUpperCase()) + ` ${cycle.year}`
  return `TERM ${cycle.term_number}, ${cycle.year}`
}
function statusColor(util) {
  if (util == null) return '#9CA3AF'
  if (util >= 100) return '#DC2626'
  if (util >= 90) return '#EA580C'
  if (util >= 70) return '#D97706'
  return '#059669'
}

async function getSchoolOnce() {
  if (!window.__cachedSchool) window.__cachedSchool = await window.electronAPI.getSchoolConfig()
  return window.__cachedSchool
}

async function buildLedgerPreviewHTML(data, opts = {}) {
  const school = await getSchoolOnce()
  const includeBalance = opts.includeBalance !== false
  const { cycle, entries, signatories } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')
  const totalAvailable = cycle.opening_balance + cycle.amount_received
  const totalSpent = entries.reduce((s, e) => s + e.amount, 0)
  const totalBroughtBack = entries.reduce((s, e) => s + Number(e.balance_back || 0), 0)
  const netSpent = totalSpent - totalBroughtBack
  const closing = totalAvailable - netSpent
  const broughtBackEntries = entries.filter(e => Number(e.balance_back || 0) > 0)

  let runBal = totalAvailable
  const rows = entries.map((e, i) => { runBal -= e.amount; return { ...e, seq: i + 1, runBal } })

  const sigs = (signatories || []).map(s =>
    `<div style="flex:1;text-align:center;min-width:0">
      <div style="border-top:1px solid #000;margin-bottom:4px;margin-top:24px"></div>
      <div style="font-weight:bold;font-size:8pt">${escapeHtml(upper(s.name))}</div>
      <div style="font-size:7.5pt">${escapeHtml(upper(s.title))}</div>
    </div>`
  ).join('')

  const entryRows = rows.map(e =>
    `<tr>
      <td style="text-align:center;border:1px solid #000;padding:2px 4px">${e.seq}</td>
      <td style="text-align:center;border:1px solid #000;padding:2px 4px">${fmtDate(e.date)}</td>
      <td style="border:1px solid #000;padding:2px 4px">${escapeHtml(upper(e.payee))}</td>
      <td style="border:1px solid #000;padding:2px 4px">${escapeHtml(upper(e.purpose))}</td>
      <td style="text-align:right;border:1px solid #000;padding:2px 6px;font-family:monospace">${fmt(e.amount)}</td>
      ${includeBalance ? `<td style="text-align:right;border:1px solid #000;padding:2px 6px;font-family:monospace">${fmt(e.runBal)}</td>` : ''}
    </tr>`
  ).join('')

  const bbRows = broughtBackEntries.map(e =>
    `<tr style="background:#f0f4f8">
      <td style="text-align:center;border:1px solid #000;padding:2px 4px">${rows.find(r => r.id === e.id)?.seq ?? ''}</td>
      <td style="text-align:center;border:1px solid #000;padding:2px 4px">${fmtDate(e.date)}</td>
      <td style="border:1px solid #000;padding:2px 4px">${escapeHtml(upper(e.payee))}</td>
      <td style="border:1px solid #000;padding:2px 4px;font-style:italic;color:#555">UNSPENT — RETURNED</td>
      <td style="text-align:right;border:1px solid #000;padding:2px 6px;font-family:monospace;color:#1F4F8B">+${fmt(e.balance_back)}</td>
      ${includeBalance ? '<td style="border:1px solid #000;padding:2px 4px"></td>' : ''}
    </tr>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Courier New',monospace;font-size:10pt;padding:20px;background:#fff;color:#000}
    h1{font-size:12pt;text-align:center;text-transform:uppercase;margin:0}
    h2{font-size:11pt;text-align:center;margin:4px 0}
    .summary{text-align:center;font-size:9pt;margin:4px 0 10px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{border:1px solid #000;padding:3px 5px;background:#f0f0f0;font-weight:bold;text-align:center;font-size:9pt}
    td{border:1px solid #000;padding:2px 4px;font-size:9pt}
    .open-row td{background:#fafafa;font-weight:bold}
    .total-row td{border-top:2px solid #000;font-weight:bold;background:#f5f5f5}
    .acc{margin-top:14px;border:1px solid #000;padding:8px 12px}
    .acc h3{font-size:9pt;font-weight:bold;margin:0 0 6px;text-transform:uppercase}
    .acc-r{display:flex;justify-content:space-between;font-size:8.5pt;margin:2px 0}
    .sigs{display:flex;gap:12px;margin-top:24px;justify-content:space-between}
  </style></head><body>
    <h1>${escapeHtml(schoolName)}${location ? ' — ' + escapeHtml(location) : ''}</h1>
    <h2>${cycle.cycle_number > 0 ? ['1ST','2ND','3RD','4TH','5TH','6TH'][cycle.cycle_number-1] || cycle.cycle_number+'TH' : ''} IMPREST ACCOUNTABILITY FOR ${periodLabelPreview(cycle)}</h2>
    <div class="summary">BFWD: ${fmt(cycle.opening_balance)}&nbsp;&nbsp; RECEIVED: ${fmt(cycle.amount_received)}&nbsp;&nbsp; AMOUNT SPENT: ${fmt(totalSpent)}/=${totalBroughtBack > 0 ? `&nbsp;&nbsp; BROUGHT BACK: ${fmt(totalBroughtBack)}/=` : ''}&nbsp;&nbsp; BAL: ${fmt(closing)}/=</div>
    <table>
      <thead><tr>
        <th style="width:30px">NO</th>
        <th style="width:70px">DATE</th>
        <th>NAME</th>
        <th>PURPOSE</th>
        <th style="width:100px">AMOUNT</th>
        ${includeBalance ? '<th style="width:105px">BALANCE</th>' : ''}
      </tr></thead>
      <tbody>
        <tr class="open-row"><td></td><td style="text-align:center">BAL B/FWD</td><td></td><td></td><td style="text-align:right;font-family:monospace">${fmt(cycle.opening_balance)}</td>${includeBalance ? '<td></td>' : ''}</tr>
        <tr class="open-row"><td></td><td style="text-align:center">RECEIVED</td><td></td><td></td><td style="text-align:right;font-family:monospace">${fmt(cycle.amount_received)}</td>${includeBalance ? '<td></td>' : ''}</tr>
        <tr class="open-row"><td></td><td style="text-align:center">TOTAL</td><td></td><td></td><td style="text-align:right;font-family:monospace;font-weight:bold">${fmt(totalAvailable)}</td>${includeBalance ? '<td></td>' : ''}</tr>
        ${entryRows}
        <tr class="total-row"><td colspan="4" style="text-align:right;padding-right:8px">TOTAL AMOUNT SPENT</td><td style="text-align:right;font-family:monospace">${fmt(totalSpent)}</td>${includeBalance ? `<td style="text-align:right;font-family:monospace">${fmt(totalAvailable - totalSpent)}</td>` : ''}</tr>
        ${broughtBackEntries.length > 0 ? `
          <tr><td colspan="${includeBalance ? 6 : 5}" style="background:#e8f0f5;padding:4px 8px;font-size:8.5pt;font-weight:bold;text-transform:uppercase;border:1px solid #000">Balances Brought Back</td></tr>
          ${bbRows}
          <tr class="total-row" style="background:#e8f0f5"><td colspan="4" style="text-align:right;padding-right:8px">TOTAL BROUGHT BACK</td><td style="text-align:right;font-family:monospace;color:#1F4F8B">+${fmt(totalBroughtBack)}</td>${includeBalance ? '<td></td>' : ''}</tr>
          <tr class="total-row" style="background:#f5f5f5;border-top:2px solid #000"><td colspan="4" style="text-align:right;padding-right:8px">NET SPENT</td><td style="text-align:right;font-family:monospace">${fmt(netSpent)}</td>${includeBalance ? `<td style="text-align:right;font-family:monospace">${fmt(closing)}</td>` : ''}</tr>
        ` : ''}
      </tbody>
    </table>
    <div class="acc">
      <h3>Accountability</h3>
      <div class="acc-r"><span>Total Received:</span><span style="font-family:monospace;font-weight:bold">${fmt(totalAvailable)}/=</span></div>
      <div class="acc-r"><span>Total Amount Spent:</span><span style="font-family:monospace;font-weight:bold">${fmt(totalSpent)}/=</span></div>
      ${totalBroughtBack > 0 ? `
        <div class="acc-r"><span>Less: Balances Brought Back:</span><span style="font-family:monospace;font-weight:bold">(${fmt(totalBroughtBack)})/=</span></div>
        <div class="acc-r" style="border-top:1px solid #999;padding-top:3px;margin-top:3px"><span>Net Spent:</span><span style="font-family:monospace;font-weight:bold">${fmt(netSpent)}/=</span></div>
      ` : ''}
      <div class="acc-r" style="border-top:1px solid #000;padding-top:3px;margin-top:3px"><span>Balance Carried Forward:</span><span style="font-family:monospace;font-weight:bold">${fmt(closing)}/=</span></div>
    </div>
    <div class="sigs">${sigs}</div>
  </body></html>`
}

async function buildAbstractPreviewHTML(data) {
  const school = await getSchoolOnce()
  const { cycle, categories, rows, categoryTotals } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')
  const totalAvailable = cycle.opening_balance + cycle.amount_received
  const grandTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0)
  const closing = totalAvailable - grandTotal

  const headers = categories.map(c =>
    `<th style="border:1px solid #000;padding:2px 1px;font-size:7pt;text-align:center;background:#e8e8e8;max-width:72px;word-break:break-word;line-height:1.1">${escapeHtml(upper(c.name))}</th>`
  ).join('')

  const dataRows = rows.map(row => {
    const rowTotal = Object.values(row.splits).reduce((s, v) => s + v, 0)
    const cells = categories.map(c => {
      const amt = row.splits[c.id] || 0
      return `<td style="border:1px solid #000;padding:1px 3px;text-align:right;font-size:7pt;font-family:monospace">${amt > 0 ? fmt(amt) : ''}</td>`
    }).join('')
    return `<tr><td style="border:1px solid #000;padding:1px 3px;text-align:center;font-size:7pt;font-weight:bold">${row.voucher_number}</td>${cells}<td style="border:1px solid #000;padding:1px 3px;text-align:right;font-size:7pt;font-family:monospace;font-weight:bold;background:#f8f8f8">${fmt(rowTotal)}</td></tr>`
  }).join('')

  const totalCells = categories.map(c =>
    `<td style="border:1px solid #000;padding:1px 3px;text-align:right;font-size:7pt;font-family:monospace;font-weight:bold;background:#efefef">${(categoryTotals[c.id]||0)>0?fmt(categoryTotals[c.id]):''}</td>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Courier New',monospace;font-size:8pt;padding:10px;background:#fff;color:#000}
    h1{font-size:9.5pt;text-align:center;text-transform:uppercase;margin:0}
    h2{font-size:8.5pt;text-align:center;margin:2px 0}
    .sum{text-align:center;font-size:7.5pt;margin:3px 0 6px}
    table{width:100%;border-collapse:collapse}
    @media print{@page{size:A4 landscape}}
  </style></head><body>
    <h1>${escapeHtml(schoolName)}${location ? ' — ' + escapeHtml(location) : ''}</h1>
    <h2>IMPREST ACCOUNTABILITY ABSTRACT FOR ${periodLabelPreview(cycle)} — CYCLE ${cycle.cycle_number}</h2>
    <div class="sum">AMOUNT RECEIVED: ${fmt(cycle.amount_received)}&nbsp;&nbsp; BALANCE B/F: ${fmt(cycle.opening_balance)}&nbsp;&nbsp; AMOUNT SPENT: ${fmt(grandTotal)}&nbsp;&nbsp; BALANCE: ${fmt(closing)}</div>
    <table>
      <thead><tr>
        <th style="border:1px solid #000;padding:2px 3px;font-size:7.5pt;background:#e8e8e8;width:24px">VR<br>NO.</th>
        ${headers}
        <th style="border:1px solid #000;padding:2px 3px;font-size:7.5pt;background:#e8e8e8;width:64px">TOTAL</th>
      </tr></thead>
      <tbody>${dataRows}</tbody>
      <tfoot>
        <tr style="font-weight:bold;background:#efefef">
          <td style="border:1px solid #000;padding:1px 3px;text-align:center;font-size:7pt;border-top:2px solid #000">tt</td>
          ${totalCells}
          <td style="border:1px solid #000;border-top:2px solid #000;padding:1px 3px;text-align:right;font-size:7.5pt;font-family:monospace;font-weight:bold">${fmt(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </body></html>`
}

async function buildConsolidatedPreviewHTML(data) {
  const school = await getSchoolOnce()
  const { cycles, categories, matrix, category_totals, cycle_totals, grand_total, scope_label } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')

  const headerCells = cycles.map(cyc =>
    `<th>${cyc.year}/T${cyc.term_number}<br>C${cyc.cycle_number}</th>`
  ).join('')

  const dataRows = categories.map(cat => {
    const cells = cycles.map(cyc =>
      `<td class="m">${fmt(matrix[cat.id]?.[cyc.id] || 0)}</td>`
    ).join('')
    return `<tr><td class="n">${escapeHtml(upper(cat.name))}</td>${cells}<td class="m tot">${fmt(category_totals[cat.id] || 0)}</td></tr>`
  }).join('')

  const totalCells = cycles.map(cyc => `<td class="m tot">${fmt(cycle_totals[cyc.id] || 0)}</td>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Courier New',monospace;font-size:8pt;padding:10px;color:#000;background:#fff}
    h1{font-size:10pt;text-align:center;text-transform:uppercase;margin:0}
    h2{font-size:9pt;text-align:center;margin:2px 0}
    .scope{font-size:8pt;text-align:center;color:#444;margin:2px 0 6px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #000;padding:2px 4px;font-size:7.5pt}
    th{background:#e8e8e8;font-weight:bold;text-align:center;line-height:1.15}
    td.n{font-weight:bold}
    td.m{text-align:right;font-family:monospace}
    td.tot{font-weight:bold;background:#f8f8f8}
    tr.totals td{border-top:2px solid #000;background:#efefef;font-weight:bold}
    @media print{@page{size:A4 landscape}}
  </style></head><body>
    <h1>${escapeHtml(schoolName)}${location ? ' — ' + escapeHtml(location) : ''}</h1>
    <h2>CONSOLIDATED EXPENDITURE ABSTRACT</h2>
    <div class="scope">${escapeHtml(scope_label || '')}</div>
    <table>
      <thead><tr><th>CATEGORY</th>${headerCells}<th>TOTAL</th></tr></thead>
      <tbody>${dataRows}<tr class="totals"><td class="n">TOTALS</td>${totalCells}<td class="m tot">${fmt(grand_total)}</td></tr></tbody>
    </table>
  </body></html>`
}

async function buildBudgetPreviewHTML(data) {
  const school = await getSchoolOnce()
  const { term, rows, totals } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')

  const tableRows = rows.map(r => {
    const fill = Math.min(100, r.util_pct ?? 0)
    const color = statusColor(r.util_pct)
    return `<tr>
      <td>${escapeHtml(upper(r.name))}</td>
      <td class="m">${fmt(r.allocated)}</td>
      <td class="m">${fmt(r.spent)}</td>
      <td class="m" ${r.remaining < 0 ? 'style="color:#DC2626;font-weight:bold"' : ''}>${fmt(r.remaining)}</td>
      <td>
        <div style="width:100%;height:10px;background:#f0f0f0;border:1px solid #ccc;border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${fill}%;background:${color}"></div>
        </div>
        <div style="text-align:right;font-size:8pt;margin-top:2px;font-weight:bold;color:${color}">${r.util_pct != null ? r.util_pct.toFixed(0) + '%' : '—'}</div>
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Courier New',monospace;font-size:9pt;padding:20px;color:#000;background:#fff}
    h1{font-size:11pt;text-align:center;text-transform:uppercase;margin:0}
    h2{font-size:10pt;text-align:center;margin:4px 0 10px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #000;padding:4px 6px;font-size:9pt}
    th{background:#f0f0f0;font-weight:bold;text-align:center}
    td.m{text-align:right;font-family:monospace}
    tr.tot td{background:#f5f5f5;font-weight:bold;border-top:2px solid #000}
  </style></head><body>
    <h1>${escapeHtml(schoolName)}${location ? ' — ' + escapeHtml(location) : ''}</h1>
    <h2>BUDGET PERFORMANCE — TERM ${term.term_number}, ${term.year}</h2>
    <table>
      <thead>
        <tr>
          <th style="width:30%">CATEGORY</th>
          <th style="width:15%">ALLOCATED</th>
          <th style="width:15%">SPENT</th>
          <th style="width:15%">REMAINING</th>
          <th style="width:25%">UTILIZATION</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
        <tr class="tot">
          <td>TOTAL</td>
          <td class="m">${fmt(totals.allocated)}</td>
          <td class="m">${fmt(totals.spent)}</td>
          <td class="m" ${totals.remaining < 0 ? 'style="color:#DC2626"' : ''}>${fmt(totals.remaining)}</td>
          <td class="m">${totals.util_pct != null ? totals.util_pct.toFixed(1) + '%' : '—'}</td>
        </tr>
      </tbody>
    </table>
  </body></html>`
}

async function buildTrendsPreviewHTML(data) {
  const school = await getSchoolOnce()
  const { bucket, labels, series, scope_label } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')

  const headerCells = labels.map(l => `<th>${escapeHtml(String(l).toUpperCase())}</th>`).join('')
  const tableRows = series.map(s => {
    const cells = labels.map(l => {
      const pt = s.points.find(p => p.x === l)
      return `<td class="m">${fmt(pt?.y || 0)}</td>`
    }).join('')
    const total = s.points.reduce((a, p) => a + p.y, 0)
    return `<tr><td class="n">${escapeHtml(upper(s.name))}</td>${cells}<td class="m tot">${fmt(total)}</td></tr>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Courier New',monospace;font-size:9pt;padding:20px;color:#000;background:#fff}
    h1{font-size:11pt;text-align:center;text-transform:uppercase;margin:0}
    h2{font-size:10pt;text-align:center;margin:4px 0}
    .scope{font-size:8.5pt;text-align:center;color:#444;margin:2px 0 6px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #000;padding:3px 5px;font-size:8.5pt}
    th{background:#f0f0f0;font-weight:bold;text-align:center}
    td.n{font-weight:bold}
    td.m{text-align:right;font-family:monospace}
    .tot{font-weight:bold;background:#f8f8f8}
    @media print{@page{size:A4 landscape}}
  </style></head><body>
    <h1>${escapeHtml(schoolName)}${location ? ' — ' + escapeHtml(location) : ''}</h1>
    <h2>CATEGORY TRENDS — BY ${String(bucket).toUpperCase()}</h2>
    <div class="scope">${escapeHtml(scope_label || '')}</div>
    <table>
      <thead><tr><th>CATEGORY</th>${headerCells}<th>TOTAL</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </body></html>`
}

async function buildSummaryPreviewHTML(data) {
  const school = await getSchoolOnce()
  const { metrics, topCategories, budgetSummary } = data
  const schoolName = upper(school?.name || 'ORGANIZATION')
  const location = upper(school?.location || '')

  const topRows = (topCategories || []).slice(0, 5).map(c =>
    `<tr><td>${escapeHtml(upper(c.name))}</td><td class="m">${fmt(c.spent)}</td><td class="m">${c.pct_of_total.toFixed(1)}%</td></tr>`
  ).join('')

  const budgetRows = (budgetSummary?.rows || []).filter(r => r.allocated > 0).map(r => {
    const color = statusColor(r.util_pct)
    return `<tr>
      <td>${escapeHtml(upper(r.name))}</td>
      <td class="m">${fmt(r.allocated)}</td>
      <td class="m">${fmt(r.spent)}</td>
      <td class="m" ${r.remaining < 0 ? 'style="color:#DC2626;font-weight:bold"' : ''}>${fmt(r.remaining)}</td>
      <td class="m" style="color:${color}">${r.util_pct != null ? r.util_pct.toFixed(0) + '%' : '—'}</td>
    </tr>`
  }).join('')

  const utilPct = metrics?.utilization_pct
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Courier New',monospace;font-size:9pt;padding:20px;color:#000;background:#fff}
    h1{font-size:11pt;text-align:center;text-transform:uppercase;margin:0}
    h2{font-size:10pt;text-align:center;margin:4px 0}
    .scope{font-size:8.5pt;text-align:center;color:#444;margin:2px 0 10px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
    .stat{border:1px solid #000;padding:8px}
    .lbl{font-size:7pt;text-transform:uppercase;color:#444}
    .val{font-size:11pt;font-weight:bold;font-family:monospace;margin-top:2px}
    .sub{font-size:7.5pt;color:#666;margin-top:2px}
    h3{font-size:10pt;font-weight:bold;margin:14px 0 4px;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #000;padding:3px 6px;font-size:9pt}
    th{background:#f0f0f0;font-weight:bold;text-align:center}
    td.m{text-align:right;font-family:monospace}
  </style></head><body>
    <h1>${escapeHtml(schoolName)}${location ? ' — ' + escapeHtml(location) : ''}</h1>
    <h2>FINANCIAL SUMMARY</h2>
    <div class="scope">${escapeHtml(metrics?.scope_label || '')}</div>
    <div class="stats">
      <div class="stat"><div class="lbl">Total Budget</div><div class="val">${fmt(metrics?.total_budget || 0)}</div></div>
      <div class="stat"><div class="lbl">Total Spent (Net)</div><div class="val">${fmt(metrics?.net_spent || 0)}</div><div class="sub">${metrics?.vouchers_count || 0} vouchers</div></div>
      <div class="stat"><div class="lbl">Remaining</div><div class="val" style="color:${(metrics?.remaining_budget || 0) < 0 ? '#DC2626' : '#000'}">${fmt(metrics?.remaining_budget || 0)}</div></div>
      <div class="stat"><div class="lbl">Utilization</div><div class="val" style="color:${statusColor(utilPct)}">${utilPct != null ? utilPct.toFixed(1) + '%' : '—'}</div><div class="sub">${metrics?.active_cycles_count || 0} active cycle(s)</div></div>
    </div>
    <h3>Top Expenditure Categories</h3>
    <table>
      <thead><tr><th style="width:60%">CATEGORY</th><th style="width:25%">SPENT</th><th style="width:15%">% OF TOTAL</th></tr></thead>
      <tbody>${topRows || '<tr><td colspan="3" style="text-align:center;color:#888">No spending</td></tr>'}</tbody>
    </table>
    ${budgetRows ? `
      <h3>Budget Performance</h3>
      <table>
        <thead><tr><th>CATEGORY</th><th>ALLOCATED</th><th>SPENT</th><th>REMAINING</th><th>UTIL%</th></tr></thead>
        <tbody>${budgetRows}</tbody>
      </table>
    ` : ''}
  </body></html>`
}
