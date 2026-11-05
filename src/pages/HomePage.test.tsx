import React from 'react'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import HomePage from '@/pages/HomePage'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import type { Locale } from '@/shared/i18n/locales'
import { tokenPackageService } from '@/features/subscriptions/services/tokenPackageService'
import type { TokenPackage } from '@/features/subscriptions/types'
import {
  checkWindowsDownloadAvailability,
  getLatestWindowsRelease,
} from '@/features/desktop/services/desktopReleaseService'

const homePageSource = readFileSync('src/pages/HomePage.tsx', 'utf8')
const brandMediaSource = readFileSync('src/shared/constants/brandMedia.ts', 'utf8')
const featuresSectionSource = homePageSource.slice(
  homePageSource.indexOf('function FeaturesSection()'),
  homePageSource.indexOf('function FeatureCard('),
)

vi.mock('framer-motion', async () => {
  const ReactActual = await vi.importActual<typeof React>('react')
  const motion = new Proxy({}, { get: (_, tag: string) => ({ children, variants, initial, animate, exit, whileHover, transition, ...props }: any) => ReactActual.createElement(tag, props, children) })
  return { motion, useInView: () => true }
})
vi.mock('@/features/auth', () => ({ useAuth: () => ({ isAuthenticated: false, isInitialized: true, isLoading: false }), UserMenu: () => null }))
vi.mock('@/features/subscriptions/hooks', () => ({ useTokenBalance: () => ({ balance: null }) }))
vi.mock('@/features/subscriptions/services/tokenPackageService', () => ({ tokenPackageService: { listPackages: vi.fn() } }))
vi.mock('@/features/desktop/services/desktopReleaseService', () => ({
  checkWindowsDownloadAvailability: vi.fn(),
  getLatestWindowsRelease: vi.fn(),
  getWindowsDownloadUrl: () => '/api/v1/desktop/download/windows',
  getServerWindowsDownloadUrl: () => '/api/v1/desktop/download/windows?source=server',
  formatDesktopPackageSize: (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`,
  isWindowsDesktopDownloadEnabled: true,
}))

const renderHomePage = (initialLocale: Locale = 'zh-CN') => render(
  <MemoryRouter>
    <AppMantineProvider>
      {/* jsdom has no layout; disable floating-menu visibility/transition heuristics. */}
      <MantineProvider env="test">
        <I18nProvider initialLocale={initialLocale}>
          <HomePage />
        </I18nProvider>
      </MantineProvider>
    </AppMantineProvider>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.mocked(tokenPackageService.listPackages).mockReset()
  vi.mocked(tokenPackageService.listPackages).mockReturnValue(new Promise(() => {}))
  vi.mocked(checkWindowsDownloadAvailability).mockReset()
  vi.mocked(checkWindowsDownloadAvailability).mockResolvedValue(undefined)
  vi.mocked(getLatestWindowsRelease).mockReset()
  vi.mocked(getLatestWindowsRelease).mockReturnValue(new Promise(() => {}))
})

describe('HomePage Windows downloads', () => {
  it('does not offer a Windows client download', () => {
    renderHomePage()

    expect(screen.queryByRole('button', { name: '下载 Windows 版' })).not.toBeInTheDocument()
    expect(screen.queryByText('下载通道一')).not.toBeInTheDocument()
    expect(screen.queryByText('下载通道二')).not.toBeInTheDocument()
    expect(getLatestWindowsRelease).not.toHaveBeenCalled()
    expect(checkWindowsDownloadAvailability).not.toHaveBeenCalled()
  })
})
describe('HomePage hero fallback', () => {
  it('exports a stable local bitmap poster for the brand video', () => {
    expect(brandMediaSource).toContain(
      "export const brandHeroPosterUrl = '/media/narratoai-hero-poster.webp'",
    )
  })

  it('renders the brand poster before video playback is available', () => {
    renderHomePage()

    expect(document.querySelector('video')).toHaveAttribute(
      'poster',
      '/media/narratoai-hero-poster.webp',
    )
  })
})

describe('HomePage first-viewport feature hint', () => {
  it('renders the Features heading before the delayed card animation wrapper', () => {
    expect(featuresSectionSource.indexOf('<SectionHeading')).toBeLessThan(
      featuresSectionSource.indexOf('<motion.div'),
    )
    expect(featuresSectionSource).toContain("animate={isInView ? 'visible' : 'hidden'}")
  })
})

describe('HomePage legacy promotions', () => {
  it('does not show the previous sponsor ad or filing details', () => {
    renderHomePage()

    expect(screen.queryByRole('img', { name: 'APIMart' })).not.toBeInTheDocument()
    expect(screen.queryByText(/APIMart/)).not.toBeInTheDocument()
    expect(screen.queryByText('support@narratoai.co')).not.toBeInTheDocument()
    expect(screen.queryByText('蜀ICP备2024085955号-5')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '抖音号二维码' })).not.toBeInTheDocument()
  })
})

describe('HomePage pricing', () => {
  const regularPackage = { id: 'regular', display_name: '新手包', price: '29.90', credit_amount: 3000,
    total_credits_with_bonus: 3000, token_amount: 3000, bonus_tokens: 0, total_tokens_with_bonus: 3000,
    is_active: true, is_trial: false, sort_order: 1 } as TokenPackage

  it('shows the current regular package and excludes trial and inactive offers', async () => {
    vi.mocked(tokenPackageService.listPackages).mockResolvedValue({ packages: [
      { ...regularPackage, id: 'trial', display_name: '体验价', price: '1.90', credit_amount: 500, is_trial: true, sort_order: 0 },
      { ...regularPackage, id: 'inactive', display_name: '旧套餐', price: '9.90', is_active: false, sort_order: -1 },
      regularPackage,
    ], total: 3 })
    renderHomePage()
    expect(screen.getByText('一次购买，按需使用')).toBeInTheDocument()
    expect(await screen.findByText('¥29.90')).toBeInTheDocument()
    expect(screen.getByText('新手包')).toBeInTheDocument()
    expect(screen.getByText('3,000 Credits')).toBeInTheDocument()
    expect(screen.getByText('到账后 30 天有效')).toBeInTheDocument()
    expect(screen.getByText('微信 / 支付宝扫码支付')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看全部充值套餐' })).toHaveAttribute('href', '/pricing')
    expect(screen.queryByText(/USD|选择订阅|月付订阅|体验价|¥1.90|每个账号限购一次|旧套餐/)).not.toBeInTheDocument()
  })

  it('uses updated API prices and total Credits instead of a hardcoded replacement price', async () => {
    vi.mocked(tokenPackageService.listPackages).mockResolvedValue({ packages: [{ ...regularPackage,
      price: '39.90', credit_amount: 4000, bonus_credits: 500, total_credits_with_bonus: 4500 }], total: 1 })
    renderHomePage()
    expect(await screen.findByText('¥39.90')).toBeInTheDocument()
    expect(screen.getByText('4,500 Credits')).toBeInTheDocument()
    expect(screen.queryByText('¥29.90')).not.toBeInTheDocument()
  })

  it('does not display an old price while packages are loading', () => {
    renderHomePage()
    expect(screen.getByText('正在加载充值套餐…')).toBeInTheDocument()
    expect(screen.queryByText('¥1.90')).not.toBeInTheDocument()
  })

  it('keeps the pricing link available when package loading fails', async () => {
    vi.mocked(tokenPackageService.listPackages).mockRejectedValue(new Error('Unavailable'))
    renderHomePage()
    expect(await screen.findByText('暂时无法加载套餐价格，请查看全部充值套餐。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看全部充值套餐' })).toHaveAttribute('href', '/pricing')
    expect(screen.queryByText('¥1.90')).not.toBeInTheDocument()
  })

  it('does not promote a trial offer when no regular package is available', async () => {
    vi.mocked(tokenPackageService.listPackages).mockResolvedValue({ packages: [{ ...regularPackage, is_trial: true }], total: 1 })
    renderHomePage()
    expect(await screen.findByText('暂无在售充值套餐')).toBeInTheDocument()
    expect(screen.queryByText('¥29.90')).not.toBeInTheDocument()
  })
})
