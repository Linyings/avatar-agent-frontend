import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PackageFormModal } from '@/features/subscriptions/components/admin/PackageFormModal'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import type { TokenPackage } from '@/features/subscriptions/types'

it('uses CNY and fixed 720-hour validity without Creem fields', () => {
  render(<AppMantineProvider><PackageFormModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} initialData={null} mode="create" /></AppMantineProvider>)
  expect(screen.getByLabelText(/\u4ef7\u683c/)).toBeInTheDocument()
  expect(screen.getByDisplayValue('720')).toBeDisabled()
  expect(screen.getByLabelText(/\u8bd5\u7528\u8d2d\u4e70\u9650\u5236/)).toHaveValue('0')
  expect(screen.getByLabelText(/\u8bd5\u7528\u8d2d\u4e70\u9650\u5236/)).toBeDisabled()
  expect(screen.queryByText(/Creem|USD/)).not.toBeInTheDocument()
})

it('preserves hidden Creem compatibility fields when editing a package', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const initialData: TokenPackage = {
    id: 'legacy-package', name: 'legacy', display_name: 'Legacy package', description: 'kept',
    token_amount: 500, price: '7.20', bonus_tokens: 20, total_tokens_with_bonus: 520,
    unit_price: '13.85', creem_product_id: 'prod_legacy', creem_enabled: true,
    creem_currency: 'EUR', currency: 'CNY', validity_hours: 720, is_trial: false,
    per_account_purchase_limit: 0, is_active: true, is_featured: false, sort_order: 3,
    created_at: '', updated_at: '',
  }
  render(<AppMantineProvider><PackageFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} initialData={initialData} mode="edit" /></AppMantineProvider>)

  expect(screen.queryByText(/Creem|EUR|prod_legacy/)).not.toBeInTheDocument()
  expect(screen.getByLabelText(/\u8bd5\u7528\u8d2d\u4e70\u9650\u5236/)).toHaveValue('0')
  fireEvent.click(screen.getByRole('button', { name: '\u4fdd\u5b58' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    creem_product_id: 'prod_legacy', creem_enabled: true, creem_currency: 'EUR',
    validity_hours: 720, per_account_purchase_limit: 0,
  })))
})

it('uses safe compatibility defaults for a new active CNY sales package', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<AppMantineProvider><PackageFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} initialData={null} mode="create" /></AppMantineProvider>)
  fireEvent.change(screen.getByLabelText(/\u663e\u793a\u540d\u79f0/), { target: { value: 'Ordinary Credits' } })
  fireEvent.change(screen.getByLabelText(/Credits \u6570\u91cf/), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText(/\u4ef7\u683c\uff08\u4eba\u6c11\u5e01\uff09/), { target: { value: '7.20' } })
  fireEvent.click(screen.getByRole('button', { name: '\u4fdd\u5b58' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    creem_product_id: '', creem_enabled: false, creem_currency: 'USD',
    is_active: true, validity_hours: 720, is_trial: false, per_account_purchase_limit: 0,
  })))
})

it('submits unlimited ordinary packages and single-purchase trial packages', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const renderModal = () => render(<AppMantineProvider><PackageFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} initialData={null} mode="create" /></AppMantineProvider>)
  const populateRequiredFields = () => {
    fireEvent.change(screen.getByLabelText(/\u663e\u793a\u540d\u79f0/), { target: { value: '500 Credits' } })
    fireEvent.change(screen.getByLabelText(/Credits \u6570\u91cf/), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText(/\u4ef7\u683c\uff08\u4eba\u6c11\u5e01\uff09/), { target: { value: '1.90' } })
  }

  const ordinary = renderModal()
  populateRequiredFields()
  fireEvent.click(screen.getByRole('button', { name: '\u4fdd\u5b58' }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ is_trial: false, per_account_purchase_limit: 0 })))

  ordinary.unmount()
  onSubmit.mockClear()
  renderModal()
  populateRequiredFields()
  fireEvent.click(screen.getByRole('switch', { name: '\u4f53\u9a8c\u5957\u9910' }))
  fireEvent.click(screen.getByRole('button', { name: '\u4fdd\u5b58' }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ is_trial: true, per_account_purchase_limit: 1 })))
})
