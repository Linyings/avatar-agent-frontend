import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreditPaymentModal } from './CreditPaymentModal'
import { paymentService } from '../services/paymentService'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import type { TokenPackage } from '../types'

vi.mock('../services/paymentService', () => ({ paymentService: { createCreditPayment: vi.fn(), getCreditPayment: vi.fn() } }))
vi.mock('react-qr-code', () => ({ default: ({ value }: { value: string }) => <div data-testid='qr-code'>{value}</div> }))

const pkg: TokenPackage = {
  id: 'trial', name: 'trial_500', display_name: '体验包', token_amount: 500, price: '1.90',
  bonus_tokens: 0, total_tokens_with_bonus: 500, unit_price: '3.80', currency: 'CNY',
  validity_hours: 720, is_trial: true, per_account_purchase_limit: 1, is_active: true,
  is_featured: true, sort_order: 0, created_at: '', updated_at: '',
}

const wechatOrder = {
  out_trade_no: 'CR-WX', provider: 'wechat' as const, status: 'pending' as const,
  amount_cny: '1.90', credits: 500, code_url: 'https://qr.example/wechat',
}
const alipayOrder = {
  out_trade_no: 'CR-ALI', provider: 'alipay' as const, status: 'pending' as const,
  amount_cny: '1.90', credits: 500, code_url: 'https://qr.example/alipay',
}

const mockAlipayWindow = () => vi.spyOn(window, 'open').mockReturnValue({
  closed: false,
  close: vi.fn(),
  location: { href: '' },
} as unknown as Window)

it('shows the non-refundable virtual credit notice when the payment modal opens', async () => {
  vi.mocked(paymentService.createCreditPayment).mockResolvedValue(wechatOrder)
  render(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)

  expect(screen.getByText('虚拟积分支付不予退款')).toBeInTheDocument()
  expect(screen.getByText('虚拟积分充值到账后不支持无理由退款，误购不退，请确认充值套餐与金额后再支付。')).toBeInTheDocument()
  await screen.findByTestId('qr-code')
})

it('auto-creates the WeChat order on open and shows its QR code immediately', async () => {
  vi.mocked(paymentService.createCreditPayment).mockResolvedValue(wechatOrder)
  vi.mocked(paymentService.getCreditPayment).mockResolvedValue(wechatOrder)
  const setIntervalSpy = vi.spyOn(window, 'setInterval')
  render(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)

  await waitFor(() => expect(paymentService.createCreditPayment).toHaveBeenCalledWith(pkg.id, 'wechat'))
  await waitFor(() => expect(screen.getByTestId('qr-code')).toBeInTheDocument())
  expect(screen.getByText('请使用微信支付扫码')).toBeInTheDocument()
  expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 3000)
  setIntervalSpy.mockRestore()
})

it('waits three seconds before polling the order and supports a manual status check', async () => {
  vi.mocked(paymentService.createCreditPayment).mockResolvedValue(wechatOrder)
  vi.mocked(paymentService.getCreditPayment).mockResolvedValue(wechatOrder)
  render(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)

  await waitFor(() => expect(screen.getByTestId('qr-code')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /我已/ }))
  await waitFor(() => expect(paymentService.getCreditPayment).toHaveBeenCalledWith('CR-WX'))
})

it('switching to Alipay resets the order and opens the Alipay cashier page', async () => {
  vi.mocked(paymentService.createCreditPayment).mockResolvedValue(wechatOrder)
  const openWindowSpy = mockAlipayWindow()
  const { rerender } = render(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)
  await waitFor(() => expect(paymentService.createCreditPayment).toHaveBeenCalledWith(pkg.id, 'wechat'))

  vi.mocked(paymentService.createCreditPayment).mockResolvedValue(alipayOrder)
  vi.mocked(paymentService.createCreditPayment).mockClear()
  openWindowSpy.mockClear()
  fireEvent.click(screen.getByRole('radio', { name: '支付宝' }))
  expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '去支付宝支付' }))
  await waitFor(() => expect(paymentService.createCreditPayment).toHaveBeenCalledWith(pkg.id, 'alipay'))
  await waitFor(() => expect(screen.getByRole('button', { name: '打开支付宝支付页面' })).toBeInTheDocument())
  expect(openWindowSpy).toHaveBeenCalledTimes(1)
  expect(openWindowSpy.mock.results[0]?.value?.location?.href).toBe('https://qr.example/alipay')
  expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
  expect(screen.getByText('请在支付宝页面完成扫码支付')).toBeInTheDocument()

  vi.mocked(paymentService.createCreditPayment).mockClear()
  rerender(<AppMantineProvider><CreditPaymentModal package={pkg} opened={false} onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)
  rerender(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)
  await waitFor(() => expect(paymentService.createCreditPayment).toHaveBeenCalledWith(pkg.id, 'wechat'))
})

it('keeps the QR and payment actions within a narrow viewport', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
  vi.mocked(paymentService.createCreditPayment).mockResolvedValue(wechatOrder)
  render(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)

  await waitFor(() => expect(screen.getByTestId('qr-code')).toBeInTheDocument())
  const qr = screen.getByTestId('payment-qr')
  expect(qr).toHaveStyle({ width: 'min(280px, 75vw)', aspectRatio: '1' })
  expect(screen.getByRole('button', { name: /我已/ })).toBeInTheDocument()
})

it('passes the paid order with its exact expiry once and stops polling', async () => {
  const paidOrder = {
    ...wechatOrder, status: 'paid' as const,
    paid_at: '2026-08-03T06:05:06Z', expires_at: '2026-09-02T06:05:06Z',
  }
  vi.mocked(paymentService.createCreditPayment).mockResolvedValue({ ...wechatOrder })
  vi.mocked(paymentService.getCreditPayment).mockResolvedValue(paidOrder)
  const onPaid = vi.fn()
  const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
  render(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={onPaid} /></AppMantineProvider>)

  await waitFor(() => expect(screen.getByTestId('qr-code')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /我已/ }))
  await waitFor(() => expect(onPaid).toHaveBeenCalledWith(paidOrder))
  expect(onPaid).toHaveBeenCalledTimes(1)
  expect(clearIntervalSpy).toHaveBeenCalled()
  expect(paymentService.getCreditPayment).toHaveBeenCalledWith('CR-WX')
  expect(paymentService.getCreditPayment).toHaveBeenCalledTimes(2)
  expect(onPaid).toHaveBeenCalledTimes(1)
})

it('creates an Alipay order and opens the cashier instead of showing a QR', async () => {
  vi.mocked(paymentService.createCreditPayment).mockResolvedValue(alipayOrder)
  const openWindowSpy = mockAlipayWindow()
  render(<AppMantineProvider><CreditPaymentModal package={pkg} opened onClose={vi.fn()} onPaid={vi.fn()} /></AppMantineProvider>)
  await waitFor(() => expect(paymentService.createCreditPayment).toHaveBeenCalledWith(pkg.id, 'wechat'))

  openWindowSpy.mockClear()
  fireEvent.click(screen.getByRole('radio', { name: '支付宝' }))
  fireEvent.click(screen.getByRole('button', { name: '去支付宝支付' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '打开支付宝支付页面' })).toBeInTheDocument())
  expect(openWindowSpy).toHaveBeenCalledTimes(1)
  expect(openWindowSpy.mock.results[0]?.value?.location?.href).toBe('https://qr.example/alipay')
  expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
  expect(screen.getByText('请在支付宝页面完成扫码支付')).toBeInTheDocument()
})
