// Credits套餐卡片组件（管理员视图）

import React from 'react'
import {
  Badge,
  Button,
  Card,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core'
import {
  PencilIcon,
  TrashIcon,
} from '@/shared/icons/tabler'
import type { TokenPackage } from '../../types'

interface PackageCardProps {
  package: TokenPackage
  onEdit?: (pkg: TokenPackage) => void
  onDelete?: (pkg: TokenPackage) => void
  onHardDelete?: (pkg: TokenPackage) => void
  onToggleActive?: (pkg: TokenPackage) => void
}

export const PackageCard: React.FC<PackageCardProps> = ({
  package: pkg,
  onEdit,
  onDelete,
  onHardDelete,
  onToggleActive,
}) => {
  const creditAmount = pkg.credit_amount ?? pkg.token_amount
  const bonusCredits = pkg.bonus_credits ?? pkg.bonus_tokens
  const totalCredits = pkg.total_credits_with_bonus ?? pkg.total_tokens_with_bonus
  const isDeleted = Boolean(pkg.is_deleted || pkg.deleted_at)

  return (
    <Card
      padding="lg"
      radius="xl"
      withBorder
      style={{
        borderColor: isDeleted
          ? 'rgba(250, 82, 82, 0.35)'
          : pkg.is_featured
            ? 'rgba(91, 148, 255, 0.45)'
            : undefined,
        opacity: isDeleted ? 0.72 : 1,
      }}
    >
      {pkg.is_featured && !isDeleted && (
        <Badge variant="filled" color="brand" w="fit-content" mx="auto" mt={-36} mb="sm">
          推荐
        </Badge>
      )}

      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text size="xl" fw={700}>{pkg.display_name}</Text>
            {pkg.description ? (
              <Text size="sm" c="dimmed">{pkg.description}</Text>
            ) : null}
          </Stack>
          <Badge color={isDeleted ? 'red' : pkg.is_active ? 'green' : 'gray'} variant="light">
            {isDeleted ? '已删除' : pkg.is_active ? '启用' : '禁用'}
          </Badge>
        </Group>
        <Group gap="xs">
          <Badge color="green" variant="light">微信支付</Badge>
          <Badge color="blue" variant="light">支付宝</Badge>
          <Badge color="gray" variant="light">30 天有效</Badge>
          {pkg.is_trial ? <Badge color="orange" variant="light">每账号限购一次</Badge> : null}
        </Group>

        <Stack gap={2}>
          <Text size="sm" c="dimmed">充值价格</Text>
          <Text size="2rem" fw={700}>¥{pkg.price}</Text>
          <Text size="sm" c="dimmed">
            单价: ¥{pkg.unit_price}/千 Credits
          </Text>
        </Stack>

        <Paper p="md" radius="lg" withBorder>
          <Stack gap={4}>
            <Text size="sm" c="dimmed">Credits 数量</Text>
            <Group align="flex-end" gap="xs">
              <Text size="1.75rem" fw={700} c="brand">
                {creditAmount.toLocaleString()}
              </Text>
              {bonusCredits > 0 ? (
                <Badge color="yellow" variant="light">
                  + {bonusCredits.toLocaleString()} 赠送
                </Badge>
              ) : null}
            </Group>
            <Text size="xs" c="dimmed">
              共计: {totalCredits.toLocaleString()} Credits
            </Text>
          </Stack>
        </Paper>

        <Group grow align="stretch">
          {isDeleted ? (
            <Button
              onClick={() => onHardDelete?.(pkg)}
              variant="filled"
              color="red"
              leftSection={<TrashIcon width={16} height={16} />}
            >
              硬删除
            </Button>
          ) : (
            <>
              <Button
                onClick={() => onToggleActive?.(pkg)}
                variant={pkg.is_active ? 'default' : 'filled'}
              >
                {pkg.is_active ? '禁用' : '启用'}
              </Button>
              <Button
                onClick={() => onEdit?.(pkg)}
                variant="light"
                color="brand"
                leftSection={<PencilIcon width={16} height={16} />}
              >
                编辑
              </Button>
              <Button
                onClick={() => onDelete?.(pkg)}
                variant="light"
                color="red"
                leftSection={<TrashIcon width={16} height={16} />}
              >
                删除
              </Button>
            </>
          )}
        </Group>

        <Group justify="space-between">
          <Text size="xs" c="dimmed">排序: {pkg.sort_order}</Text>
          <Text size="xs" c="dimmed">
            {isDeleted && pkg.deleted_at ? '删除' : '创建'}:{' '}
            {new Date(isDeleted && pkg.deleted_at ? pkg.deleted_at : pkg.created_at).toLocaleDateString()}
          </Text>
        </Group>
      </Stack>
    </Card>
  )
}

export default PackageCard
