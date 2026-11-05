import { Badge } from '@mantine/core'
import type { BadgeProps } from '@mantine/core'
import type { ReactNode } from 'react'

interface StatusChipProps extends Omit<BadgeProps, 'children' | 'color' | 'variant'> {
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'brand'
  children: ReactNode
}

const toneMap = {
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  neutral: 'gray',
  brand: 'brand',
} as const

export default function StatusChip({ tone, children, size = 'sm', ...props }: StatusChipProps) {
  return (
    <Badge color={toneMap[tone]} variant="light" radius="xl" size={size} {...props}>
      {children}
    </Badge>
  )
}
