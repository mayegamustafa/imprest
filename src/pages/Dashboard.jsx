import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingDown, TrendingUp, Wallet, Calendar, Plus, ArrowRight,
  Receipt, AlertTriangle,
} from 'lucide-react'
import { StatCard } from '../components/ui/Card'
import Button from '../components/ui/Button'
import FilterBar from '../components/FilterBar'
import useFilterParams from '../hooks/useFilterParams'
import useAppStore from '../store/appStore'
import { formatUGX, periodLabel } from '../lib/formatters'
import BudgetProgressBars from '../components/charts/BudgetProgressBars'
import CategorySpendBar from '../components/charts/CategorySpendBar'
import BudgetVsActualBar from '../components/charts/BudgetVsActualBar'
import SpendingTrendLine from '../components/charts/SpendingTrendLine'
import TopCategoriesPie from '../components/charts/TopCategoriesPie'
import StackedByCycleBar from '../components/charts/StackedByCycleBar'
import VoucherTimeline from '../components/charts/VoucherTimeline'

export default function Dashboard() {
  const { terms } = useAppStore()
  const navigate = useNavigate()

  // Default filter: most recent term with cycles (matches user's "current term" choice)
  const defaultFilters = useMemo(() => {
    const termWithCycles = terms.find(t => (t.cycles || []).length > 0)
    return termWithCycles ? { term_id: termWithCycles.id } : {}
  }, [terms])

  const { filters, setFilter, setFilters, reset } = useFilterParams(defaultFilters)

  const [metrics, setMetrics] = useState(null)
  const [consolidated, setConsolidated] = useState(null)
  const [budgetSummary, setBudgetSummary] = useState(null)
  const [trends, setTrends] = useState(null)
  const [topCats, setTopCats] = useState([])
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      setLoading(true)
      try {
        const [m, ca, tr, tc, tl] = await Promise.all([
          window.electronAPI.getDashboardMetrics(filters),
          window.electronAPI.getConsolidatedAbstract(filters),
          window.electronAPI.getCategoryTrends(filters),
          window.electronAPI.getTopCategories(filters, 6),
          window.electronAPI.getVoucherTimeline(filters),
        ])
        if (cancelled) return
        setMetrics(m)
        setConsolidated(ca)
        setTrends(tr)
        setTopCats(tc)
        setTimeline(tl)
        // Budget summary only makes sense for a single term
        if (filters.term_id) {
          const bs = await window.electronAPI.getBudgetSummary(filters.term_id)
          if (!cancelled) setBudgetSummary(bs)
        } else {
          setBudgetSummary(null)
        }
      } catch (err) {
        console.error('Dashboard load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [JSON.stringify(filters)])

  // All hooks must run on every render — keep useMemo calls above the early
  // return below.
  const categorySpend = useMemo(() => {
    if (!consolidated) return []
    return consolidated.categories.map(c => ({
      name: c.name,
      spent: consolidated.category_totals[c.id] || 0,
    }))
  }, [consolidated])

  const budgetMap = useMemo(() => {
    if (!budgetSummary) return {}
    const m = {}
    budgetSummary.rows.forEach(r => { if (r.allocated > 0) m[r.category_id] = r.allocated })
    return m
  }, [budgetSummary])

  // ── Early return after all hooks ─────────────────────────────────────────
  if (terms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Calendar size={40} strokeWidth={1} className="text-ink-muted mb-4" />
        <h2 className="text-lg font-semibold text-ink mb-1">No Periods Yet</h2>
        <p className="text-ink-secondary text-sm mb-4">Create your first period and imprest cycle to get started.</p>
        <Button onClick={() => navigate('/terms')}>
          <Plus size={14} /> Create First Period
        </Button>
      </div>
    )
  }

  // Derived locals (not hooks)
  const totalBudget = metrics?.total_budget || 0
  const netSpent = metrics?.net_spent || 0
  const remaining = metrics?.remaining_budget || 0
  const utilPct = metrics?.utilization_pct
  const hasBudget = totalBudget > 0
  const budgetRows = budgetSummary?.rows || []

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        setFilter={setFilter}
        setFilters={setFilters}
        reset={reset}
        scopeLabel={metrics?.scope_label}
      />

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total Budget"
          value={`UGX ${formatUGX(totalBudget)}`}
          sub={hasBudget ? '' : 'No budget set'}
          icon={Wallet}
          variant={hasBudget ? 'accent' : 'default'}
        />
        <StatCard
          label="Total Spent"
          value={`UGX ${formatUGX(netSpent)}`}
          sub={`${metrics?.vouchers_count || 0} vouchers`}
          icon={TrendingDown}
          variant="warning"
        />
        <StatCard
          label="Remaining"
          value={`UGX ${formatUGX(remaining)}`}
          sub={!hasBudget ? '—' : remaining < 0 ? 'OVER BUDGET' : ''}
          icon={TrendingUp}
          variant={!hasBudget ? 'default' : remaining < 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Utilization"
          value={utilPct != null ? `${utilPct.toFixed(1)}%` : '—'}
          sub={hasBudget ? '' : 'No budget'}
          variant={utilPct == null ? 'default' : utilPct > 100 ? 'danger' : utilPct > 90 ? 'warning' : 'success'}
        />
        <StatCard
          label="Active Cycles"
          value={metrics?.active_cycles_count || 0}
          sub="in scope"
          icon={Calendar}
        />
      </div>

      {!hasBudget && (
        <div className="bg-accent-light border border-accent/20 rounded px-4 py-2.5 flex items-center gap-2 text-sm">
          <AlertTriangle size={14} className="text-accent shrink-0" />
          <span className="text-ink">
            No budget allocated for this scope.
          </span>
          <button
            onClick={() => navigate('/budgets')}
            className="ml-auto text-xs text-accent hover:underline"
          >
            Set budgets → Budgets page
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center text-ink-muted text-xs">Loading analytics...</div>
      )}

      {/* Two-column charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Budget Progress Bars */}
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Budget Progress (per category)</h3>
          <BudgetProgressBars rows={budgetRows} />
        </div>

        {/* Top Categories Pie */}
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Top Categories</h3>
          <TopCategoriesPie data={topCats} />
        </div>

        {/* Category Spend (h-bar ranking) */}
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Spending by Category</h3>
          <CategorySpendBar data={categorySpend} />
        </div>

        {/* Budget vs Actual */}
        <div className="card">
          <h3 className="text-sm font-semibold text-ink mb-3">Budget vs Actual</h3>
          {budgetSummary ? (
            <BudgetVsActualBar rows={budgetSummary.rows} />
          ) : (
            <div className="text-center py-12 text-ink-muted text-sm">
              Pick a single Term in the filter to compare budget vs spending.
            </div>
          )}
        </div>
      </div>

      {/* Stacked by Cycle */}
      <div className="card">
        <h3 className="text-sm font-semibold text-ink mb-3">
          Spending Stacked by Cycle
          {consolidated && consolidated.cycles.length > 0 && (
            <span className="ml-2 text-xs text-ink-secondary font-normal">
              ({consolidated.cycles.length} cycle{consolidated.cycles.length === 1 ? '' : 's'})
            </span>
          )}
        </h3>
        {consolidated && consolidated.cycles.length > 0 ? (
          <StackedByCycleBar
            cycles={consolidated.cycles}
            categories={consolidated.categories}
            matrix={consolidated.matrix}
            budgets={budgetMap}
          />
        ) : (
          <div className="text-center py-12 text-ink-muted text-sm">No cycle data in scope.</div>
        )}
      </div>

      {/* Spending Trend */}
      <div className="card">
        <h3 className="text-sm font-semibold text-ink mb-3">
          Spending Trend
          {trends && <span className="ml-2 text-xs text-ink-secondary font-normal">(by {trends.bucket})</span>}
        </h3>
        {trends && trends.series.length > 0 ? (
          <SpendingTrendLine labels={trends.labels} series={trends.series} />
        ) : (
          <div className="text-center py-12 text-ink-muted text-sm">Not enough data for trends.</div>
        )}
      </div>

      {/* Voucher Timeline (Gantt-style) */}
      <div className="card">
        <h3 className="text-sm font-semibold text-ink mb-3">
          Voucher Timeline
          <span className="ml-2 text-xs text-ink-secondary font-normal">
            ({timeline.length} voucher{timeline.length === 1 ? '' : 's'})
          </span>
        </h3>
        <VoucherTimeline vouchers={timeline} height={Math.max(280, 28 * Math.max(...(timeline.length > 0 ? [new Set(timeline.map(v => v.category_id)).size] : [3])))} />
      </div>
    </div>
  )
}
