import { Group, Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import AdminBackButton from './AdminBackButton'
import PageHeading from './PageHeading'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  align?: 'left' | 'center'
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  align = 'left',
}: PageHeaderProps) {
  const showAdminBackButton = window.location.pathname.startsWith('/admin/')

  return (
    <Group align="flex-start" justify="space-between" gap="lg" wrap="wrap">
      <Group align="flex-start" gap="md" wrap="nowrap">
        {showAdminBackButton ? <AdminBackButton /> : null}
        <PageHeading title={title} subtitle={subtitle} align={align} />
      </Group>
      {actions ? (
        <Stack gap="sm" align="stretch">
          {actions}
        </Stack>
      ) : null}
    </Group>
  )
}
