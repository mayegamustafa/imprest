import { useMemo } from 'react'
import { Filter, X } from 'lucide-react'
import useAppStore from '../store/appStore'
import { periodLabel } from '../lib/formatters'

/**
 * Shared filter strip for Dashboard and Reports analytics views.
 *
 * Props:
 *   filters     — current filters object from useFilterParams()
 *   setFilters  — bulk setter
 *   setFilter   — single setter
 *   reset       — clear all filters
 *   scopeLabel  — optional override; if absent, the parent's analytics call
 *                 returns one in its result and shows it elsewhere.
 *   compact     — shorter visual variant for use above small widgets
 */
export default function FilterBar({ filters, setFilter, setFilters, reset, scopeLabel, compact = false }) {
  const { terms, categories } = useAppStore()

  // Build year list from existing terms; if there are none yet, use current year
  const years = useMemo(() => {
    const set = new Set(terms.map(t => t.year))
    if (set.size === 0) set.add(new Date().getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [terms])

  // Build term list filtered by year
  const termsInYear = useMemo(() => {
    if (!filters.year) return terms
    return terms.filter(t => t.year === filters.year)
  }, [terms, filters.year])

  // Build cycle list filtered by selected term
  const cyclesAvailable = useMemo(() => {
    if (filters.term_id) {
      const t = terms.find(t => t.id === filters.term_id)
      return t?.cycles || []
    }
    return termsInYear.flatMap(t =>
      (t.cycles || []).map(c => ({ ...c, _termLabel: periodLabel(t) }))
    )
  }, [terms, termsInYear, filters.term_id])

  function toggleCycle(id) {
    const current = filters.cycle_ids || []
    setFilter('cycle_ids', current.includes(id)
      ? current.filter(c => c !== id)
      : [...current, id]
    )
  }

  function toggleCategory(id) {
    const current = filters.category_ids || []
    setFilter('category_ids', current.includes(id)
      ? current.filter(c => c !== id)
      : [...current, id]
    )
  }

  const activeFilterCount =
    (filters.year ? 1 : 0) +
    (filters.term_id ? 1 : 0) +
    (filters.cycle_ids?.length || 0) +
    (filters.category_ids?.length || 0) +
    (filters.date_from ? 1 : 0) +
    (filters.date_to ? 1 : 0)

  return (
    <div className={`bg-surface border border-border rounded-md ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary uppercase tracking-wide shrink-0">
          <Filter size={12} />
          Filter
        </div>

        {/* Year */}
        <select
          className="field-input text-xs py-1 min-w-[100px]"
          value={filters.year || ''}
          onChange={e => setFilters({
            year: e.target.value ? Number(e.target.value) : null,
            // If year changes, clear term_id if it no longer fits
            term_id: null,
            cycle_ids: [],
          })}
        >
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Term */}
        <select
          className="field-input text-xs py-1 min-w-[140px]"
          value={filters.term_id || ''}
          onChange={e => setFilters({
            term_id: e.target.value ? Number(e.target.value) : null,
            cycle_ids: [],
          })}
        >
          <option value="">All terms / periods</option>
          {termsInYear.map(t => (
            <option key={t.id} value={t.id}>{periodLabel(t)}</option>
          ))}
        </select>

        {/* Cycle multi-select via popover-like inline pills */}
        {cyclesAvailable.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {cyclesAvailable.map(c => {
              const active = (filters.cycle_ids || []).includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCycle(c.id)}
                  className={`text-2xs px-2 py-0.5 rounded border transition-colors ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-ink-secondary border-border hover:border-accent hover:text-accent'
                  }`}
                  title={c.name}
                >
                  {c._termLabel ? `${c._termLabel} · ` : ''}C{c.cycle_number}
                </button>
              )
            })}
          </div>
        )}

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            className="field-input text-xs py-1"
            value={filters.date_from || ''}
            onChange={e => setFilter('date_from', e.target.value)}
            title="From"
          />
          <span className="text-ink-muted">→</span>
          <input
            type="date"
            className="field-input text-xs py-1"
            value={filters.date_to || ''}
            onChange={e => setFilter('date_to', e.target.value)}
            title="To"
          />
        </div>

        {/* Reset */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="ml-auto flex items-center gap-1 text-xs text-ink-secondary hover:text-danger transition-colors"
            title="Clear all filters"
          >
            <X size={11} />
            Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Category pills row — collapses if no categories selected */}
      {categories && categories.length > 0 && (
        <details className="mt-2" open={(filters.category_ids?.length || 0) > 0}>
          <summary className="text-2xs text-ink-secondary uppercase tracking-wide cursor-pointer hover:text-accent">
            Categories {(filters.category_ids?.length || 0) > 0 ? `(${filters.category_ids.length} selected)` : '(all)'}
          </summary>
          <div className="flex items-center gap-1 flex-wrap mt-1.5">
            {categories.map(c => {
              const active = (filters.category_ids || []).includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`text-2xs px-2 py-0.5 rounded border transition-colors ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-ink-secondary border-border hover:border-accent hover:text-accent'
                  }`}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </details>
      )}

      {scopeLabel && (
        <div className="mt-2 text-2xs text-ink-muted">
          Scope: <strong className="text-ink-secondary">{scopeLabel}</strong>
        </div>
      )}
    </div>
  )
}
