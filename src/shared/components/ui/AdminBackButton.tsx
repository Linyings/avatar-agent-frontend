import { ActionIcon, Tooltip } from '@mantine/core'
import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '@/shared/icons/tabler'

export default function AdminBackButton() {
  return (
    <Tooltip label="返回管理后台" position="right" withArrow>
      <ActionIcon
        component={Link}
        to="/admin"
        variant="default"
        radius="xl"
        size={52}
        aria-label="返回管理后台"
        style={{
          flex: '0 0 52px',
          borderColor: 'var(--app-border)',
          background: 'var(--app-dashboard-panel-bg)',
          color: 'var(--app-nav-text)',
          boxShadow: 'var(--app-shadow-sm)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <ArrowLeftIcon width={22} height={22} stroke={1.8} />
      </ActionIcon>
    </Tooltip>
  )
}
