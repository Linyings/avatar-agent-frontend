import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillingRatesPage from '@/pages/admin/BillingRatesPage'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'

const systemServiceMocks = vi.hoisted(() => ({
  createSystemSetting: vi.fn(),
  getSystemSettingByKey: vi.fn(),
  updateSystemSetting: vi.fn(),
}))

vi.mock('@/shared/services/systemService', () => ({
  default: systemServiceMocks,
  systemService: systemServiceMocks,
}))

function renderPage() {
  return render(
    <AppMantineProvider>
      <BillingRatesPage />
    </AppMantineProvider>,
  )
}

const serviceKinds = ['llm', 'vision', 'asr', 'tts', 'audio_separation', 'dubbing_asr'] as const

function serviceRules(value: Record<string, unknown>) {
  return Object.fromEntries(serviceKinds.map(kind => [kind, value[kind]]))
}

function savedValue() {
  return systemServiceMocks.updateSystemSetting.mock.calls.at(-1)![1].value
}

const aliasRates = [
  {
    provider: 'openai',
    model_id: 'narratoai-llm-pro',
    input_cost_per_million: 2,
    output_cost_per_million: 8,
    input_tokens_per_credit: 3125,
    output_tokens_per_credit: 781.25,
    tokens_per_credit: 781.25,
  },
  {
    provider: 'openai',
    model_id: 'narratoai-llm-flash',
    input_cost_per_million: 2,
    output_cost_per_million: 8,
    input_tokens_per_credit: 25000,
    output_tokens_per_credit: 6250,
    tokens_per_credit: 6250,
  },
]

describe('BillingRatesPage', () => {
  it('does not reprice existing services when only promotion is changed', async () => {
    const setting = await systemServiceMocks.getSystemSettingByKey()
    setting.value.llm.push({ provider: '', model_id: '*', tokens_per_credit: 1000 })
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('model-a')
    await user.click(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' }))
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalled())
    const value = systemServiceMocks.updateSystemSetting.mock.calls[0][1].value
    expect(value.free_experience).toBe(true)
    expect(value.llm[1]).toEqual({ provider: '', model_id: '*', tokens_per_credit: 1000 })
    expect(value.asr[0].credits_per_minute).toBe(1)
    expect(value.tts[0].credits_per_1k_utf8_bytes).toBe(1)
  })
  it('keeps mode pricing independent and persists the promotion switch', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('model-a')
    await user.click(screen.getByRole('tab', { name: '搞笑配音' }))
    await screen.findByDisplayValue('MusicDemix')
    await user.click(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' }))
    const cost = screen.getByRole('textbox', { name: '1 Credit 成本（人民币）' })
    await user.clear(cost); await user.type(cost, '0.01')
    await user.click(screen.getByRole('tab', { name: '通用模式' }))
    expect(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalled())
    const value = systemServiceMocks.updateSystemSetting.mock.calls[0][1].value
    expect(value.free_experience).toBe(false)
    expect(value.modes.dubbing.free_experience).toBe(true)
    expect(value.modes.dubbing.pricing_model.creditCostCny).toBe(0.01)
    expect(value.modes.dubbing.audio_separation[0].credits_per_minute).toBe(10)
    expect(value.pricing_model?.creditCostCny).not.toBe(0.01)
  })
  beforeEach(() => {
    vi.clearAllMocks()
    systemServiceMocks.getSystemSettingByKey.mockResolvedValue({
      key: 'billing_rates',
      value: {
        llm: [
          {
            provider: 'dashscope',
            model_id: 'model-a',
            input_cost_per_million: 2,
            output_cost_per_million: 12,
            tokens_per_credit: 1000,
          },
        ],
        vision: [
          {
            provider: 'dashscope',
            model_id: 'model-b',
            input_cost_per_million: 4,
            output_cost_per_million: 4,
            tokens_per_credit: 1000,
          },
        ],
        asr: [
          {
            provider: 'dashscope',
            model_id: 'asr-a',
            cost_per_minute: 0.6,
            credits_per_minute: 1,
          },
        ],
        tts: [
          {
            provider: 'dashscope',
            model_id: 'tts-a',
            cost_per_million_utf8_bytes: 200,
            credits_per_1k_utf8_bytes: 1,
          },
        ],
      },
    })
    systemServiceMocks.updateSystemSetting.mockResolvedValue({})
    systemServiceMocks.createSystemSetting.mockResolvedValue({})
  })

  it('按 Credit 成本基准保存推导后的各类服务计费比例', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByDisplayValue('model-a')
    expect(await screen.findByText('人民币套餐测算')).toBeInTheDocument()
    expect(screen.getByText('输入 10 tokens / 输出 1.67 tokens')).toBeInTheDocument()

    const cost = screen.getByRole('textbox', { name: '1 Credit 成本（人民币）' })
    await user.clear(cost)
    await user.type(cost, '0.00002')

    await user.click(screen.getByRole('button', { name: '保存价格规则' }))

    await waitFor(() => {
      expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalled()
    })

    const [, payload] = systemServiceMocks.updateSystemSetting.mock.calls[0]
    expect(payload.value.llm[0].input_cost_per_million).toBe(2)
    expect(payload.value.llm[0].output_cost_per_million).toBe(12)
    expect(payload.value.llm[0].input_tokens_per_credit).toBe(10)
    expect(payload.value.llm[0].output_tokens_per_credit).toBe(1.666667)
    expect(payload.value.llm[0].tokens_per_credit).toBe(1.666667)
    expect(payload.value.vision[0].tokens_per_credit).toBe(5)
    expect(payload.value.asr[0].credits_per_minute).toBe(30000)
    expect(payload.value.tts[0].credits_per_1k_chars).toBe(10000)
    expect(payload.value.tts[0].cost_per_million_chars).toBe(200)
    expect(payload.value.pricing_model.currency).toBe('CNY')
    expect(payload.value.pricing_model.tiersCny).toEqual([67.33188, 203.35588, 475.40388])
    expect(payload.value.pricing_model).not.toHaveProperty('exchangeRate')
    expect(payload.value.pricing_model).not.toHaveProperty('tiersUsd')
  })

  it('编辑套餐建议发放 Credits 后实时重算毛利并保存', async () => {
    const user = userEvent.setup()
    systemServiceMocks.getSystemSettingByKey.mockResolvedValueOnce({
      key: 'billing_rates',
      value: {
        llm: [
          {
            provider: 'dashscope',
            model_id: 'model-a',
            input_cost_per_million: 2,
            output_cost_per_million: 2,
            tokens_per_credit: 1000,
          },
        ],
        pricing_model: {
          creditCostCny: 0.005,
          creditSalePriceCny: 0.013450635,
          exchangeRate: 6.8012,
          tiersUsd: [9.9, 29.9, 69.9],
          tierCredits: [5006, 15119, 35346],
        },
      },
    })

    renderPage()

    const creditsInput = await screen.findByLabelText('套餐 1 建议发放 Credits')
    await user.clear(creditsInput)
    await user.type(creditsInput, '6000')

    expect(screen.getByText('¥30.00')).toBeInTheDocument()
    expect(screen.getByText('¥37.3319')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存价格规则' }))

    await waitFor(() => {
      expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalled()
    })

    const [, payload] = systemServiceMocks.updateSystemSetting.mock.calls[0]
    expect(payload.value.pricing_model.tierCredits).toEqual([6000, 15119, 35346])
    expect(payload.value.llm[0].tokens_per_credit).toBe(1000)
  })

  it.each([
    { exchangeRate: 7.25, expected: [71.864501, 216.775, 506.775] },
    { exchangeRate: undefined, expected: [67.415841, 203.35588, 475.40388] },
  ])('将旧美元套餐按已存汇率或兼容汇率迁移为人民币，不改变积分规则（$exchangeRate）', async ({ exchangeRate, expected }) => {
    const setting = await systemServiceMocks.getSystemSettingByKey()
    setting.value.llm.push(...aliasRates)
    setting.value.pricing_model = {
      creditCostCny: 0.005,
      creditSalePriceCny: 0.013450635,
      exchangeRate,
      tiersUsd: [9.912345, 29.9, 69.9],
      tierCredits: [5006, 15119, 35346],
    }
    const before = structuredClone(serviceRules(setting.value))
    const user = userEvent.setup()
    renderPage()

    await screen.findByDisplayValue('narratoai-llm-pro')
    expect(screen.getByRole('heading', { name: '人民币套餐测算' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '套餐 1（人民币）' })).toHaveValue(String(expected[0]))
    expect(screen.queryByText(/美元|USD|汇率/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalled())

    const value = savedValue()
    expect(value.pricing_model).toEqual({
      currency: 'CNY',
      creditCostCny: 0.005,
      creditSalePriceCny: 0.013450635,
      tiersCny: expected,
      tierCredits: [5006, 15119, 35346],
    })
    expect(serviceRules(value)).toEqual(before)
  })

  it('原生人民币套餐优先于旧美元字段，重复加载和保存不会再次换算', async () => {
    const setting = await systemServiceMocks.getSystemSettingByKey()
    setting.value.llm.push(...aliasRates)
    setting.value.pricing_model = {
      currency: 'CNY',
      creditCostCny: 0.005,
      creditSalePriceCny: 0.013450635,
      exchangeRate: 7.25,
      tiersUsd: [9.9, 29.9, 69.9],
      tiersCny: [99, 199.123456, 499.5],
      tierCredits: [5006, 15119, 35346],
    }
    const before = structuredClone(serviceRules(setting.value))
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('model-a')

    expect(screen.getByRole('textbox', { name: '套餐 1（人民币）' })).toHaveValue('99')
    expect(screen.getByRole('textbox', { name: '套餐 2（人民币）' })).toHaveValue('199.123456')
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalledTimes(1))
    const firstSave = structuredClone(savedValue())
    systemServiceMocks.getSystemSettingByKey.mockResolvedValue({ key: 'billing_rates', value: firstSave })
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByDisplayValue('narratoai-llm-pro')
    expect(screen.getByRole('textbox', { name: '套餐 1（人民币）' })).toHaveValue('99')
    expect(screen.getByRole('textbox', { name: '套餐 2（人民币）' })).toHaveValue('199.123456')
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalledTimes(2))

    expect(savedValue().pricing_model).toEqual({
      currency: 'CNY',
      creditCostCny: 0.005,
      creditSalePriceCny: 0.013450635,
      tiersCny: [99, 199.123456, 499.5],
      tierCredits: [5006, 15119, 35346],
    })
    expect(serviceRules(savedValue())).toEqual(before)
  })

  it.each([
    { label: '套餐 1（人民币）', input: '99.123456', key: 'tiersCny', expected: [99.123456, 203.35588, 475.40388] },
    { label: '套餐 1 建议发放 Credits', input: '6000', key: 'tierCredits', expected: [6000, 15119, 35346] },
    { label: '预计 1 Credit 售价（人民币）', input: '0.02', key: 'creditSalePriceCny', expected: 0.02 },
  ])('调整售价测算“$label”不会重新计算已生效服务的扣费比例', async ({ label, input, key, expected }) => {
    const setting = await systemServiceMocks.getSystemSettingByKey()
    setting.value.llm.push(...aliasRates)
    setting.value.pricing_model = {
      currency: 'CNY',
      creditCostCny: 0.005,
      creditSalePriceCny: 0.013450635,
      tiersCny: [67.33188, 203.35588, 475.40388],
      tierCredits: [5006, 15119, 35346],
    }
    const before = structuredClone(serviceRules(setting.value))
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('narratoai-llm-flash')
    const inputElement = screen.getByRole('textbox', { name: label })
    await user.clear(inputElement)
    await user.type(inputElement, input)
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalled())

    expect(savedValue().pricing_model[key]).toEqual(expected)
    expect(serviceRules(savedValue())).toEqual(before)
  })

  it('各模式免费体验可以独立开启、保存重载并关闭，模型别名和服务费率保持不变', async () => {
    const setting = await systemServiceMocks.getSystemSettingByKey()
    setting.value.llm.push(...aliasRates)
    setting.value.free_experience = false
    setting.value.modes = {
      dubbing: {
        free_experience: false,
        llm: structuredClone(aliasRates),
        tts: [{ provider: 'dashscope', model_id: 'qwen3-tts-instruct-flash', cost_per_million_chars: 80, credits_per_1k_chars: 16 }],
        audio_separation: [{ provider: 'aliyun-mps', model_id: 'MusicDemix', cost_per_minute: 0.1, credits_per_minute: 20 }],
        dubbing_asr: [{ provider: 'dashscope', model_id: '*', cost_per_minute: 0.0048, credits_per_minute: 0.96 }],
      },
    }
    const beforeGeneral = structuredClone(serviceRules(setting.value))
    const beforeDubbing = structuredClone(serviceRules(setting.value.modes.dubbing))
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('model-a')
    await user.click(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' }))
    await user.click(screen.getByRole('tab', { name: '搞笑配音' }))
    expect(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalledTimes(1))
    expect(savedValue().free_experience).toBe(true)
    expect(savedValue().modes.dubbing.free_experience).toBe(false)

    systemServiceMocks.getSystemSettingByKey.mockResolvedValue({ key: 'billing_rates', value: structuredClone(savedValue()) })
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByDisplayValue('MusicDemix')
    await user.click(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' }))
    await user.click(screen.getByRole('tab', { name: '通用模式' }))
    expect(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' })).toBeChecked()
    await user.click(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' }))
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalledTimes(2))
    expect(savedValue().free_experience).toBe(false)
    expect(savedValue().modes.dubbing.free_experience).toBe(true)

    systemServiceMocks.getSystemSettingByKey.mockResolvedValue({ key: 'billing_rates', value: structuredClone(savedValue()) })
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByDisplayValue('model-a')
    expect(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' })).not.toBeChecked()
    await user.click(screen.getByRole('tab', { name: '搞笑配音' }))
    expect(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' })).toBeChecked()
    await user.click(screen.getByRole('switch', { name: '免费体验（不扣用户积分）' }))
    await user.click(screen.getByRole('button', { name: '保存价格规则' }))
    await waitFor(() => expect(systemServiceMocks.updateSystemSetting).toHaveBeenCalledTimes(3))
    expect(savedValue().free_experience).toBe(false)
    expect(savedValue().modes.dubbing.free_experience).toBe(false)
    expect(serviceRules(savedValue())).toEqual(beforeGeneral)
    expect(serviceRules(savedValue().modes.dubbing)).toEqual(beforeDubbing)
  })
})
