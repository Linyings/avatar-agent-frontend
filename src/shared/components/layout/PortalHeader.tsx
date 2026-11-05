import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Burger,
  Button,
  Drawer,
  Group,
  Paper,
  Stack,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useAuth, UserMenu } from '@/features/auth'
import BrandLockup from '@/shared/components/brand/BrandLockup'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'
import ThemeToggle from '@/shared/components/ui/ThemeToggle'
import { useIsScrolledToTop } from '@/shared/hooks/useScrollAnimation'

export default function PortalHeader() {
  const { isAuthenticated } = useAuth()
  const isScrolledToTop = useIsScrolledToTop(20)
  const [opened, { open, close }] = useDisclosure(false)

  const headerStyle = {
    borderBottom: `1px solid ${isScrolledToTop ? 'var(--app-border)' : 'transparent'}`,
    background: isScrolledToTop ? 'var(--app-header-bg-strong)' : 'var(--app-header-bg-subtle)',
    backdropFilter: 'blur(18px)',
  }

  return (
    <>
      <motion.header
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transition: 'background 300ms ease, border-color 300ms ease, backdrop-filter 300ms ease',
          ...headerStyle,
        }}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <Group h={76} justify="space-between" px="md" maw={1280} mx="auto" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={opened ? close : open}
              hiddenFrom="md"
              size="sm"
              aria-label="打开导航菜单"
            />
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              <BrandLockup markSize={32} size={22} />
            </Link>
          </Group>

          <Paper
            visibleFrom="md"
            radius="xl"
            px="xs"
            py={6}
            bg="var(--app-surface)"
            style={{ border: '1px solid var(--app-border)' }}
          >
            <Group gap={4} wrap="nowrap">
              <NavLink href="/" label="首页" />
              <NavLink href="/#features" label="功能" />
              <NavLink href="/#pricing" label="定价" />
              <NavLink href="/resources" label="资源" />
            </Group>
          </Paper>

          <Group gap="sm" wrap="nowrap">
            <LanguageSwitcher compact />
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <Button component={Link} to="/projects" color="brand">
                  进入控制台
                </Button>
                <UserMenu />
              </>
            ) : (
              <>
                <Button component={Link} to="/login" variant="subtle" color="gray">
                  登录
                </Button>
                <Button component={Link} to="/register" color="brand">
                  注册
                </Button>
              </>
            )}
          </Group>
        </Group>
      </motion.header>
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
          <NavLink href="/" label="首页" fullWidth onNavigate={close} />
          <NavLink href="/#features" label="功能" fullWidth onNavigate={close} />
          <NavLink href="/#pricing" label="定价" fullWidth onNavigate={close} />
          <NavLink href="/resources" label="资源" fullWidth onNavigate={close} />
        </Stack>
      </Drawer>
    </>
  )
}

function NavLink({
  href,
  label,
  fullWidth = false,
  onNavigate,
}: {
  fullWidth?: boolean
  href: string
  label: string
  onNavigate?: () => void
}) {
  const isExternal = href.startsWith('http')
  const isAnchor = href.includes('#')

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isAnchor && !isExternal) {
      e.preventDefault()
      const id = href.split('#')[1]
      if (id) {
        const element = document.getElementById(id)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' })
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
    onNavigate?.()
  }

  return (
    <UnstyledButton
      component="a"
      href={href}
      onClick={handleClick}
      style={(theme) => ({
        display: 'block',
        width: fullWidth ? '100%' : 'auto',
        borderRadius: theme.radius.xl,
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        color: 'var(--app-nav-text)',
      })}
    >
      {label}
    </UnstyledButton>
  )
}
