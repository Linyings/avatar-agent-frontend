/**
 * AppSidebar — 全平台统一左侧导航栏
 * 深色背景 + 橙色高亮当前项
 */
import { Link, useLocation } from 'react-router-dom'
import type { ComponentType, ReactNode } from 'react'
import { navColors } from '@/theme/tokens'

export interface NavItem {
  icon: ComponentType
  label: string
  to: string
}

interface AppSidebarProps {
  topItems: NavItem[]
  midItems?: NavItem[]
  bottomItems?: NavItem[]
  logo?: ReactNode
  width?: number
  footer?: ReactNode
}

const T = {
  bg:          '#0a0a0a',
  border:      'rgba(255,255,255,0.07)',
  text:        navColors.text,
  activeText:  navColors.activeText,
  activeBg:    navColors.activeBg,
  activeBorder: navColors.activeBorder,
  hoverBg:     navColors.hoverBg,
  accent:      'var(--color-accent)',
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 12px',
        borderRadius: 8,
        textDecoration: 'none',
        fontSize: 13, fontWeight: active ? 500 : 400,
        color: active ? T.activeText : T.text,
        background: active ? T.activeBg : 'transparent',
        borderLeft: active ? `2px solid ${T.activeBorder}` : '2px solid transparent',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = T.hoverBg }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
    >
      <span style={{ color: active ? T.accent : 'inherit', flexShrink: 0, opacity: active ? 1 : 0.7 }}>
        <Icon />
      </span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.label}
      </span>
    </Link>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.border, margin: '6px 0' }} />
}

export function AppSidebar({
  topItems, midItems, bottomItems, logo, width = 220, footer,
}: AppSidebarProps) {
  const { pathname } = useLocation()

  return (
    <aside style={{
      width, minWidth: width, flexShrink: 0,
      height: '100vh',
      background: T.bg,
      borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Logo */}
      {logo && (
        <div style={{ padding: '18px 16px 10px', flexShrink: 0 }}>
          {logo}
        </div>
      )}

      {/* Top nav */}
      <nav style={{ padding: '4px 8px', flex: 1 }}>
        {topItems.map(item => (
          <NavLink key={item.to + item.label} item={item} active={pathname === item.to} />
        ))}

        {midItems && midItems.length > 0 && (
          <>
            <Divider />
            {midItems.map(item => (
              <NavLink key={item.to + item.label} item={item} active={pathname === item.to} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom nav */}
      {bottomItems && bottomItems.length > 0 && (
        <div style={{ padding: '4px 8px 8px', borderTop: `1px solid ${T.border}` }}>
          {bottomItems.map(item => (
            <NavLink key={item.to + item.label} item={item} active={pathname === item.to} />
          ))}
        </div>
      )}

      {/* Footer slot */}
      {footer && (
        <div style={{ padding: '8px 12px 12px', borderTop: `1px solid ${T.border}` }}>
          {footer}
        </div>
      )}
    </aside>
  )
}
