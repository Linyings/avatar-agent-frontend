import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ActionIcon,
  AppShell,
  Group,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  CreditCardIcon,
  FolderOpenIcon,
  ShieldCheckIcon,
  TableCellsIcon,
  UserIcon,
} from '@/shared/icons/tabler'
import BrandLockup from '@/shared/components/brand/BrandLockup'
import { PRODUCT_NAME } from '@/shared/brand/identity'
import NotificationCenter from '@/shared/components/feedback/NotificationCenter'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'
import ThemeToggle from '@/shared/components/ui/ThemeToggle'
import { useAuth, UserMenu } from '@/features/auth'
import AppHeader from './AppHeader'
import classes from './AppLayout.module.css'

interface AppLayoutProps {
  children: React.ReactNode
  userMenuItems?: React.ReactNode
}

type NavIcon = React.ComponentType<{
  className?: string
  height?: number
  stroke?: number
  width?: number
}>

interface InternalNavItem {
  icon: NavIcon
  label: string
  to: string
}

interface ExternalNavItem {
  href: string
  icon: NavIcon
  label: string
}

type NavItemConfig = InternalNavItem | ExternalNavItem

const SIDEBAR_EXPANDED_WIDTH = 258
const SIDEBAR_COLLAPSED_WIDTH = 82

const navItems: InternalNavItem[] = [
  { to: '/dashboard', label: '仪表盘', icon: ChartBarIcon },
  { to: '/projects', label: '项目', icon: FolderOpenIcon },
  { to: '/subscription', label: '订阅充值', icon: CreditCardIcon },
  { to: '/consumption-records', label: '消费记录', icon: TableCellsIcon },
]

const accountNavItems: NavItemConfig[] = [
  { to: '/profile', label: '个人资料', icon: UserIcon },
  {
    href: 'https://scnkmxziyu4x.feishu.cn/share/base/form/shrcnSl8JHT5LHl9e7a1nx7MQyc',
    label: '工单反馈',
    icon: ChatBubbleLeftRightIcon,
  },
]

export default function AppLayout({
  children,
  userMenuItems,
}: AppLayoutProps) {
  const location = useLocation()
  const { isAuthenticated, isAdmin, user } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const isNarrowLayout = useMediaQuery('(max-width: 62em)')
  const sidebarCompact = sidebarCollapsed || isNarrowLayout
  const showSidebarNotificationCenter = location.pathname !== '/dashboard'
  const navbarClassName = sidebarCompact
    ? `${classes.navbar} ${classes.collapsed}`
    : classes.navbar
  const userDisplayName = user?.display_name || user?.username || '账户'

  if (!isAuthenticated) {
    return (
      <AppShell
        header={{ height: 76 }}
        padding="md"
        styles={{
          main: {
            background: 'transparent',
          },
        }}
      >
        <AppHeader />
        <AppShell.Main>
          {children}
        </AppShell.Main>
      </AppShell>
    )
  }

  return (
    <AppShell
      navbar={{
        width: { base: SIDEBAR_COLLAPSED_WIDTH, md: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH },
        breakpoint: 'sm',
      }}
      padding={0}
      classNames={{ navbar: classes.navbarShell }}
      styles={{
        navbar: {
          transition: 'width var(--app-transition)',
        },
        main: {
          minHeight: '100vh',
          background: 'var(--app-body-background)',
        },
      }}
    >
      <AppShell.Navbar>
        <nav className={navbarClassName}>
          <div className={classes.navbarMain}>
            <Group className={classes.header} justify="space-between" wrap="nowrap">
              <Link className={classes.brand} to="/" aria-label={`${PRODUCT_NAME}首页`}>
                <span className={classes.brandText}>
                  <BrandLockup markSize={36} size={22} />
                </span>
              </Link>
              <Tooltip
                label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
                position="right"
                withArrow
              >
                <ActionIcon
                  visibleFrom="md"
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  size={34}
                  aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
                  onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
                >
                  {sidebarCollapsed ? (
                    <ChevronDoubleRightIcon width={18} height={18} />
                  ) : (
                    <ChevronDoubleLeftIcon width={18} height={18} />
                  )}
                </ActionIcon>
              </Tooltip>
            </Group>

            <div className={classes.links}>
              {navItems.map((item) => {
                const active = location.pathname.startsWith(item.to)
                return (
                  <NavItem
                    key={item.to}
                    active={active}
                    collapsed={sidebarCompact}
                    icon={item.icon}
                    label={item.label}
                    to={item.to}
                  />
                )
              })}
            </div>
          </div>

          <div className={classes.footer}>
            <div className={classes.sidebarSection}>
              <span className={classes.sectionLabel}>账户</span>
              <div className={classes.links}>
                {accountNavItems.map((item) => (
                  <NavItem
                    key={item.label}
                    active={'to' in item && location.pathname.startsWith(item.to)}
                    collapsed={sidebarCompact}
                    {...item}
                  />
                ))}
                {isAdmin ? (
                  <NavItem
                    active={location.pathname.startsWith('/admin')}
                    collapsed={sidebarCompact}
                    icon={ShieldCheckIcon}
                    label="管理后台"
                    to="/admin"
                  />
                ) : null}
              </div>
            </div>

            <div className={classes.sidebarSection}>
              <span className={classes.sectionLabel}>偏好</span>
              <div className={classes.links}>
                <LanguageSwitcher compact={sidebarCompact} variant="row" />
                <ThemeToggle compact={sidebarCompact} variant="row" />
              </div>
            </div>

            <Group
              className={classes.userFooter}
              visibleFrom="md"
              justify={sidebarCompact ? 'center' : 'space-between'}
              gap="xs"
              wrap="nowrap"
            >
              <div className={classes.userIdentity}>
                <UserMenu
                  className={classes.userButton}
                  compact
                  extraItems={userMenuItems}
                  showChevron={false}
                />
                <span className={classes.userName}>{userDisplayName}</span>
              </div>
              {showSidebarNotificationCenter ? <NotificationCenter /> : null}
            </Group>
          </div>
        </nav>
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>
        {children}
      </AppShell.Main>
    </AppShell>
  )
}

interface NavItemProps {
  active?: boolean
  collapsed?: boolean
  fullWidth?: boolean
}

type NavItemPropsWithTarget = NavItemProps & NavItemConfig

function NavItem({
  active = false,
  collapsed = false,
  fullWidth = false,
  icon: Icon,
  label,
  ...target
}: NavItemPropsWithTarget) {
  const content = (
    <>
      <Icon className={classes.linkIcon} stroke={1.5} />
      <span className={classes.linkLabel}>{label}</span>
    </>
  )

  const navControl = 'href' in target
    ? (
      <UnstyledButton
        component="a"
        className={classes.link}
        data-active={active || undefined}
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={collapsed ? label : undefined}
      >
        {content}
      </UnstyledButton>
    )
    : (
      <UnstyledButton
        component={Link}
        className={classes.link}
        data-active={active || undefined}
        to={target.to}
        aria-label={collapsed ? label : undefined}
      >
        {content}
      </UnstyledButton>
    )

  return collapsed && !fullWidth ? (
    <Tooltip label={label} position="right" withArrow>
      {navControl}
    </Tooltip>
  ) : (
    navControl
  )
}
