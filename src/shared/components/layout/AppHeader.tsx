import { Link, useLocation } from 'react-router-dom'
import {
  AppShell,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Stack,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useAuth, UserMenu } from '@/features/auth'
import BrandLockup from '@/shared/components/brand/BrandLockup'
import NotificationCenter from '@/shared/components/feedback/NotificationCenter'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'
import ThemeToggle from '@/shared/components/ui/ThemeToggle'

const navItems = [
  { to: '/dashboard', label: '仪表盘' },
  { to: '/projects', label: '项目' },
  { to: '/pricing', label: '订阅充值' },
]

export default function AppHeader() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const [opened, { open, close }] = useDisclosure(false)

  return (
    <>
      <AppShell.Header
        px={{ base: 20, md: 120 }}
        style={{
          borderBottomColor: 'transparent',
          background: 'rgba(0, 0, 0, 0.38)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Group h={76} justify="space-between" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={opened ? close : open}
              hiddenFrom="md"
              size="sm"
              aria-label="打开导航菜单"
            />
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              <BrandLockup markSize={36} size={22} tone="dark" />
            </Link>
          </Group>

          <Group
            gap={4}
            visibleFrom="md"
            px={6}
            py={5}
            wrap="nowrap"
            style={{
              borderRadius: 999,
              background: 'rgb(255 255 255 / 8%)',
              border: '1px solid var(--app-border)',
              boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 10%)',
            }}
          >
            {navItems.map((item) => (
              <NavButton
                key={item.to}
                to={item.to}
                label={item.label}
                active={location.pathname.startsWith(item.to)}
              />
            ))}
          </Group>

          <Group gap="sm" wrap="nowrap">
            <LanguageSwitcher compact />
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <NotificationCenter />
                <UserMenu />
              </>
            ) : (
              <>
                <Button component={Link} to="/login" variant="subtle" color="gray" radius="xl">
                  登录
                </Button>
                <Button
                  component={Link}
                  to="/register"
                  color="gray"
                  radius="xl"
                  styles={{
                    root: {
                      background: '#ffffff',
                      color: '#000000',
                      '&:hover': {
                        background: 'rgb(255 255 255 / 88%)',
                      },
                    },
                  }}
                >
                  注册
                </Button>
              </>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <Drawer
        opened={opened}
        onClose={close}
        title="导航"
        padding="md"
        size="80%"
        hiddenFrom="md"
      >
        <Stack gap="xs">
          <LanguageSwitcher />
          {navItems.map((item) => (
            <NavButton
              key={item.to}
              to={item.to}
              label={item.label}
              active={location.pathname.startsWith(item.to)}
              onNavigate={close}
              fullWidth
            />
          ))}
          <Divider my="sm" />
          {isAuthenticated ? (
            <Button component={Link} to="/projects" variant="light" color="brand" onClick={close}>
              打开项目
            </Button>
          ) : (
            <>
              <Button component={Link} to="/login" variant="subtle" color="gray" onClick={close}>
                登录
              </Button>
              <Button component={Link} to="/register" color="brand" onClick={close}>
                注册
              </Button>
            </>
          )}
        </Stack>
      </Drawer>
    </>
  )
}

interface NavButtonProps {
  active?: boolean
  fullWidth?: boolean
  label: string
  onNavigate?: () => void
  to: string
}

function NavButton({ active = false, fullWidth = false, label, onNavigate, to }: NavButtonProps) {
  return (
    <UnstyledButton
      component={Link}
      to={to}
      onClick={onNavigate}
      style={(theme) => ({
        display: 'block',
        width: fullWidth ? '100%' : 'auto',
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        borderRadius: theme.radius.xl,
        color: active ? 'var(--app-nav-active-text)' : 'var(--app-nav-text)',
        backgroundColor: active ? 'rgb(255 255 255 / 10%)' : 'transparent',
        fontWeight: active ? 600 : 500,
        transition: 'background-color 150ms ease, color 150ms ease',
      })}
    >
      {label}
    </UnstyledButton>
  )
}
