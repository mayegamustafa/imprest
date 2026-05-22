import { clsx } from 'clsx'

export default function Input({
  label,
  error,
  hint,
  className = '',
  inputClassName = '',
  ...props
}) {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      {label && (
        <label className="field-label">
          {label}
          {props.required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <input
        className={clsx(
          'field-input',
          error && 'border-danger focus:border-danger focus:ring-danger/30',
          inputClassName,
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
      {hint && !error && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
    </div>
  )
}

export function Textarea({ label, error, hint, className = '', ...props }) {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      {label && (
        <label className="field-label">
          {label}
          {props.required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <textarea
        className={clsx(
          'field-input resize-none',
          error && 'border-danger focus:border-danger focus:ring-danger/30',
        )}
        rows={3}
        {...props}
      />
      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
      {hint && !error && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
    </div>
  )
}
