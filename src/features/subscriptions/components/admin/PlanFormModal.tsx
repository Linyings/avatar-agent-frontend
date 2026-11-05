import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Pill,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { PlusIcon } from '@/shared/icons/tabler'
import type { SubscriptionPlanResponse } from '../../types'

interface PlanFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PlanFormData) => Promise<void>
  initialData?: SubscriptionPlanResponse | null
  mode: 'create' | 'edit'
}

export interface PlanFormData {
  display_name: string
  description: string
  monthly_token_limit: number
  price_monthly: string
  price_yearly: string
  currency: string
  creem_product_id_monthly: string
  creem_product_id_yearly: string
  alipay_plan_id: string
  alipay_product_id: string
  subscription_provider_enabled: boolean
  features: string[]
  is_featured: boolean
  is_active: boolean
  sort_order: number
}

const defaultFormData: PlanFormData = {
  display_name: '',
  description: '',
  monthly_token_limit: 0,
  price_monthly: '0',
  price_yearly: '0',
  currency: 'USD',
  creem_product_id_monthly: '',
  creem_product_id_yearly: '',
  alipay_plan_id: '',
  alipay_product_id: '',
  subscription_provider_enabled: false,
  features: [],
  is_featured: false,
  is_active: true,
  sort_order: 0,
}

export const PlanFormModal: React.FC<PlanFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  mode,
}) => {
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData)
  const [newFeature, setNewFeature] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialData && mode === 'edit') {
      setFormData({
        display_name: initialData.display_name,
        description: initialData.description || '',
        monthly_token_limit: initialData.monthly_token_limit,
        price_monthly: initialData.price_monthly,
        price_yearly: initialData.price_yearly,
        currency: initialData.currency || 'USD',
        creem_product_id_monthly: initialData.creem_product_id_monthly || '',
        creem_product_id_yearly: initialData.creem_product_id_yearly || '',
        alipay_plan_id: initialData.alipay_plan_id || '',
        alipay_product_id: initialData.alipay_product_id || '',
        subscription_provider_enabled: initialData.subscription_provider_enabled || false,
        features: initialData.features || [],
        is_featured: initialData.is_featured,
        is_active: initialData.is_active,
        sort_order: initialData.sort_order,
      })
    } else {
      setFormData(defaultFormData)
    }
    setError(null)
    setNewFeature('')
  }, [initialData, mode, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.display_name.trim()) {
      setError('显示名称不能为空')
      return
    }
    if (formData.monthly_token_limit <= 0) {
      setError('Credits限额必须大于0')
      return
    }
    const monthlyPrice = Number(formData.price_monthly)
    const yearlyPrice = Number(formData.price_yearly)
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
      setError('月付价格必须大于0')
      return
    }
    if (!Number.isFinite(yearlyPrice) || yearlyPrice <= 0) {
      setError('年付价格必须大于0')
      return
    }
    if (formData.subscription_provider_enabled && (!formData.alipay_plan_id.trim() || !formData.alipay_product_id.trim())) {
      setError('启用支付宝订阅前必须填写 Plan ID 和 Product ID')
      return
    }

    try {
      setIsSubmitting(true)
      await onSubmit(formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddFeature = () => {
    const feature = newFeature.trim()
    if (!feature) return

    setFormData((prev) => ({
      ...prev,
      features: [...prev.features, feature],
    }))
    setNewFeature('')
  }

  const handleRemoveFeature = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      closeOnClickOutside={!isSubmitting}
      closeOnEscape={!isSubmitting}
      withCloseButton={!isSubmitting}
      title={mode === 'create' ? '创建订阅计划' : '编辑订阅计划'}
      size="xl"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {error && <Alert color="red" variant="light">{error}</Alert>}

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TextInput
              label="显示名称"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.currentTarget.value })}
              placeholder="例如: 基础版, 专业版"
              required
            />
          </SimpleGrid>

          <Textarea
            label="描述"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.currentTarget.value })}
            placeholder="计划描述"
            minRows={3}
          />

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <TextInput
              label="月付价格 (¥)"
              type="number"
              step="0.01"
              value={formData.price_monthly}
              onChange={(e) => setFormData({ ...formData, price_monthly: e.currentTarget.value })}
              required
            />
            <TextInput
              label="年付价格 (¥)"
              type="number"
              step="0.01"
              value={formData.price_yearly}
              onChange={(e) => setFormData({ ...formData, price_yearly: e.currentTarget.value })}
              required
            />
            <NumberInput
              label="Credits限额"
              value={formData.monthly_token_limit}
              onChange={(value) => setFormData({ ...formData, monthly_token_limit: Number(value) || 0 })}
              min={0}
              allowDecimal={false}
              required
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <TextInput
              label="货币"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.currentTarget.value.toUpperCase() })}
              placeholder="USD"
              required
            />
            <TextInput
              label="Creem 月付 Product ID（停用兼容配置）"
              value={formData.creem_product_id_monthly}
              onChange={(e) => setFormData({ ...formData, creem_product_id_monthly: e.currentTarget.value })}
              placeholder="prod_xxx"
            />
            <TextInput
              label="Creem 年付 Product ID（停用兼容配置）"
              value={formData.creem_product_id_yearly}
              onChange={(e) => setFormData({ ...formData, creem_product_id_yearly: e.currentTarget.value })}
              placeholder="prod_xxx"
            />
          </SimpleGrid>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Stack gap={2}>
                  <Text fw={600}>支付宝自动订阅</Text>
                  <Text size="xs" c="dimmed">审核期间保持关闭，产品 ID 下发后再启用。</Text>
                </Stack>
                <Switch
                  checked={formData.subscription_provider_enabled}
                  onChange={(event) => setFormData({ ...formData, subscription_provider_enabled: event.currentTarget.checked })}
                  label="可购买"
                />
              </Group>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                  label="支付宝 Plan ID"
                  value={formData.alipay_plan_id}
                  onChange={(e) => setFormData({ ...formData, alipay_plan_id: e.currentTarget.value })}
                  placeholder="审核通过后填写"
                />
                <TextInput
                  label="支付宝 Product ID"
                  value={formData.alipay_product_id}
                  onChange={(e) => setFormData({ ...formData, alipay_product_id: e.currentTarget.value })}
                  placeholder="审核通过后填写"
                />
              </SimpleGrid>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="sm">
              <Text size="sm" fw={600}>功能特性</Text>
              <Group gap="xs">
                {formData.features.length > 0 ? (
                  formData.features.map((feature, index) => (
                    <Pill
                      key={`${feature}-${index}`}
                      withRemoveButton
                      onRemove={() => handleRemoveFeature(index)}
                    >
                      {feature}
                    </Pill>
                  ))
                ) : (
                  <Text size="sm" c="dimmed">尚未添加功能特性</Text>
                )}
              </Group>
              <Group align="end" wrap="nowrap">
                <TextInput
                  style={{ flex: 1 }}
                  label="新增特性"
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddFeature()
                    }
                  }}
                  placeholder="添加新功能特性"
                />
                <Button
                  type="button"
                  variant="outline"
                  leftSection={<PlusIcon className="h-4 w-4" />}
                  onClick={handleAddFeature}
                >
                  添加
                </Button>
              </Group>
            </Stack>
          </Paper>

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <NumberInput
              label="排序"
              value={formData.sort_order}
              onChange={(value) => setFormData({ ...formData, sort_order: Number(value) || 0 })}
              allowDecimal={false}
            />
            <Paper withBorder radius="lg" p="md">
              <Switch
                checked={formData.is_featured}
                onChange={(event) => setFormData({ ...formData, is_featured: event.currentTarget.checked })}
                label="推荐计划"
              />
            </Paper>
            <Paper withBorder radius="lg" p="md">
              <Switch
                checked={formData.is_active}
                onChange={(event) => setFormData({ ...formData, is_active: event.currentTarget.checked })}
                label="启用计划"
              />
            </Paper>
          </SimpleGrid>

          <Group justify="flex-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {mode === 'create' ? '创建计划' : '保存修改'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

export default PlanFormModal
