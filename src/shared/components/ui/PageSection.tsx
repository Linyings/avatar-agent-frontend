import { Box, Paper, Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import PageHeading from './PageHeading'

interface PageSectionProps {
  title?: ReactNode
  description?: ReactNode
  tone?: 'default' | 'subtle' | 'highlight'
  children: ReactNode
}

const toneStyles = {
  default: {
    background: 'rgba(20, 25, 34, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  subtle: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  highlight: {
    background: 'rgba(43, 216, 98, 0.08)',
    borderColor: 'rgba(43, 216, 98, 0.28)',
  },
} as const

export default function PageSection({
  title,
  description,
  tone = 'default',
  children,
}: PageSectionProps) {
  return (
    <Paper p={{ base: 'lg', md: 'xl' }} style={toneStyles[tone]}>
      <Stack gap="lg">
        {title ? <PageHeading title={title} subtitle={description} /> : null}
        <Box>{children}</Box>
      </Stack>
    </Paper>
  )
}
