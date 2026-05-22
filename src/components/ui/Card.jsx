import { clsx } from 'clsx'

export default function Card({ children, className = '', title, action }) {
  return (
    <div className={clsx('card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-md font-semibold text-ink">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function StatCard({ label, value, sub, icon: Icon, variant = 'default' }) {
  const variants = {
    default: 'border-border',
    success: 'border-l-4 border-l-success',
    warning: 'border-l-4 border-l-warning',
    danger: 'border-l-4 border-l-danger',
    accent: 'border-l-4 border-l-accent',
  }

  return (
    <div className={clsx('stat-card', variants[variant])}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-ink mt-1 tabular-nums font-mono">{value}</p>
          {sub && <p className="text-xs text-ink-muted mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className="ml-3 p-2 bg-background rounded text-ink-secondary shrink-0">
            <Icon size={18} strokeWidth={1.75} />
          </div>
        )}
      </div>
    </div>
  )
}
