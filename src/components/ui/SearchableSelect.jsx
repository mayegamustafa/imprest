import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { clsx } from 'clsx'

/**
 * SearchableSelect — a dropdown with a built-in search box.
 *
 * Props:
 *   options:     [{ value, label }]
 *   value:       selected value (or null)
 *   onChange:    (value) => void
 *   placeholder: string shown when nothing is selected
 *   label:       optional field label rendered above
 *   required:    boolean — adds an asterisk to the label
 *   error:       optional error message shown below the field
 *   disabled:    boolean
 */
export default function SearchableSelect({
  options = [],
  value = null,
  onChange,
  placeholder = 'Select an option…',
  label,
  required,
  error,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', onClick)
      document.addEventListener('keydown', onKey)
      // focus search when dropdown opens
      setTimeout(() => searchRef.current?.focus(), 30)
    }
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options

  function pick(opt) {
    onChange?.(opt.value)
    setOpen(false)
    setSearch('')
  }

  function clear(e) {
    e.stopPropagation()
    onChange?.(null)
  }

  return (
    <div className="flex flex-col gap-0.5" ref={wrapRef}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(o => !o)}
          className={clsx(
            'field-input flex items-center justify-between text-left w-full',
            error && 'border-danger focus:border-danger focus:ring-danger/30',
            disabled && 'opacity-60 cursor-not-allowed',
          )}
        >
          <span className={selected ? 'text-ink' : 'text-ink-muted'}>
            {selected?.label || placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {selected && !disabled && (
              <span
                role="button"
                onClick={clear}
                className="text-ink-muted hover:text-ink p-0.5 -m-0.5 rounded"
                title="Clear"
              >
                <X size={12} />
              </span>
            )}
            <ChevronDown
              size={14}
              className={clsx('text-ink-muted transition-transform', open && 'rotate-180')}
            />
          </div>
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-dropdown z-30 overflow-hidden">
            <div className="p-2 border-b border-border bg-gray-50">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  ref={searchRef}
                  type="text"
                  className="field-input pl-7 text-sm"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && filtered.length > 0) {
                      e.preventDefault()
                      pick(filtered[0])
                    }
                  }}
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-sm text-ink-muted text-center">
                  No matches for "{search}"
                </p>
              ) : (
                filtered.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-accent-light transition-colors',
                      opt.value === value && 'bg-accent/10 font-medium text-accent',
                    )}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
    </div>
  )
}
