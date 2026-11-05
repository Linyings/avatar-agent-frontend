import { Paper } from '@mantine/core'
import type { ElementProps, PaperProps } from '@mantine/core'
import type { ReactNode } from 'react'

type SurfaceCardProps = PaperProps &
  ElementProps<'div'> & {
  children?: ReactNode
  tone?: 'default' | 'subtle' | 'highlight' | 'danger' | 'success' | 'processing'
  interactive?: boolean
}

const toneStyles = {
  default: {
    background: 'var(--app-surface)',
    borderColor: 'var(--app-border)',
  },
  subtle: {
    background: 'var(--app-surface-alt)',
    borderColor: 'var(--app-border-subtle)',
  },
  highlight: {
    background: 'var(--app-brand-soft-bg)',
    borderColor: 'var(--app-brand-soft-border)',
  },
  danger: {
    background: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  success: {
    background: 'var(--app-brand-soft-bg)',
    borderColor: 'var(--app-brand-soft-border)',
  },
  processing: {
    background: 'var(--app-surface-alt)',
    borderColor: 'rgba(59, 130, 246, 0.22)',
  },
} as const

export default function SurfaceCard({
  children,
  tone = 'default',
  style,
  interactive = false,
  ...props
}: SurfaceCardProps) {
  return (
    <Paper
      p="lg"
      withBorder
      style={{
        ...toneStyles[tone],
        transition: interactive ? 'transform 180ms ease, box-shadow 180ms ease' : undefined,
        cursor: interactive ? 'pointer' : undefined,
        color: 'var(--app-text)',
        ...style,
      }}
      {...props}
    >
      {children}
    </Paper>
  )
}
