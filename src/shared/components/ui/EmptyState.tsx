import { Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export default function EmptyState({
  title = '暂无数据',
  description,
  action,
}: EmptyStateProps) {
  return (
    <Stack align="center" justify="center" gap="md" py="xl">
      <Stack gap={4} align="center">
        <Title order={4}>{title}</Title>
        {description ? <Text c="dimmed" ta="center">{description}</Text> : null}
      </Stack>
      {action}
    </Stack>
  )
}
