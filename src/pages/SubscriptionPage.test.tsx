import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SubscriptionPage from './SubscriptionPage'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import { useTokenBalance, useTokenPackages } from '@/features/subscriptions/hooks'
import type { CreditPaymentOrder, TokenPackage } from '@/features/subscriptions/types'
import { Button } from '@mantine/core'

vi.mock('@/features/subscriptions/hooks', () => ({ useTokenBalance: vi.fn(), useTokenPackages: vi.fn() }))
vi.mock('@/features/subscriptions/components/CreditPaymentModal', () => ({
  CreditPaymentModal: ({ package: pkg, onPaid }: { package: TokenPackage; onPaid: (order: CreditPaymentOrder) => void }) => <div data-testid="credit-payment-modal">
    {pkg.name}
    <Button onClick={() => onPaid({
      out_trade_no: 'CR-PAGE', provider: 'alipay', status: 'paid', amount_cny: '1.90',
      credits: 500, code_url: 'https://qr.example/alipay',
      paid_at: '2026-08-03T06:05:06Z', expires_at: '2026-09-02T06:05:06Z',
    })}>complete payment</Button>
  </div>,
}))

const trial: TokenPackage = {
  id: 'trial', name: 'trial_500', display_name: '体验包', token_amount: 500,
  price: '1.90', bonus_tokens: 0, total_tokens_with_bonus: 500, unit_price: '3.80',
  currency: 'CNY', validity_hours: 720, is_trial: true, per_account_purchase_limit: 1,
  is_active: true, is_featured: true, sort_order: 0, created_at: '', updated_at: '',
}

function setup(pkg: TokenPackage = trial) {
  vi.mocked(useTokenBalance).mockReturnValue({ balance: { user_id: 'u', total_tokens: 500, used_tokens: 0, remaining_tokens: 500, total_credits: 500, used_credits: 0, remaining_credits: 500, total_recharged: '1.90', last_recharge_at: null, created_at: '', updated_at: '', next_expiry_at: '2026-09-01T00:00:00Z' }, isLoading: false, error: null, refetch: vi.fn() })
  vi.mocked(useTokenPackages).mockReturnValue({ packages: [pkg], isLoading: false, error: null, refetch: vi.fn() })
  render(<AppMantineProvider><SubscriptionPage /></AppMantineProvider>)
}

describe('Credits store', () => {
  it('keeps a claimed trial visible, sorts it first, and disables repurchase', () => {
    vi.mocked(useTokenBalance).mockReturnValue({ balance: { user_id: 'u', total_tokens: 500, used_tokens: 0, remaining_tokens: 500, total_credits: 500, used_credits: 0, remaining_credits: 500, total_recharged: '1.90', last_recharge_at: null, created_at: '', updated_at: '', trial_claimed: true }, isLoading: false, error: null, refetch: vi.fn() })
    vi.mocked(useTokenPackages).mockReturnValue({ packages: [{ ...trial, id: 'standard', display_name: 'standard', is_trial: false, sort_order: -1 }, trial], isLoading: false, error: null, refetch: vi.fn() })
    render(<AppMantineProvider><SubscriptionPage /></AppMantineProvider>)
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('\u4f53\u9a8c\u5305')
    expect(screen.getByRole('button', { name: /\u5df2\u8d2d\u4e70/ })).toBeDisabled()
  })
  it('shows CNY one-time packages and expiry without subscription copy', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Credits 商店' })).toBeInTheDocument()
    expect(screen.getByText('¥1.90')).toBeInTheDocument()
    expect(screen.getByText('500 Credits')).toBeInTheDocument()
    expect(screen.getByText('购买后 30 天有效')).toBeInTheDocument()
    expect(screen.queryByText(/USD|美元|自动续费|月付/)).not.toBeInTheDocument()
  })
  it('shows the package description when provided', () => {
    setup({ ...trial, description: '\u5927\u7ea6\u53ef\u4ee5\u526a\u8f91\u5236\u4f5c10\u4e2a\u4f5c\u54c1\uff0840\u5206\u949f\u7d20\u6750\uff09' })
    expect(screen.getByText('\u5927\u7ea6\u53ef\u4ee5\u526a\u8f91\u5236\u4f5c10\u4e2a\u4f5c\u54c1\uff0840\u5206\u949f\u7d20\u6750\uff09')).toBeInTheDocument()
  })
  it('opens the provider-neutral payment modal', () => { setup(); fireEvent.click(screen.getByRole('button', { name: '立即购买' })); expect(screen.getByTestId('credit-payment-modal')).toHaveTextContent('trial_500') })
  it('disables a previously purchased trial', () => { setup({ ...trial, purchase_eligible: false }); expect(screen.getByRole('button', { name: '已购买' })).toBeDisabled() })
  it('closes the payment modal, refreshes data, and renders the exact newly purchased lot expiry', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    const refetchPackages = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useTokenBalance).mockReturnValue({ balance: { user_id: 'u', total_tokens: 0, used_tokens: 0, remaining_tokens: 0, total_recharged: '0', last_recharge_at: null, created_at: '', updated_at: '', next_expiry_at: '2026-08-20T00:00:00Z' }, isLoading: false, error: null, refetch })
    vi.mocked(useTokenPackages).mockReturnValue({ packages: [trial], isLoading: false, error: null, refetch: refetchPackages })
    render(<AppMantineProvider><SubscriptionPage /></AppMantineProvider>)
    fireEvent.click(screen.getByRole('button', { name: /\u7acb\u5373\u8d2d\u4e70/ }))
    fireEvent.click(screen.getByRole('button', { name: 'complete payment' }))

    await waitFor(() => expect(screen.queryByTestId('credit-payment-modal')).not.toBeInTheDocument())
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(refetchPackages).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('latest-purchase-expiry')).toHaveTextContent(new Date('2026-09-02T06:05:06Z').toLocaleString())
    expect(screen.getByTestId('latest-purchase-expiry')).not.toHaveTextContent(new Date('2026-08-20T00:00:00Z').toLocaleString())
  })
})
