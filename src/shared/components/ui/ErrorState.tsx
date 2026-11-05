import { Alert, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

interface ErrorStateProps {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export default function ErrorState({
  title = '出现错误',
  description,
  action,
}: ErrorStateProps) {
  return (
    <Stack gap="md" py="xl">
      <Alert color="red" variant="light">
        <Stack gap={4}>
          <Title order={4}>{title}</Title>
          {description ? <Text c="red.1">{description}</Text> : null}
        </Stack>
      </Alert>
      {action}
    </Stack>
  )
}
