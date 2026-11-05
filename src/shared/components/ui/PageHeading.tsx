import { Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

interface PageHeadingProps {
  title: ReactNode
  subtitle?: ReactNode
  align?: 'left' | 'center'
}

export default function PageHeading({
  title,
  subtitle,
  align = 'left',
}: PageHeadingProps) {
  return (
    <Stack gap="sm" align={align === 'center' ? 'center' : 'stretch'}>
      <Title order={1} ta={align} maw={align === 'center' ? 960 : undefined}>
        {title}
      </Title>
      {subtitle ? (
        <Text c="dimmed" size="lg" ta={align} maw={align === 'center' ? 720 : 640}>
          {subtitle}
        </Text>
      ) : null}
    </Stack>
  )
}
