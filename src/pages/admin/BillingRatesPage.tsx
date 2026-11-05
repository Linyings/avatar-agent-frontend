import { useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NativeSelect,
  NumberInput,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import PageHeader from '@/shared/components/ui/PageHeader'
import SurfaceCard from '@/shared/components/ui/SurfaceCard'
import {
  BanknotesIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from '@/shared/icons/tabler'
import systemService from '@/shared/services/systemService'

const BILLING_RATES_KEY = 'billing_rates'
// Used only to convert legacy saved USD estimates when no CNY amounts exist.
const LEGACY_EXCHANGE_RATE = 6.8012
const DEFAULT_TIER_CNY = [67.33188, 203.35588, 475.40388]
const DEFAULT_CREDIT_SALE_PRICE_CNY = DEFAULT_TIER_CNY[0] / 1_000_000

type ServiceKind = 'llm' | 'vision' | 'asr' | 'tts' | 'audio_separation' | 'dubbing_asr'

interface BillingRateRow {
  original?: Record<string, unknown>
  id: string
  service_kind: ServiceKind
  provider: string
  model_id: string
  input_cost_per_million: number
  output_cost_per_million: number
  input_tokens_per_credit: number
  output_tokens_per_credit: number
  tokens_per_credit: number
  cost_per_minute: number
  cost_per_million_utf8_bytes: number
  credits_per_1k_utf8_bytes: number
  credits_per_minute: number
}

type BillingRatesValue = Partial<Record<ServiceKind, Array<Record<string, unknown>>>> & {
  rates?: Array<Record<string, unknown>>
  pricing_model?: Partial<UnitEconomicsInputs> & { exchangeRate?: number; tiersUsd?: number[] }
  free_experience?: boolean
  modes?: Record<string, BillingRatesValue>
}

interface UnitEconomicsInputs {
  currency: 'CNY'
  creditCostCny: number
  creditSalePriceCny: number
  tiersCny: number[]
  tierCredits: number[]
}

const serviceOptions = [
  { value: 'llm', label: 'LLM' },
  { value: 'vision', label: 'Vision' },
  { value: 'asr', label: 'ASR' },
  { value: 'tts', label: 'TTS' },
  { value: 'audio_separation', label: '人声分离' },
  { value: 'dubbing_asr', label: '配音转写' },
]

const serviceLabels: Record<ServiceKind, string> = {
  llm: '大模型',
  vision: '视觉模型',
  asr: '语音转写',
  tts: '语音合成',
  audio_separation: '人声分离',
  dubbing_asr: '配音转写',
}

const emptyRow = (serviceKind: ServiceKind = 'llm'): BillingRateRow => ({
  id: crypto.randomUUID(),
  service_kind: serviceKind,
  provider: '',
  model_id: '',
  input_cost_per_million: 0,
  output_cost_per_million: 0,
  input_tokens_per_credit: serviceKind === 'llm' || serviceKind === 'vision' ? 1000 : 0,
  output_tokens_per_credit: serviceKind === 'llm' || serviceKind === 'vision' ? 1000 : 0,
  tokens_per_credit: serviceKind === 'llm' || serviceKind === 'vision' ? 1000 : 0,
  cost_per_minute: 0,
  cost_per_million_utf8_bytes: serviceKind === 'tts' ? 15 : 0,
  credits_per_1k_utf8_bytes: serviceKind === 'tts' ? 1 : 0,
  credits_per_minute: serviceKind === 'asr' ? 1 : 0,
})

const numberValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const stringValue = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  return String(value)
}

const tokensPerCreditValue = (rate: Record<string, unknown>): number => {
  const explicitValue = numberValue(rate.tokens_per_credit)
  if (explicitValue > 0) return explicitValue

  const legacyCreditsPerToken = numberValue(rate.credits_per_token)
  if (legacyCreditsPerToken <= 0) return 0

  return legacyCreditsPerToken < 1 ? 1 / legacyCreditsPerToken : legacyCreditsPerToken
}

const directionalTokensPerCreditValue = (rate: Record<string, unknown>, direction: 'input' | 'output'): number => {
  const explicitValue = numberValue(rate[`${direction}_tokens_per_credit`])
  if (explicitValue > 0) return explicitValue

  const chatDirection = direction === 'input' ? 'prompt' : 'completion'
  const chatExplicitValue = numberValue(rate[`${chatDirection}_tokens_per_credit`])
  if (chatExplicitValue > 0) return chatExplicitValue

  const legacyDirectionalCreditsPerToken = numberValue(rate[`${direction}_credits_per_token`])
  if (legacyDirectionalCreditsPerToken > 0) {
    return legacyDirectionalCreditsPerToken < 1
      ? 1 / legacyDirectionalCreditsPerToken
      : legacyDirectionalCreditsPerToken
  }

  const legacyChatCreditsPerToken = numberValue(rate[`${chatDirection}_credits_per_token`])
  if (legacyChatCreditsPerToken > 0) {
    return legacyChatCreditsPerToken < 1
      ? 1 / legacyChatCreditsPerToken
      : legacyChatCreditsPerToken
  }

  return tokensPerCreditValue(rate)
}

const creditsPerMinuteValue = (rate: Record<string, unknown>): number => {
  const explicitValue = numberValue(rate.credits_per_minute)
  if (explicitValue > 0) return explicitValue

  const legacyCreditsPerSecond = numberValue(rate.credits_per_second)
  return legacyCreditsPerSecond > 0 ? legacyCreditsPerSecond * 60 : 0
}

const parseRows = (value: unknown): BillingRateRow[] => {
  const rows: BillingRateRow[] = []
  const pushRate = (rate: Record<string, unknown>, fallbackKind?: ServiceKind) => {
    const rawKind = stringValue(rate.service_kind || fallbackKind).toLowerCase()
    const serviceKind = serviceOptions.some((option) => option.value === rawKind)
      ? rawKind as ServiceKind
      : fallbackKind
    if (!serviceKind) return
    const creditsPer1kUtf8Bytes =
      numberValue(rate.credits_per_1k_chars || rate.credits_per_thousand_chars)
      || numberValue(rate.credits_per_1k_utf8_bytes || rate.credits_per_thousand_utf8_bytes)
      || numberValue(rate.credits_per_utf8_byte || rate.credits_per_utf8_bytes || rate.credits_per_byte) * 1000
      || numberValue(rate.credits_per_million_utf8_bytes) / 1000

    rows.push({
      original: rate,
      id: crypto.randomUUID(),
      service_kind: serviceKind,
      provider: stringValue(rate.provider),
      model_id: stringValue(rate.model_id || rate.model),
      input_cost_per_million: numberValue(rate.input_cost_per_million),
      output_cost_per_million: numberValue(rate.output_cost_per_million),
      input_tokens_per_credit: directionalTokensPerCreditValue(rate, 'input'),
      output_tokens_per_credit: directionalTokensPerCreditValue(rate, 'output'),
      tokens_per_credit: tokensPerCreditValue(rate),
      cost_per_minute: numberValue(rate.cost_per_minute),
      cost_per_million_utf8_bytes: numberValue(
        rate.cost_per_million_chars
        || rate.cost_per_million_characters
        || rate.cost_per_million_utf8_bytes
        || rate.cost_per_million_bytes,
      ),
      credits_per_1k_utf8_bytes: creditsPer1kUtf8Bytes,
      credits_per_minute: creditsPerMinuteValue(rate),
    })
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        pushRate(item as Record<string, unknown>)
      }
    })
    return rows
  }

  if (!value || typeof value !== 'object') return rows
  const record = value as BillingRatesValue
  serviceOptions.forEach((option) => {
    const serviceKind = option.value as ServiceKind
    const serviceRates = record[serviceKind]
    if (Array.isArray(serviceRates)) {
      serviceRates.forEach((rate) => pushRate(rate, serviceKind))
    }
  })
  if (Array.isArray(record.rates)) {
    record.rates.forEach((rate) => pushRate(rate))
  }
  return rows
}

const defaultUnitEconomics: UnitEconomicsInputs = {
  currency: 'CNY',
  creditCostCny: 0.00002,
  creditSalePriceCny: DEFAULT_CREDIT_SALE_PRICE_CNY,
  tiersCny: DEFAULT_TIER_CNY,
  tierCredits: DEFAULT_TIER_CNY.map((priceCny) => (
    Math.floor(priceCny / DEFAULT_CREDIT_SALE_PRICE_CNY)
  )),
}

const tokenCostPerMillion = (row: BillingRateRow): number => (
  Math.max(row.input_cost_per_million, row.output_cost_per_million)
)

const minPositive = (...values: number[]): number => {
  const positiveValues = values.filter((value) => value > 0)
  return positiveValues.length > 0 ? Math.min(...positiveValues) : 0
}

const deriveTokenPerCredit = (costPerMillion: number, creditCostCny: number): number => {
  if (costPerMillion <= 0 || creditCostCny <= 0) return 0
  return roundRatio(creditCostCny * 1_000_000 / costPerMillion)
}

const deriveCreditsPerMinute = (costPerMinute: number, creditCostCny: number): number => {
  if (costPerMinute <= 0 || creditCostCny <= 0) return 0
  return roundRatio(costPerMinute / creditCostCny)
}

const deriveCreditsPer1kChars = (costPerMillionChars: number, creditCostCny: number): number => {
  if (costPerMillionChars <= 0 || creditCostCny <= 0) return 0
  return roundRatio(costPerMillionChars / 1000 / creditCostCny)
}

const serializeRows = (rows: BillingRateRow[], unitEconomics: UnitEconomicsInputs): BillingRatesValue => {
  const value = rows.reduce<BillingRatesValue>((acc, row) => {
    const target = acc[row.service_kind] ?? []
    const isTokenBased = row.service_kind === 'llm' || row.service_kind === 'vision'
    const isTts = row.service_kind === 'tts'
    const inputTokensPerCredit = deriveTokenPerCredit(row.input_cost_per_million, unitEconomics.creditCostCny)
    const outputTokensPerCredit = deriveTokenPerCredit(row.output_cost_per_million, unitEconomics.creditCostCny)
    target.push({
      ...row.original,
      provider: row.provider.trim(),
      model_id: row.model_id.trim() || '*',
      ...(isTokenBased
        ? {
            input_cost_per_million: row.input_cost_per_million,
            output_cost_per_million: row.output_cost_per_million,
            input_tokens_per_credit: inputTokensPerCredit || row.input_tokens_per_credit,
            output_tokens_per_credit: outputTokensPerCredit || row.output_tokens_per_credit,
            tokens_per_credit: minPositive(inputTokensPerCredit, outputTokensPerCredit) || row.tokens_per_credit,
          }
        : isTts
          ? {
              cost_per_million_chars: row.cost_per_million_utf8_bytes,
              credits_per_1k_chars: deriveCreditsPer1kChars(
                row.cost_per_million_utf8_bytes,
                unitEconomics.creditCostCny,
              ) || row.credits_per_1k_utf8_bytes,
            }
        : {
            cost_per_minute: row.cost_per_minute,
            credits_per_minute: deriveCreditsPerMinute(row.cost_per_minute, unitEconomics.creditCostCny) || row.credits_per_minute,
          }),
    })
    acc[row.service_kind] = target
    return acc
  }, {})

  value.pricing_model = {
    currency: 'CNY',
    creditCostCny: unitEconomics.creditCostCny,
    creditSalePriceCny: unitEconomics.creditSalePriceCny,
    tiersCny: unitEconomics.tiersCny,
    tierCredits: normalizedTierCredits(unitEconomics),
  }

  return value
}

const money = (value: number, maximumFractionDigits = 6) => {
  if (!Number.isFinite(value)) return '¥0.00'
  return `¥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })}`
}

const numberLabel = (value: number, maximumFractionDigits = 6) => {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('zh-CN', { maximumFractionDigits })
}

const derivedNumberLabel = (value: number) => numberLabel(value, 2)

const isTokenBasedRow = (row: BillingRateRow) => row.service_kind === 'llm' || row.service_kind === 'vision'

const roundRatio = (value: number) => Number(value.toFixed(6))

const deriveTierCredits = (priceCny: number, unitEconomics: UnitEconomicsInputs): number => {
  if (unitEconomics.creditSalePriceCny <= 0) return 0
  return Math.floor(priceCny / unitEconomics.creditSalePriceCny)
}

const normalizedTierCredits = (unitEconomics: UnitEconomicsInputs): number[] => (
  unitEconomics.tiersCny.map((priceCny, index) => {
    const credits = unitEconomics.tierCredits[index]
    return Number.isFinite(credits) && credits >= 0
      ? Math.floor(credits)
      : deriveTierCredits(priceCny, unitEconomics)
  })
)

const parseUnitEconomics = (value: unknown): UnitEconomicsInputs => {
  if (!value || typeof value !== 'object') return defaultUnitEconomics
  const record = value as BillingRatesValue
  const model = record.pricing_model ?? {}
  const legacyExchangeRate = numberValue(model.exchangeRate) > 0 ? numberValue(model.exchangeRate) : LEGACY_EXCHANGE_RATE
  const tiers = Array.isArray(model.tiersCny) && model.tiersCny.length > 0
    ? model.tiersCny.map(numberValue).filter((tier) => tier >= 0)
    : Array.isArray(model.tiersUsd) && model.tiersUsd.length > 0
      ? model.tiersUsd.map((tier) => roundRatio(numberValue(tier) * legacyExchangeRate)).filter((tier) => tier >= 0)
      : defaultUnitEconomics.tiersCny
  const persistedTierCredits = Array.isArray(model.tierCredits)
    ? model.tierCredits.map(numberValue)
    : []

  const parsedUnitEconomics: UnitEconomicsInputs = {
    currency: 'CNY',
    creditCostCny: numberValue(model.creditCostCny) || defaultUnitEconomics.creditCostCny,
    creditSalePriceCny: numberValue(model.creditSalePriceCny) || defaultUnitEconomics.creditSalePriceCny,
    tiersCny: tiers.length > 0 ? tiers : defaultUnitEconomics.tiersCny,
    tierCredits: persistedTierCredits,
  }

  return {
    ...parsedUnitEconomics,
    tierCredits: normalizedTierCredits(parsedUnitEconomics),
  }
}

const profitMargin = (profit: number, revenue: number): number => {
  if (revenue <= 0) return 0
  return profit / revenue * 100
}

const percentLabel = (value: number) => {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`
}

const rowCostValue = (row: BillingRateRow): number => {
  if (isTokenBasedRow(row)) return tokenCostPerMillion(row)
  if (['asr', 'audio_separation', 'dubbing_asr'].includes(row.service_kind)) return row.cost_per_minute
  return row.cost_per_million_utf8_bytes
}

const rowDerivedLabel = (row: BillingRateRow, unitEconomics: UnitEconomicsInputs): string => {
  if (isTokenBasedRow(row)) {
    const inputTokens = deriveTokenPerCredit(row.input_cost_per_million, unitEconomics.creditCostCny)
    const outputTokens = deriveTokenPerCredit(row.output_cost_per_million, unitEconomics.creditCostCny)
    if (inputTokens <= 0 && outputTokens <= 0) return '-'
    if (inputTokens === outputTokens) return `1 Credit 可用 ${derivedNumberLabel(inputTokens)} tokens`
    return `输入 ${derivedNumberLabel(inputTokens)} tokens / 输出 ${derivedNumberLabel(outputTokens)} tokens`
  }
  if (['asr', 'audio_separation', 'dubbing_asr'].includes(row.service_kind)) {
    const credits = deriveCreditsPerMinute(row.cost_per_minute, unitEconomics.creditCostCny)
    return credits > 0 ? `${derivedNumberLabel(credits)} Credits / 分钟` : '-'
  }
  const credits = deriveCreditsPer1kChars(row.cost_per_million_utf8_bytes, unitEconomics.creditCostCny)
  return credits > 0 ? `${derivedNumberLabel(credits)} Credits / 1000 字符` : '-'
}

const costUnitLabel = (serviceKind: ServiceKind): string => {
  if (serviceKind === 'llm' || serviceKind === 'vision') return '人民币 / 百万 token（输入 / 输出）'
  if (['asr', 'audio_separation', 'dubbing_asr'].includes(serviceKind)) return '人民币 / 分钟'
  return '人民币 / 百万字符'
}

export const BillingRatesPage = () => {
  const [mode, setMode] = useState('general')
  const [modeDrafts, setModeDrafts] = useState<Record<string, BillingRatesValue>>({})
  const [freeExperience, setFreeExperience] = useState(false)
  const [pricingDirty, setPricingDirty] = useState(false)
  const modeName = (id: string) => ({ general: '通用模式', dubbing: '搞笑配音' }[id] ?? id)
  const currentDraft = (): BillingRatesValue => {
    const previous = { ...modeDrafts[mode] }
    if (!pricingDirty && modeDrafts[mode]) {
      delete previous.modes
      return { ...previous, pricing_model: { ...unitEconomics, tierCredits: normalizedTierCredits(unitEconomics) }, free_experience: freeExperience }
    }
    serviceOptions.forEach(option => { delete previous[option.value as ServiceKind] })
    delete previous.rates
    delete previous.modes
    return { ...previous, ...serializeRows(rows, unitEconomics), free_experience: freeExperience }
  }
  const selectMode = (next: string) => {
    const drafts = { ...modeDrafts, [mode]: currentDraft() }
    setModeDrafts(drafts)
    setMode(next)
    setRows(parseRows(drafts[next]))
    setUnitEconomics(parseUnitEconomics(drafts[next]))
    setFreeExperience(drafts[next]?.free_experience === true)
    setPricingDirty(false)
    setMessage(null)
  }
  const [rows, setRows] = useState<BillingRateRow[]>([])
  const [unitEconomics, setUnitEconomics] = useState<UnitEconomicsInputs>(defaultUnitEconomics)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [settingExists, setSettingExists] = useState(false)

  const summary = useMemo(() => {
    return rows.reduce<Record<ServiceKind, number>>((acc, row) => {
      acc[row.service_kind] += 1
      return acc
    }, { llm: 0, vision: 0, asr: 0, tts: 0, audio_separation: 0, dubbing_asr: 0 })
  }, [rows])

  const tierPlans = useMemo(() => {
    const tierCredits = normalizedTierCredits(unitEconomics)
    return unitEconomics.tiersCny.map((revenueCny, index) => {
      const credits = tierCredits[index]
      const deliveryCost = credits * unitEconomics.creditCostCny
      const profit = revenueCny - deliveryCost
      return {
        revenueCny,
        credits,
        deliveryCost,
        profit,
        margin: profitMargin(profit, revenueCny),
      }
    })
  }, [unitEconomics])

  const unitMargin = useMemo(() => {
    return profitMargin(
      unitEconomics.creditSalePriceCny - unitEconomics.creditCostCny,
      unitEconomics.creditSalePriceCny,
    )
  }, [unitEconomics.creditCostCny, unitEconomics.creditSalePriceCny])

  const loadRates = async () => {
    setIsLoading(true)
    setError(null)
    setMessage(null)
    try {
      const setting = await systemService.getSystemSettingByKey(BILLING_RATES_KEY)
      const root = setting.value as BillingRatesValue
      const dubbingTemplate: BillingRatesValue = {
        pricing_model: { ...parseUnitEconomics(root) }, free_experience: false,
        llm: root.llm, vision: root.vision,
        tts: [{ provider: 'dashscope', model_id: 'qwen3-tts-instruct-flash', cost_per_million_chars: 80, credits_per_1k_chars: 16 }],
        audio_separation: [{ provider: 'aliyun-mps', model_id: 'MusicDemix', cost_per_minute: 0.1, credits_per_minute: 20 }],
        dubbing_asr: [{ provider: 'dashscope', model_id: '*', cost_per_minute: 0.0048, credits_per_minute: 0.96 }],
      }
      const dubbing = root.modes?.dubbing ?? { ...serializeRows(parseRows(dubbingTemplate), parseUnitEconomics(root)), free_experience: false }
      const drafts = { ...root.modes, general: root, dubbing }
      setModeDrafts(drafts)
      const active = drafts[mode as keyof typeof drafts] ?? root
      const parsedRows = parseRows(active)
      setRows(parsedRows.length > 0 ? parsedRows : [emptyRow('llm'), emptyRow('asr'), emptyRow('tts')])
      setUnitEconomics(parseUnitEconomics(active))
      setFreeExperience(active.free_experience === true)
      setPricingDirty(false)
      setSettingExists(true)
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 404) {
        setRows([emptyRow('llm'), emptyRow('asr'), emptyRow('tts')])
        setUnitEconomics(defaultUnitEconomics)
        setSettingExists(false)
        return
      }
      setError(err instanceof Error ? err.message : '加载价格配置失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadRates()
  }, [])

  const updateRow = (id: string, patch: Partial<BillingRateRow>) => {
    setPricingDirty(true)
    setRows((currentRows) => currentRows.map((row) => (
      row.id === id
        ? {
            ...row,
            ...patch,
            ...(patch.service_kind && (patch.service_kind === 'llm' || patch.service_kind === 'vision')
              ? {
                  input_tokens_per_credit: row.input_tokens_per_credit || row.tokens_per_credit || 1000,
                  output_tokens_per_credit: row.output_tokens_per_credit || row.tokens_per_credit || 1000,
                  tokens_per_credit: row.tokens_per_credit || 1000,
                }
              : {}),
            ...(patch.service_kind === 'asr'
              ? { credits_per_minute: row.credits_per_minute || 1 }
              : {}),
            ...(patch.service_kind === 'tts'
              ? {
                  cost_per_million_utf8_bytes: row.cost_per_million_utf8_bytes || 15,
                  credits_per_1k_utf8_bytes: row.credits_per_1k_utf8_bytes || 1,
                  credits_per_minute: 0,
                }
              : {}),
          }
        : row
    )))
  }

  const addRow = (serviceKind: ServiceKind = 'llm') => {
    setPricingDirty(true)
    setRows((currentRows) => [...currentRows, emptyRow(serviceKind)])
  }

  const removeRow = (id: string) => {
    setPricingDirty(true)
    setRows((currentRows) => currentRows.filter((row) => row.id !== id))
  }

  const updateUnitEconomics = (patch: Partial<UnitEconomicsInputs>) => {
    if (patch.creditCostCny !== undefined) setPricingDirty(true)
    setUnitEconomics((current) => ({ ...current, ...patch }))
  }

  const updateTierCny = (index: number, value: number) => {
    setUnitEconomics((current) => ({
      ...current,
      tiersCny: current.tiersCny.map((tier, tierIndex) => (
        tierIndex === index ? Math.max(0, value) : tier
      )),
    }))
  }

  const updateTierCredits = (index: number, value: number) => {
    setUnitEconomics((current) => ({
      ...current,
      tierCredits: normalizedTierCredits(current).map((credits, tierIndex) => (
        tierIndex === index ? Math.max(0, Math.floor(value)) : credits
      )),
    }))
  }

  const saveRates = async () => {
    setError(null)
    setMessage(null)

    const invalidRow = rows.find((row) => !row.provider.trim() && row.model_id.trim() !== '*')
    if (invalidRow) {
      setError('每条价格规则都需要填写 provider')
      return
    }

    setIsSaving(true)
    try {
      if (unitEconomics.creditCostCny <= 0 || unitEconomics.creditSalePriceCny <= 0) throw new Error('成本基准和假设售价必须大于零')
      const drafts = { ...modeDrafts, [mode]: currentDraft() }
      // Migrate all modes to CNY without recalculating their saved service rates.
      Object.keys(drafts).forEach(id => { drafts[id] = { ...drafts[id], pricing_model: parseUnitEconomics(drafts[id]) } })
      const { general, ...otherModes } = drafts
      const value = { ...general, modes: otherModes }
      const description = 'Credits billing rates in CNY by provider, model id and service kind.'
      if (settingExists) {
        await systemService.updateSystemSetting(BILLING_RATES_KEY, { value, description, is_public: false })
      } else {
        await systemService.createSystemSetting({
          key: BILLING_RATES_KEY,
          value,
          description,
          is_public: false,
        })
        setSettingExists(true)
      }
      setMessage('价格规则已保存')
      setModeDrafts(drafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存价格规则失败')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AppPageShell size="xl">
      <PageHeader
        title="价格管理"
        subtitle="按模式管理免费体验、供应商成本和积分费率，所有金额均以人民币计算。"
        actions={
          <Group gap="sm">
            <Button variant="default" onClick={loadRates} loading={isLoading}>
              重新加载
            </Button>
            <Button leftSection={<CheckCircleIcon width={16} height={16} />} onClick={saveRates} loading={isSaving}>
              保存价格规则
            </Button>
          </Group>
        }
      />

      <Stack gap="lg">
        <Tabs value={mode} onChange={next => { if (next) selectMode(next) }}>
          <Tabs.List>{[...new Set(['general', 'dubbing', ...Object.keys(modeDrafts)])].map(id => <Tabs.Tab key={id} value={id}>{modeName(id)}</Tabs.Tab>)}</Tabs.List>
        </Tabs>
        <Paper withBorder p="lg" radius="lg">
          <Title order={3} mb="sm">推广模式 · {modeName(mode)}</Title>
          <Switch label="免费体验（不扣用户积分）" checked={freeExperience} disabled={isLoading || isSaving} onChange={event => setFreeExperience(event.currentTarget.checked)} />
          <Text size="sm" c="dimmed" mt="sm">保存后生效。开启后仍记录供应商用量与成本，用户扣费为 0；关闭后按本模式费率计费。已记录的用量不追补、不重算。免费体验不能代替供应商服务配置。</Text>
        </Paper>
        <Alert color="blue">以下成本和费率按当前模式独立保存。成本基准会反推实际积分扣费规则；售价、套餐与毛利率是测算假设，不会修改真实充值套餐。供应商成本单价需要按实际合同核对，未保存的新模式默认值仅供测试起点。</Alert>
        {error ? <Alert color="red" variant="light">{error}</Alert> : null}
        {message ? <Alert color="green" variant="light">{message}</Alert> : null}
        {!settingExists && !isLoading ? (
          <Alert color="yellow" variant="light">
            当前还没有 billing_rates 系统配置，保存后会自动创建。成本单价为 0 的规则会在统计中继续提示缺失价格。
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {serviceOptions.map((option) => {
            const serviceKind = option.value as ServiceKind
            return (
              <SurfaceCard key={option.value} tone="subtle">
                <Group justify="space-between" align="center">
                  <div>
                    <Text size="sm" c="dimmed">{serviceLabels[serviceKind]}</Text>
                    <Title order={3}>{summary[serviceKind]}</Title>
                  </div>
                  <Badge variant="light">{option.label}</Badge>
                </Group>
              </SurfaceCard>
            )
          })}
        </SimpleGrid>

        <Paper p="lg" radius="lg" withBorder>
          <Group justify="space-between" align="flex-start" mb="md">
            <div>
              <Title order={3}>Credit 成本与售价假设</Title>
              <Text size="sm" c="dimmed">
                先约定 1 Credit 的交付成本和售价，再用供应商成本自动反推每种服务消耗多少 Credits。
              </Text>
            </div>
            <Badge variant="light">人民币 · CNY</Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <NumberInput
              label="1 Credit 成本（人民币）"
              value={unitEconomics.creditCostCny}
              onChange={(value) => updateUnitEconomics({ creditCostCny: Number(value) || 0 })}
              min={0}
              decimalScale={8}
            />
            <NumberInput
              label="预计 1 Credit 售价（人民币）"
              value={unitEconomics.creditSalePriceCny}
              onChange={(value) => updateUnitEconomics({ creditSalePriceCny: Number(value) || 0 })}
              min={0}
              decimalScale={8}
            />
            <div>
              <Text size="sm" c="dimmed">单 Credit 预计毛利率</Text>
              <Title order={3} c={unitMargin >= 0 ? 'green.6' : 'red.6'}>
                {percentLabel(unitMargin)}
              </Title>
              <NumberInput label="调整目标毛利率（%）" value={Number(unitMargin.toFixed(2))} min={0} max={99.9} decimalScale={2} onChange={value => {
                if (typeof value === 'number' && value >= 0 && value < 100) updateUnitEconomics({ creditCostCny: unitEconomics.creditSalePriceCny * (1 - value / 100) })
              }} />
              {freeExperience && <Text size="sm" c="orange">当前免费体验：实际收入为 0，以上仅为恢复计费后的测算。</Text>}
              <Text size="xs" c="dimmed">
                售价 - 成本 = {money(unitEconomics.creditSalePriceCny - unitEconomics.creditCostCny, 8)}
              </Text>
            </div>
          </SimpleGrid>
        </Paper>

        <Paper p="lg" radius="lg" withBorder>
          <Group justify="space-between" mb="md">
            <Group gap="sm">
              <BanknotesIcon width={24} height={24} />
              <Title order={3}>供应商成本规则</Title>
            </Group>
            <Group gap="xs">
              <Button variant="light" size="sm" onClick={() => addRow('llm')} leftSection={<PlusIcon width={14} height={14} />}>
                LLM
              </Button>
              <Button variant="light" size="sm" onClick={() => addRow('asr')} leftSection={<PlusIcon width={14} height={14} />}>
                ASR
              </Button>
              <Button variant="light" size="sm" onClick={() => addRow('tts')} leftSection={<PlusIcon width={14} height={14} />}>
                TTS
              </Button>
              {mode === 'dubbing' && <><Button variant="light" size="sm" onClick={() => addRow('audio_separation')}>人声分离</Button><Button variant="light" size="sm" onClick={() => addRow('dubbing_asr')}>配音转写</Button></>}
            </Group>
          </Group>

          <ScrollArea>
            <Table horizontalSpacing="sm" verticalSpacing="sm" style={{ minWidth: 1160 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>服务</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>Model ID</Table.Th>
                  <Table.Th>供应商成本</Table.Th>
                  <Table.Th>成本单位</Table.Th>
                  <Table.Th style={{ minWidth: 260 }}>推导后的扣费规则</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => {
                  const isTokenBased = row.service_kind === 'llm' || row.service_kind === 'vision'
                  const isAsr = ['asr', 'audio_separation', 'dubbing_asr'].includes(row.service_kind)
                  const costValue = rowCostValue(row)
                  return (
                    <Table.Tr key={row.id}>
                      <Table.Td>
                        <NativeSelect
                          value={row.service_kind}
                          data={serviceOptions}
                          onChange={(event) => updateRow(row.id, { service_kind: event.currentTarget.value as ServiceKind })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.provider}
                          onChange={(event) => updateRow(row.id, { provider: event.currentTarget.value })}
                          placeholder="openai / dashscope"
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.model_id}
                          onChange={(event) => updateRow(row.id, { model_id: event.currentTarget.value })}
                          placeholder="模型 ID 或 *"
                        />
                      </Table.Td>
                      <Table.Td>
                        {isTokenBased ? (
                          <SimpleGrid cols={2} spacing="xs" style={{ minWidth: 260 }}>
                            <NumberInput
                              aria-label={`${row.model_id || row.provider || serviceLabels[row.service_kind]} 输入成本`}
                              label="输入"
                              value={row.input_cost_per_million}
                              onChange={(value) => updateRow(row.id, { input_cost_per_million: Number(value) || 0 })}
                              min={0}
                              decimalScale={6}
                            />
                            <NumberInput
                              aria-label={`${row.model_id || row.provider || serviceLabels[row.service_kind]} 输出成本`}
                              label="输出"
                              value={row.output_cost_per_million}
                              onChange={(value) => updateRow(row.id, { output_cost_per_million: Number(value) || 0 })}
                              min={0}
                              decimalScale={6}
                            />
                          </SimpleGrid>
                        ) : (
                          <NumberInput
                            value={costValue}
                            onChange={(value) => {
                              const nextValue = Number(value) || 0
                              if (isAsr) {
                                updateRow(row.id, { cost_per_minute: nextValue })
                              } else {
                                updateRow(row.id, { cost_per_million_utf8_bytes: nextValue })
                              }
                            }}
                            min={0}
                            decimalScale={6}
                          />
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{costUnitLabel(row.service_kind)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={700} lh={1.35} style={{ whiteSpace: 'normal' }}>
                          {rowDerivedLabel(row, unitEconomics)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon variant="subtle" color="red" aria-label="删除价格规则" onClick={() => removeRow(row.id)}>
                          <TrashIcon width={18} height={18} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>

        <Paper p="lg" radius="lg" withBorder>
          <Group justify="space-between" align="flex-start" mb="md">
            <div>
              <Title order={3}>人民币套餐测算</Title>
              <Text size="sm" c="dimmed">
                直接填写人民币价格，调整每档积分数量，即可查看收入、交付成本和毛利。
              </Text>
            </div>
            <Badge variant="light">初始定价</Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mb="lg">
            {unitEconomics.tiersCny.map((tier, index) => (
              <NumberInput
                key={index}
                label={`套餐 ${index + 1}（人民币）`}
                value={tier}
                onChange={(value) => updateTierCny(index, Number(value) || 0)}
                min={0}
                decimalScale={6}
              />
            ))}
          </SimpleGrid>

          <ScrollArea>
            <Table horizontalSpacing="md" verticalSpacing="md" style={{ minWidth: 860 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>人民币收入</Table.Th>
                  <Table.Th>建议发放 Credits</Table.Th>
                  <Table.Th>交付成本</Table.Th>
                  <Table.Th>毛利</Table.Th>
                  <Table.Th>毛利率</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tierPlans.map((plan, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>{money(plan.revenueCny, 2)}</Table.Td>
                    <Table.Td>
                      <NumberInput
                        aria-label={`套餐 ${index + 1} 建议发放 Credits`}
                        value={plan.credits}
                        onChange={(value) => updateTierCredits(index, Number(value) || 0)}
                        min={0}
                        decimalScale={0}
                        thousandSeparator=","
                        styles={{ input: { fontWeight: 700 } }}
                      />
                    </Table.Td>
                    <Table.Td>{money(plan.deliveryCost, 4)}</Table.Td>
                    <Table.Td>
                      <Text c={plan.profit >= 0 ? 'green.6' : 'red.6'} fw={700}>
                        {money(plan.profit, 4)}
                      </Text>
                    </Table.Td>
                    <Table.Td>{percentLabel(plan.margin)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          <Text size="xs" c="dimmed" mt="md">
            保存时会把供应商成本和 1 Credit 成本换算成后端扣费规则；套餐测算只给定价建议，不会自动创建充值套餐。
          </Text>
        </Paper>
      </Stack>
    </AppPageShell>
  )
}

export default BillingRatesPage
