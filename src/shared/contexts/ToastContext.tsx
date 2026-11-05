import { createContext, useContext, type ReactNode } from 'react'
import { notifications } from '@mantine/notifications'

type ToastKind = 'success' | 'error' | 'warning' | 'info'

interface ToastOptions {
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  showToast: (toast: ToastOptions & { type: ToastKind }) => void
  showSuccess: (title: string, message?: string, duration?: number) => void
  showError: (title: string, message?: string, duration?: number) => void
  showWarning: (title: string, message?: string, duration?: number) => void
  showInfo: (title: string, message?: string, duration?: number) => void
  removeToast: (id: string) => void
  clearAllToasts: () => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

const variantMap: Record<ToastKind, { color: string }> = {
  success: { color: 'green' },
  error: { color: 'red' },
  warning: { color: 'yellow' },
  info: { color: 'blue' },
}

function showToastBase({ type, title, message, duration = 3000 }: ToastOptions & { type: ToastKind }) {
  notifications.show({
    title,
    message,
    color: variantMap[type].color,
    autoClose: duration,
    withBorder: true,
  })
}

const toastApi: ToastContextType = {
  showToast: showToastBase,
  showSuccess: (title, message, duration) => showToastBase({ type: 'success', title, message, duration }),
  showError: (title, message, duration) => showToastBase({ type: 'error', title, message, duration }),
  showWarning: (title, message, duration) => showToastBase({ type: 'warning', title, message, duration }),
  showInfo: (title, message, duration) => showToastBase({ type: 'info', title, message, duration }),
  removeToast: (id) => notifications.hide(id),
  clearAllToasts: () => notifications.clean(),
}

export const ToastProvider = ({ children }: { children: ReactNode }) => children

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext)
  return context ?? toastApi
}

export default ToastContext
