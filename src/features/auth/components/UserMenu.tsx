import { Avatar, Badge, Group, Menu, Text, UnstyledButton } from '@mantine/core'
import {
  IconChevronDown,
  IconLogout,
} from '@tabler/icons-react'
import { useAuth } from '../contexts/AuthContext'

interface UserMenuProps {
  className?: string
  compact?: boolean
  embedded?: boolean
  extraItems?: React.ReactNode
  tone?: 'default' | 'inverse'
  showChevron?: boolean
}

function createFallbackAvatar(name: string) {
  const initial = escapeSvgText((name.trim().charAt(0) || '?').toUpperCase())
  const svg = `
    <svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" fill="#3f7cff"/>
      <text x="20" y="25" text-anchor="middle" fill="#ffffff" font-size="16" font-weight="bold" font-family="Inter, sans-serif">${initial}</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const UserMenu: React.FC<UserMenuProps> = ({
  className,
  compact = false,
  embedded = false,
  extraItems,
  tone = 'default',
  showChevron = true,
}) => {
  const { user, logout, isAuthenticated, isAdmin } = useAuth()

  if (!isAuthenticated || !user) {
    return null
  }

  const displayName = user.display_name || user.username
  const avatarSrc = user.avatar_url || createFallbackAvatar(displayName)
  const heroAvatar = compact && embedded && tone === 'inverse'

  return (
    <Menu shadow="md" width={260} position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton
          className={className}
          style={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            borderRadius: theme.radius.xl,
            color: tone === 'inverse' ? '#ffffff' : 'inherit',
            height: heroAvatar ? 40 : compact ? 38 : undefined,
            padding: heroAvatar ? 0 : compact ? '0 10px 0 4px' : 0,
            background: tone === 'inverse' && !embedded ? 'rgb(255 255 255 / 10%)' : 'transparent',
            border: tone === 'inverse' && !embedded ? '1px solid rgb(255 255 255 / 18%)' : '1px solid transparent',
            backdropFilter: tone === 'inverse' && !embedded ? 'blur(14px)' : undefined,
            transition: 'background 160ms ease, border-color 160ms ease',
            '&:hover': {
              background: tone === 'inverse' ? 'rgb(255 255 255 / 12%)' : undefined,
              borderColor: tone === 'inverse' && !embedded ? 'rgb(255 255 255 / 28%)' : 'transparent',
            },
          })}
        >
          <Group gap={compact ? 7 : 'sm'} wrap="nowrap">
            <Avatar
              src={avatarSrc}
              alt={displayName}
              radius="xl"
              size={heroAvatar ? 40 : compact ? 32 : undefined}
              style={heroAvatar ? {
                border: '1px solid rgb(255 255 255 / 36%)',
                boxShadow: '0 12px 28px rgb(0 0 0 / 24%)',
              } : undefined}
            />
            {!compact && (
              <div style={{ minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                  <Text fw={600} truncate>
                    {displayName}
                  </Text>
                  {isAdmin ? <Badge color="brand">管理员</Badge> : null}
                </Group>
                <Text size="xs" c="dimmed" truncate>
                  {user.email}
                </Text>
              </div>
            )}
            {showChevron ? (
              <IconChevronDown
                size={16}
                stroke={1.8}
                color={tone === 'inverse' ? 'rgb(255 255 255 / 72%)' : undefined}
              />
            ) : null}
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        {extraItems}
        {extraItems ? <Menu.Divider role="separator" /> : null}
        <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={logout}>
          退出登录
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

export default UserMenu
