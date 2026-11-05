import { tokenPackageService } from './tokenPackageService'

const tokenPackageResponse = {
  id: 'pkg-1',
  name: 'pro',
  display_name: '入门版',
  token_amount: 1000000,
  credit_amount: 1000000,
  price: 19.9,
  bonus_tokens: 0,
  bonus_credits: 0,
  total_tokens_with_bonus: 1000000,
  total_credits_with_bonus: 1000000,
  unit_price: 0.02,
  is_active: true,
  is_featured: true,
  sort_order: 0,
  created_at: '2026-04-30T00:00:00.000Z',
  updated_at: '2026-04-30T00:00:00.000Z',
}

describe('tokenPackageService', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => tokenPackageResponse,
    })
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
    localStorage.setItem('auth_access_token', 'test-token')
    localStorage.setItem('auth_refresh_token', 'refresh-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('创建套餐时将表单价格字符串转换成后端需要的 JSON number', async () => {
    await tokenPackageService.createPackage({
      name: 'pro',
      display_name: '入门版',
      description: '测试',
      token_amount: 1000000,
      bonus_tokens: 0,
      price: '19.9',
      is_featured: true,
      is_active: true,
      sort_order: 0,
    })

    const request = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(request.price).toBe(19.9)
    expect(typeof request.price).toBe('number')
    expect(request.credit_amount).toBe(1000000)
    expect(request.bonus_credits).toBe(0)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/credit-packages/packages')
  })

  it('更新套餐时将表单价格字符串转换成后端需要的 JSON number', async () => {
    await tokenPackageService.updatePackage('pkg-1', {
      display_name: '入门版',
      token_amount: 1000000,
      price: '19.9',
      bonus_tokens: 0,
    })

    const request = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(request.price).toBe(19.9)
    expect(typeof request.price).toBe('number')
    expect(request.credit_amount).toBe(1000000)
    expect(request.bonus_credits).toBe(0)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/credit-packages/packages/pkg-1')
  })
})
