// 订阅计划管理页面（管理员）

import React, { useState, useEffect } from 'react'
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { PlusIcon } from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import AdminBackButton from '@/shared/components/ui/AdminBackButton'
import { subscriptionService } from '@/features/subscriptions'
import { PlanCard } from '@/features/subscriptions/components/admin/PlanCard'
import { PlanFormModal, type PlanFormData } from '@/features/subscriptions/components/admin/PlanFormModal'
import type {
  SubscriptionPlanCreateRequest,
  SubscriptionPlanResponse,
  SubscriptionPlanUpdateRequest,
} from '@/features/subscriptions/types'

const buildPlanPayload = (data: PlanFormData): SubscriptionPlanCreateRequest => ({
  ...data,
  display_name: data.display_name.trim(),
  description: data.description.trim(),
  monthly_credits: data.monthly_token_limit,
  price_monthly: Number(data.price_monthly),
  price_yearly: Number(data.price_yearly),
  currency: data.currency.trim().toUpperCase(),
  creem_product_id_monthly: data.creem_product_id_monthly.trim(),
  creem_product_id_yearly: data.creem_product_id_yearly.trim(),
})

const SubscriptionPlansPage: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlanResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanResponse | null>(null)

  const loadPlans = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await subscriptionService.listAdminPlans({ per_page: 100, page: 1 })
      setPlans(response.items)
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载订阅计划失败'
      setError(message)
      console.error('加载订阅计划失败:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPlans()
  }, [])

  const handleToggleActive = async (plan: SubscriptionPlanResponse) => {
    if (plan.is_deleted) return
    try {
      await subscriptionService.updatePlan(plan.id, { is_active: !plan.is_active })
      await loadPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    }
  }

  // 打开创建弹窗
  const handleCreate = () => {
    setModalMode('create')
    setSelectedPlan(null)
    setIsModalOpen(true)
  }

  const handleEdit = (plan: SubscriptionPlanResponse) => {
    if (plan.is_deleted) return
    setModalMode('edit')
    setSelectedPlan(plan)
    setIsModalOpen(true)
  }

  const handleSubmit = async (data: PlanFormData) => {
    const payload = buildPlanPayload(data)
    if (modalMode === 'create') {
      await subscriptionService.createPlan(payload)
    } else if (selectedPlan) {
      await subscriptionService.updatePlan(selectedPlan.id, payload as SubscriptionPlanUpdateRequest)
    }

    await loadPlans()
    setIsModalOpen(false)
  }

  const handleDelete = async (plan: SubscriptionPlanResponse) => {
    modals.openConfirmModal({
      title: '删除订阅计划',
      centered: true,
      children: (
        <Text size="sm">
          确定要删除订阅计划“{plan.display_name}”吗？该计划会从售卖列表移除，历史记录仍会保留。
        </Text>
      ),
      labels: { confirm: '确认删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await subscriptionService.deletePlan(plan.id)
          await loadPlans()
        } catch (err) {
          setError(err instanceof Error ? err.message : '删除失败')
        }
      },
    })
  }

  const handleHardDelete = async (plan: SubscriptionPlanResponse) => {
    modals.openConfirmModal({
      title: '永久删除订阅计划',
      centered: true,
      children: (
        <Text size="sm">
          确定要永久删除订阅计划“{plan.display_name}”吗？此操作会移除数据库记录，无法恢复。
        </Text>
      ),
      labels: { confirm: '永久删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await subscriptionService.deletePlan(plan.id, { hard: true })
          await loadPlans()
        } catch (err) {
          setError(err instanceof Error ? err.message : '永久删除失败')
        }
      },
    })
  }

  return (
    <AppPageShell py="xl" gap="lg">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start" wrap="nowrap">
          <AdminBackButton />
          <Stack gap={4}>
            <Title order={1}>订阅计划管理</Title>
            <Text c="dimmed">管理 Creem 月付/年付订阅、周期 Credits 和上下架状态。</Text>
          </Stack>
        </Group>
        <Button onClick={handleCreate} leftSection={<PlusIcon width={18} height={18} />}>
          创建订阅计划
        </Button>
      </Group>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Center py="xl">
          <Loader color="brand" />
        </Center>
      ) : plans.length === 0 && !error ? (
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Text size="lg">暂无订阅计划</Text>
            <Text c="dimmed">创建第一个订阅计划开始配置 Creem 收费策略。</Text>
            <Button onClick={handleCreate} variant="default">
              创建第一个订阅计划
            </Button>
          </Stack>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onHardDelete={handleHardDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </SimpleGrid>
      )}

      <PlanFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        initialData={selectedPlan}
        mode={modalMode}
      />
    </AppPageShell>
  )
}

export default SubscriptionPlansPage
