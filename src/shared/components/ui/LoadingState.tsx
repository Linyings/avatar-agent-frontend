import { Loader, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

interface LoadingStateProps {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export default function LoadingState({
  title = '加载中',
  description,
  action,
}: LoadingStateProps) {
  return (
    <Stack align="center" justify="center" gap="md" py="xl">
      <Loader size="md" />
      <Stack gap={4} align="center">
        <Title order={4}>{title}</Title>
        {description ? <Text c="dimmed" ta="center">{description}</Text> : null}
      </Stack>
      {action}
    </Stack>
  )
}
