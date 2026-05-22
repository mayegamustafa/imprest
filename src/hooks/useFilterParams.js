import { useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * useFilterParams — backs Dashboard/Reports analytics filters with URL search
 * params so dashboards are linkable and browser back/forward works.
 *
 * Shape of `filters` returned (matches the analytics IPC API):
 *   {
 *     year?:         number
 *     term_id?:      number
 *     cycle_ids?:    number[]
 *     category_ids?: number[]
 *     date_from?:    string ('YYYY-MM-DD')
 *     date_to?:      string ('YYYY-MM-DD')
 *   }
 *
 * Optional `defaults` argument lets a page seed filters on first mount (e.g.
 * Dashboard defaults to the current active term).
 */
export default function useFilterParams(defaults = {}) {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => {
    const out = {}
    const year = params.get('year') ?? defaults.year
    const termId = params.get('term_id') ?? defaults.term_id
    const cycleIds = params.get('cycle_ids') ?? (defaults.cycle_ids ? defaults.cycle_ids.join(',') : null)
    const catIds = params.get('category_ids') ?? (defaults.category_ids ? defaults.category_ids.join(',') : null)
    const dateFrom = params.get('date_from') ?? defaults.date_from
    const dateTo = params.get('date_to') ?? defaults.date_to

    if (year) out.year = Number(year)
    if (termId) out.term_id = Number(termId)
    if (cycleIds) out.cycle_ids = String(cycleIds).split(',').map(Number).filter(Boolean)
    if (catIds) out.category_ids = String(catIds).split(',').map(Number).filter(Boolean)
    if (dateFrom) out.date_from = dateFrom
    if (dateTo) out.date_to = dateTo
    return out
  }, [params, defaults])

  const setFilter = useCallback((key, value) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === null || value === undefined || value === '' ||
          (Array.isArray(value) && value.length === 0)) {
        next.delete(key)
      } else if (Array.isArray(value)) {
        next.set(key, value.join(','))
      } else {
        next.set(key, String(value))
      }
      return next
    }, { replace: true })
  }, [setParams])

  const setFilters = useCallback((updates) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '' ||
            (Array.isArray(value) && value.length === 0)) {
          next.delete(key)
        } else if (Array.isArray(value)) {
          next.set(key, value.join(','))
        } else {
          next.set(key, String(value))
        }
      })
      return next
    }, { replace: true })
  }, [setParams])

  const reset = useCallback(() => setParams({}, { replace: true }), [setParams])

  return { filters, setFilter, setFilters, reset }
}
