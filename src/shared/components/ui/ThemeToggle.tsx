import { ActionIcon, Group, Text, UnstyledButton, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { IconMoonStars, IconSun } from '@tabler/icons-react'

interface ThemeToggleProps {
  compact?: boolean
  variant?: 'icon' | 'row'
}

export default function ThemeToggle({ compact = false, variant = 'icon' }: ThemeToggleProps) {
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('dark')
  const isLight = computedColorScheme === 'light'
  const nextColorScheme = isLight ? 'dark' : 'light'
  const label = isLight ? '切换到深色主题' : '切换到浅色主题'
  const Icon = isLight ? IconMoonStars : IconSun

  if (variant === 'row') {
    return (
      <UnstyledButton
        aria-label={label}
        title={label}
        onClick={() => setColorScheme(nextColorScheme)}
        style={{
          width: '100%',
          minHeight: 46,
          display: 'flex',
          alignItems: 'center',
          justifyContent: compact ? 'center' : 'flex-start',
          gap: 12,
          padding: compact ? 0 : '10px 12px',
          borderRadius: 'var(--mantine-radius-sm)',
          color: 'var(--app-nav-text)',
          transition: 'background-color var(--app-transition), color var(--app-transition)',
        }}
      >
        <Group gap="sm" wrap="nowrap">
          <Icon size={24} stroke={1.5} />
          {!compact ? (
            <Text size="sm" fw={500}>
              {isLight ? '深色主题' : '浅色主题'}
            </Text>
          ) : null}
        </Group>
      </UnstyledButton>
    )
  }

  return (
    <ActionIcon
      aria-label={label}
      title={label}
      variant="default"
      size="lg"
      onClick={() => setColorScheme(nextColorScheme)}
      styles={{
        root: {
          background: 'var(--app-surface)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
          boxShadow: 'var(--app-shadow)',
        },
      }}
    >
      <Icon size={18} stroke={1.8} />
    </ActionIcon>
  )
}
