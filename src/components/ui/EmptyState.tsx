/**
 * EmptyState — 空状态展示
 * 居中图示 + 说明文字 + 可选 CTA
 */
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  style?: React.CSSProperties
}

export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-3)',
      padding: 'var(--space-10) var(--space-6)',
      textAlign: 'center',
      ...style,
    }}>
      {icon && (
        <div style={{
          width: 64, height: 64,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-accent-bg)',
          border: '1px solid var(--color-accent-border)',
          color: 'var(--color-accent)',
        }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text)' }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: '0.875rem', color: 'var(--color-muted)', maxWidth: 400 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  )
}
