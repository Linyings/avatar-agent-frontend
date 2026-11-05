// 订阅计划卡片组件（管理员视图）

import React from 'react'
import { Button, Divider, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import {
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
} from '@/shared/icons/tabler'
import SurfaceCard from '@/shared/components/ui/SurfaceCard'
import StatusChip from '@/shared/components/ui/StatusChip'
import type { SubscriptionPlanResponse } from '../../types'

interface PlanCardProps {
  plan: SubscriptionPlanResponse
  onEdit?: (plan: SubscriptionPlanResponse) => void
  onDelete?: (plan: SubscriptionPlanResponse) => void
  onHardDelete?: (plan: SubscriptionPlanResponse) => void
  onToggleActive?: (plan: SubscriptionPlanResponse) => void
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  onEdit,
  onDelete,
  onHardDelete,
  onToggleActive,
}) => {
  const isDeleted = Boolean(plan.is_deleted || plan.deleted_at)
  const borderColor = isDeleted
    ? 'rgba(250, 82, 82, 0.35)'
    : plan.is_featured
      ? 'rgba(43, 216, 98, 0.35)'
      : 'rgba(255, 255, 255, 0.08)'

  return (
    <SurfaceCard
      tone="default"
      interactive
      radius="xl"
      p="xl"
      style={{
        position: 'relative',
        borderColor,
        boxShadow: plan.is_featured && !isDeleted ? '0 18px 40px rgba(43, 216, 98, 0.12)' : undefined,
        opacity: isDeleted ? 0.72 : 1,
      }}
    >
      {plan.is_featured && !isDeleted && (
        <StatusChip
          tone="brand"
          size="xs"
          style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          推荐
        </StatusChip>
      )}

      <Stack gap="lg" mt={plan.is_featured ? 'sm' : 0}>
        <Group justify="space-between" align="flex-start" gap="sm">
          <div>
            <Title order={3}>{plan.display_name}</Title>
            {plan.description ? <Text c="gray.3" size="sm" mt="sm">{plan.description}</Text> : null}
          </div>
          <StatusChip tone={isDeleted ? 'danger' : plan.is_active ? 'success' : 'neutral'}>
            {isDeleted ? '已删除' : plan.is_active ? '启用' : '禁用'}
          </StatusChip>
        </Group>

        <SimpleGrid cols={2} spacing="md">
          <div>
            <Text c="dimmed" size="sm">月付价格</Text>
            <Title order={2} mt={4}>¥{plan.price_monthly}</Title>
          </div>
          <div>
            <Text c="dimmed" size="sm">年付价格</Text>
            <Title order={2} mt={4}>¥{plan.price_yearly}</Title>
          </div>
        </SimpleGrid>

        <SurfaceCard tone="subtle" p="md">
          <Text c="dimmed" size="sm">月度Credits限额</Text>
          <Text c="brand.4" fw={700} size="lg" mt={4}>
            {plan.monthly_token_limit.toLocaleString()}
          </Text>
        </SurfaceCard>

        <Group justify="space-between" align="center">
          <Text c="dimmed" size="sm">支付宝自动订阅</Text>
          <StatusChip tone={plan.subscription_provider_enabled ? 'success' : 'neutral'}>
            {plan.subscription_provider_enabled ? '已映射' : '待配置'}
          </StatusChip>
        </Group>

        {plan.features && plan.features.length > 0 ? (
          <Stack gap="xs">
            <Text c="dimmed" fw={500} size="sm">功能特性</Text>
            {plan.features.map((feature, index) => (
              <Group key={index} gap="xs" align="flex-start" wrap="nowrap">
                <CheckCircleIcon style={{ width: 18, height: 18, color: '#3f7cff', marginTop: 2 }} />
                <Text size="sm" c="gray.3">{feature}</Text>
              </Group>
            ))}
          </Stack>
        ) : null}

        <Divider color="rgba(255, 255, 255, 0.08)" />

        <Group gap="sm" wrap="nowrap">
          {isDeleted ? (
            <Button
              fullWidth
              variant="filled"
              color="red"
              onClick={() => onHardDelete?.(plan)}
              leftSection={<TrashIcon style={{ width: 16, height: 16 }} />}
            >
              硬删除
            </Button>
          ) : (
            <>
              <Button
                fullWidth
                variant={plan.is_active ? 'default' : 'filled'}
                color={plan.is_active ? 'gray' : 'brand'}
                onClick={() => onToggleActive?.(plan)}
              >
                {plan.is_active ? '禁用' : '启用'}
              </Button>
              <Button
                variant="light"
                color="brand"
                onClick={() => onEdit?.(plan)}
                leftSection={<PencilIcon style={{ width: 16, height: 16 }} />}
              >
                编辑
              </Button>
              <Button
                variant="light"
                color="red"
                onClick={() => onDelete?.(plan)}
              >
                <TrashIcon style={{ width: 16, height: 16 }} />
              </Button>
            </>
          )}
        </Group>

        <Group justify="space-between">
          <Text c="dimmed" size="xs">排序: {plan.sort_order}</Text>
          <Text c="dimmed" size="xs">
            {isDeleted && plan.deleted_at ? '删除' : '创建'}:{' '}
            {new Date(isDeleted && plan.deleted_at ? plan.deleted_at : plan.created_at).toLocaleDateString()}
          </Text>
        </Group>
      </Stack>
    </SurfaceCard>
  )
}

export default PlanCard
