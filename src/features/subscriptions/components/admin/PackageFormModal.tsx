import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, NumberInput, Paper, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import type { TokenPackage } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PackageFormData) => Promise<void>
  initialData?: TokenPackage | null
  mode: 'create' | 'edit'
}

// Creem properties remain in the payload type for API compatibility but are not configurable here.
export interface PackageFormData {
  display_name: string
  description: string
  token_amount: number
  price: string
  bonus_tokens: number
  creem_product_id: string
  creem_enabled: boolean
  creem_currency: string
  is_featured: boolean
  is_active: boolean
  sort_order: number
  validity_hours: 720
  is_trial: boolean
  per_account_purchase_limit: number
}

const blank: PackageFormData = {
  display_name: '',
  description: '',
  token_amount: 0,
  price: '0',
  bonus_tokens: 0,
  creem_product_id: '',
  creem_enabled: false,
  creem_currency: 'USD',
  is_featured: false,
  is_active: true,
  sort_order: 0,
  validity_hours: 720,
  is_trial: false,
  per_account_purchase_limit: 0,
}

export function PackageFormModal({ isOpen, onClose, onSubmit, initialData, mode }: Props) {
  const [form, setForm] = useState(blank)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(initialData && mode === 'edit' ? {
      ...blank,
      display_name: initialData.display_name,
      description: initialData.description || '',
      token_amount: initialData.credit_amount ?? initialData.token_amount,
      price: String(initialData.price),
      bonus_tokens: initialData.bonus_credits ?? initialData.bonus_tokens,
      creem_product_id: initialData.creem_product_id ?? '',
      creem_enabled: initialData.creem_enabled ?? false,
      creem_currency: initialData.creem_currency ?? 'USD',
      is_featured: initialData.is_featured,
      is_active: initialData.is_active,
      sort_order: initialData.sort_order,
      is_trial: Boolean(initialData.is_trial),
      per_account_purchase_limit: initialData.is_trial ? 1 : 0,
    } : blank)
    setError(null)
  }, [initialData, mode, isOpen])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.display_name.trim() || form.token_amount <= 0 || Number(form.price) <= 0) {
      setError('请填写有效的名称、Credits 数量和人民币价格')
      return
    }

    setSaving(true)
    try {
      await onSubmit({ ...form, validity_hours: 720, per_account_purchase_limit: form.is_trial ? 1 : 0 })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return <Modal opened={isOpen} onClose={onClose} title={mode === 'create' ? '创建 Credits 套餐' : '编辑 Credits 套餐'} size="lg">
    <form onSubmit={submit}><Stack>
      {error && <Alert color="red">{error}</Alert>}
      <TextInput label="显示名称" required value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.currentTarget.value })} />
      <Textarea label="描述" value={form.description} onChange={(event) => setForm({ ...form, description: event.currentTarget.value })} />
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <NumberInput label="Credits 数量" min={1} value={form.token_amount} onChange={(value) => setForm({ ...form, token_amount: Number(value) })} />
        <NumberInput label="赠送 Credits" min={0} value={form.bonus_tokens} onChange={(value) => setForm({ ...form, bonus_tokens: Number(value) })} />
        <TextInput label="价格（人民币）" type="number" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.currentTarget.value })} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <NumberInput label="有效期（小时）" value={720} disabled />
        <NumberInput label="试用购买限制" value={form.per_account_purchase_limit} disabled />
      </SimpleGrid>
      <Paper withBorder p="md"><Text fw={600}>币种：人民币（CNY）</Text><Text c="dimmed" size="sm">有效期：30 天</Text></Paper>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Switch label="体验套餐" checked={form.is_trial} onChange={(event) => {
          const isTrial = event.currentTarget.checked
          setForm({ ...form, is_trial: isTrial, per_account_purchase_limit: isTrial ? 1 : 0 })
        }} />
        <Switch label="推荐套餐" checked={form.is_featured} onChange={(event) => setForm({ ...form, is_featured: event.currentTarget.checked })} />
        <Switch label="启用套餐" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.currentTarget.checked })} />
      </SimpleGrid>
      <NumberInput label="排序" value={form.sort_order} onChange={(value) => setForm({ ...form, sort_order: Number(value) })} />
      <Group justify="flex-end"><Button variant="outline" onClick={onClose}>取消</Button><Button type="submit" loading={saving}>保存</Button></Group>
    </Stack></form>
  </Modal>
}

export default PackageFormModal
