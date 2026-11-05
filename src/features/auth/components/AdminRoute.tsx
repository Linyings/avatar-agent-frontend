import React from 'react'
import { Button, Center, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { LockKeyhole, ShieldCheck } from '@/shared/icons/tabler'
import { useAuth } from '../contexts/AuthContext'

interface AdminRouteProps {
  children: React.ReactNode
}

const shellStyle = {
  minHeight: '100vh',
  background: '#171717'
} as const

const cardStyle = {
  width: '100%',
  maxWidth: '30rem',
  background: 'rgba(15, 15, 15, 0.92)',
  border: '1px solid rgba(255, 255, 255, 0.08)'
} as const

const StatusCard = ({
  icon,
  iconColor,
  title,
  description,
  actionLabel,
  actionTo
}: {
  icon: React.ReactNode
  iconColor: string
  title: string
  description: string
  actionLabel: string
  actionTo: string
}) => {
  return (
    <Center style={shellStyle}>
      <Paper radius="xl" p="xl" style={cardStyle}>
        <Stack align="center" gap="lg">
          <ThemeIcon
            size={72}
            radius="xl"
            variant="light"
            color={iconColor}
            styles={{
              root: {
                background: iconColor === 'red' ? 'rgba(250, 82, 82, 0.15)' : 'rgba(91, 148, 255, 0.15)'
              }
            }}
          >
            {icon}
          </ThemeIcon>

          <Stack align="center" gap={8}>
            <Title order={1} c="white" fz="1.75rem" ta="center">
              {title}
            </Title>
            <Text c="dimmed" ta="center">
              {description}
            </Text>
          </Stack>

          <Button
            component={Link}
            to={actionTo}
            radius="xl"
            size="md"
            styles={{
              root: {
                background: '#0f0f0f',
                color: '#fafafa',
                border: '1px solid rgba(255, 255, 255, 0.12)'
              }
            }}
          >
            {actionLabel}
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <Center style={shellStyle}>
        <Stack align="center" gap="md">
          <Loader color="#6b9aff" size="md" type="oval" />
          <Text c="dimmed">验证管理员权限...</Text>
        </Stack>
      </Center>
    )
  }

  if (!isAuthenticated) {
    return (
      <StatusCard
        icon={<LockKeyhole style={{ width: 36, height: 36 }} />}
        iconColor="green"
        title="需要登录"
        description="此页面需要管理员权限，请先登录您的管理员账户。"
        actionLabel="前往登录"
        actionTo="/login"
      />
    )
  }

  const isAdmin = user?.is_admin || false

  if (!isAdmin) {
    return (
      <StatusCard
        icon={<ShieldCheck style={{ width: 36, height: 36 }} />}
        iconColor="red"
        title="权限不足"
        description="抱歉，您没有访问管理后台的权限。如需管理员权限，请联系系统管理员。"
        actionLabel="返回首页"
        actionTo="/"
      />
    )
  }

  return <>{children}</>
}

export default AdminRoute
