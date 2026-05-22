import { clsx } from 'clsx'

const styles = {
  success: 'bg-success-light text-success border-success/20',
  warning: 'bg-warning-light text-warning border-warning/20',
  danger: 'bg-danger-light text-danger border-danger/20',
  info: 'bg-accent-light text-accent border-accent/20',
  neutral: 'bg-gray-100 text-ink-secondary border-gray-200',
}

export default function Badge({ children, variant = 'neutral', className = '' }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
      styles[variant],
      className,
    )}>
      {children}
    </span>
  )
}
