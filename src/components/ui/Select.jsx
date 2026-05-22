import { clsx } from 'clsx'

export default function Select({ label, error, hint, children, className = '', selectClassName = '', ...props }) {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      {label && (
        <label className="field-label">
          {label}
          {props.required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <select
        className={clsx(
          'field-input cursor-pointer',
          error && 'border-danger focus:border-danger focus:ring-danger/30',
          selectClassName,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
      {hint && !error && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
    </div>
  )
}
