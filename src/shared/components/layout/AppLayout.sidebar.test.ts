import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AppLayout collapsed sidebar styling', () => {
  it('centers the logo in the collapsed header', () => {
    const content = readFileSync(resolve(process.cwd(), 'src/shared/components/layout/AppLayout.module.css'), 'utf8')

    expect(content).toContain('.collapsed .brand')
    expect(content).toContain('justify-content: center;')
    expect(content).toContain('.collapsed .logo')
    expect(content).toContain('margin-inline: auto;')
  })

  it('places the admin subpage back button where header icons used to live', () => {
    const pageHeader = readFileSync(resolve(process.cwd(), 'src/shared/components/ui/PageHeader.tsx'), 'utf8')
    const backButton = readFileSync(resolve(process.cwd(), 'src/shared/components/ui/AdminBackButton.tsx'), 'utf8')
    const userPage = readFileSync(resolve(process.cwd(), 'src/pages/admin/UserManagementPage.tsx'), 'utf8')
    const subscriptionPage = readFileSync(resolve(process.cwd(), 'src/pages/admin/subscriptions/SubscriptionPlansPage.tsx'), 'utf8')

    expect(pageHeader).toContain("location.pathname.startsWith('/admin/')")
    expect(pageHeader).toContain('<AdminBackButton />')
    expect(backButton).toContain('aria-label="返回管理后台"')
    expect(backButton).toContain('to="/admin"')
    expect(userPage).toContain('<AdminBackButton />')
    expect(subscriptionPage).toContain('<AdminBackButton />')
  })

  it('hides the sidebar notification center on the dashboard homepage', () => {
    const appLayout = readFileSync(resolve(process.cwd(), 'src/shared/components/layout/AppLayout.tsx'), 'utf8')

    expect(appLayout).toContain("const showSidebarNotificationCenter = location.pathname !== '/dashboard'")
    expect(appLayout).toContain('{showSidebarNotificationCenter ? <NotificationCenter /> : null}')
  })

  it('opens the current Feishu feedback form from the support entry', () => {
    const appLayout = readFileSync(resolve(process.cwd(), 'src/shared/components/layout/AppLayout.tsx'), 'utf8')

    expect(appLayout).toContain('https://scnkmxziyu4x.feishu.cn/share/base/form/shrcnSl8JHT5LHl9e7a1nx7MQyc')
    expect(appLayout).not.toContain('https://laientech.feishu.cn/share/base/form/shrcnoqwPthTUcpJmVWPLAEABVf')
  })
})
