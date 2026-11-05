import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Indicator,
  Loader,
  Paper,
  Popover,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core'
import {
  IconBell,
  IconCheck,
  IconDots,
  IconFolder,
  IconRefresh,
  IconSettings,
  IconShield,
  IconTrash,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react'
import { useNotifications } from '@/shared/hooks/useNotifications'
import { NotificationType } from '@/shared/types/system'
import type { NotificationWithActions } from '@/shared/types/system'

interface NotificationCenterProps {
  className?: string
}

const iconMap = {
  [NotificationType.SYSTEM]: IconSettings,
  [NotificationType.PROJECT]: IconFolder,
  [NotificationType.PAYMENT]: IconWallet,
  [NotificationType.COLLABORATION]: IconUsers,
  [NotificationType.SECURITY]: IconShield,
}

const colorMap = {
  [NotificationType.SYSTEM]: 'blue',
  [NotificationType.PROJECT]: 'green',
  [NotificationType.PAYMENT]: 'yellow',
  [NotificationType.COLLABORATION]: 'violet',
  [NotificationType.SECURITY]: 'red',
} as const

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    return diffMinutes < 1 ? '刚刚' : `${diffMinutes} 分钟前`
  }

  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  if (diffDays < 7) {
    return `${diffDays} 天前`
  }

  return date.toLocaleDateString('zh-CN')
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: NotificationWithActions
  onMarkAsRead: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [opened, setOpened] = useState(false)
  const Icon = iconMap[notification.type] ?? IconBell
  const color = colorMap[notification.type] ?? 'gray'

  return (
    <Paper p="md" withBorder radius="md" bg={notification.is_read ? undefined : 'dark.6'}>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Group align="flex-start" wrap="nowrap">
          <ActionIcon variant="light" color={color} radius="xl" size="lg">
            <Icon size={18} />
          </ActionIcon>
          <Stack gap={6}>
            <Group gap={8} wrap="wrap">
              <Text fw={600}>{notification.title}</Text>
              {!notification.is_read ? <Badge color="brand">未读</Badge> : null}
            </Group>
            <Text size="sm" c="dimmed">
              {notification.message}
            </Text>
            <Text size="xs" c="dimmed">
              {formatDate(notification.created_at)}
            </Text>
          </Stack>
        </Group>

        <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <ActionIcon variant="subtle" color="gray" onClick={() => setOpened((value) => !value)}>
              <IconDots size={16} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p="xs">
            <Stack gap="xs">
              {!notification.is_read ? (
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconCheck size={14} />}
                  onClick={async () => {
                    await onMarkAsRead(notification.id)
                    setOpened(false)
                  }}
                >
                  标记已读
                </Button>
              ) : null}
              <Button
                size="xs"
                color="red"
                variant="subtle"
                leftSection={<IconTrash size={14} />}
                onClick={async () => {
                  await onDelete(notification.id)
                  setOpened(false)
                }}
              >
                删除
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
    </Paper>
  )
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ className }) => {
  const [opened, setOpened] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const {
    notifications,
    isLoading,
    error,
    hasMore,
    loadMore,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getUnreadCount,
    clearError,
  } = useNotifications({ enablePolling: true, pollingInterval: 30000, pageSize: 20 })

  const filteredNotifications = useMemo(
    () => (filter === 'unread' ? notifications.filter((item) => !item.is_read) : notifications),
    [filter, notifications]
  )

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={420} shadow="lg">
      <Popover.Target>
        <Indicator disabled={getUnreadCount() === 0} label={getUnreadCount()} size={16} offset={4}>
          <ActionIcon variant="subtle" color="gray" size="lg" className={className} onClick={() => setOpened((v) => !v)}>
            <IconBell size={18} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Text fw={700}>通知中心</Text>
              <Text size="sm" c="dimmed">
                共 {notifications.length} 条，未读 {getUnreadCount()} 条
              </Text>
            </div>
            <Group gap="xs">
              <ActionIcon variant="light" color="brand" onClick={async () => { await refreshNotifications(); clearError() }}>
                <IconRefresh size={16} />
              </ActionIcon>
              <Button size="xs" variant="subtle" onClick={markAllAsRead}>
                全部已读
              </Button>
            </Group>
          </Group>

          <SegmentedControl
            fullWidth
            value={filter}
            onChange={(value) => setFilter(value as 'all' | 'unread')}
            data={[
              { label: '全部', value: 'all' },
              { label: '未读', value: 'unread' },
            ]}
          />

          {error ? (
            <Paper p="sm" withBorder radius="md">
              <Text size="sm" c="red">
                {error}
              </Text>
            </Paper>
          ) : null}

          <ScrollArea.Autosize mah={420}>
            <Stack gap="sm">
              {isLoading ? (
                <Group justify="center" py="xl">
                  <Loader size="sm" />
                </Group>
              ) : filteredNotifications.length === 0 ? (
                <Paper p="xl" withBorder radius="md">
                  <Text c="dimmed" ta="center">
                    暂无通知
                  </Text>
                </Paper>
              ) : (
                filteredNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotification}
                  />
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>

          {hasMore ? (
            <Button variant="default" onClick={loadMore}>
              加载更多
            </Button>
          ) : null}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

export default NotificationCenter
