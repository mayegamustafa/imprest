import { CheckCircle, AlertCircle, Info } from 'lucide-react'
import { clsx } from 'clsx'
import useAppStore from '../../store/appStore'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

const styles = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-accent text-white',
}

export default function Notification() {
  const notification = useAppStore(s => s.notification)
  if (!notification) return null

  const Icon = icons[notification.type] || Info

  return (
    <div className={clsx(
      'fixed bottom-5 right-5 z-[100] flex items-center gap-2.5 px-4 py-2.5 rounded-md shadow-modal text-sm font-medium',
      styles[notification.type] || styles.info,
    )}>
      <Icon size={15} strokeWidth={2} />
      {notification.message}
    </div>
  )
}
