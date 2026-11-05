import React from 'react'
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { ChartBarIcon, CreditCardIcon } from '@/shared/icons/tabler'
import type { AdminUserDetail } from '../types/user'

interface UserDetailModalProps {
  detail: AdminUserDetail | null
  loading: boolean
  onClose: () => void
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({
  detail,
  loading,
  onClose,
}) => {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const totalCredits = detail?.token_account.total_credits ?? detail?.token_account.total_tokens ?? 0
  const usedCredits = detail?.token_account.used_credits ?? detail?.token_account.used_tokens ?? 0
  const remainingCredits = detail?.token_account.remaining_credits ?? detail?.token_account.remaining_tokens ?? 0

  const usagePercent = detail
    ? Math.min(
        totalCredits > 0
          ? (usedCredits / totalCredits) * 100
          : 0,
        100
      )
    : 0

  const renderInfoItem = (label: string, value: React.ReactNode) => (
    <Stack gap={2}>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Stack>
  )

  return (
    <Modal
      opened
      onClose={onClose}
      centered
      size="64rem"
      title={<Title order={3}>用户详情</Title>}
      overlayProps={{ backgroundOpacity: 0.75, blur: 6 }}
    >
      {loading ? (
        <Text c="dimmed" ta="center" py="xl">加载中...</Text>
      ) : !detail ? (
        <Alert color="red" variant="light">加载失败，请重试</Alert>
      ) : (
        <Stack gap="xl">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {renderInfoItem('用户名', detail.username)}
            {renderInfoItem('邮箱', detail.email)}
            {renderInfoItem('显示名称', detail.display_name || '-')}
            {renderInfoItem('用户ID', <Text ff="monospace" size="xs">{detail.id}</Text>)}
            {renderInfoItem('注册时间', formatDate(detail.created_at))}
            {renderInfoItem('最后登录', formatDate(detail.last_login_at))}
            {renderInfoItem('邮箱验证时间', formatDate(detail.email_verified_at))}
            <Stack gap={4}>
              <Text size="sm" c="dimmed">账户状态</Text>
              <Group gap="xs">
                <Badge color={detail.is_active ? 'green' : 'red'} variant="light">
                  {detail.is_active ? '正常' : '已封禁'}
                </Badge>
                {detail.is_admin && <Badge color="violet" variant="light">管理员</Badge>}
                {detail.is_verified && <Badge color="blue" variant="light">已验证</Badge>}
              </Group>
            </Stack>
          </SimpleGrid>

          <Divider />

          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="xl" color="brand" variant="light">
                <CreditCardIcon width={20} height={20} />
              </ThemeIcon>
              <Title order={4}>Credits账户</Title>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
              <Paper withBorder radius="lg" p="md">
                <Text size="sm" c="dimmed">累计购买</Text>
                <Text size="xl" fw={700}>{totalCredits.toLocaleString()}</Text>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="sm" c="dimmed">已使用</Text>
                <Text size="xl" fw={700} c="red">{usedCredits.toLocaleString()}</Text>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="sm" c="dimmed">剩余</Text>
                <Text size="xl" fw={700} c="brand">{remainingCredits.toLocaleString()}</Text>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="sm" c="dimmed">累计充值</Text>
                <Text size="xl" fw={700}>¥{detail.token_account.total_recharged}</Text>
              </Paper>
            </SimpleGrid>

            <Stack gap="xs">
              <Progress value={usagePercent} color="brand" radius="xl" />
              {detail.token_account.last_recharge_at && (
                <Text size="sm" c="dimmed">
                  最后充值：{formatDate(detail.token_account.last_recharge_at)}
                </Text>
              )}
            </Stack>
          </Stack>

          <Divider />

          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="xl" color="brand" variant="light">
                <ChartBarIcon width={20} height={20} />
              </ThemeIcon>
              <Title order={4}>近{detail.recent_usage.period_days}天使用统计</Title>
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Paper withBorder radius="lg" p="md">
                <Text size="sm" c="dimmed">总消耗</Text>
                <Text size="xl" fw={700}>{detail.recent_usage.total_used.toLocaleString()}</Text>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="sm" c="dimmed">日均消耗</Text>
                <Text size="xl" fw={700}>{detail.recent_usage.daily_average.toFixed(0)}</Text>
              </Paper>
            </SimpleGrid>

            {detail.recent_usage.top_apis?.length > 0 && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>最常用 API</Text>
                {detail.recent_usage.top_apis.map((api, index) => (
                  <Paper key={`${api.api_endpoint}-${index}`} withBorder radius="lg" p="md">
                    <Group justify="space-between" align="flex-start">
                      <Text size="sm">{api.api_endpoint}</Text>
                      <Group gap="md">
                        <Text size="sm" c="dimmed">{api.request_count} 次请求</Text>
                        <Text size="sm" c="brand" fw={600}>{(api.credit_count ?? api.token_count).toLocaleString()} Credits</Text>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}

            {detail.recent_usage.top_models?.length > 0 && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>最常用模型</Text>
                {detail.recent_usage.top_models.map((model, index) => (
                  <Paper key={`${model.model_name}-${index}`} withBorder radius="lg" p="md">
                    <Group justify="space-between" align="flex-start">
                      <Text size="sm">{model.model_name}</Text>
                      <Group gap="md">
                        <Text size="sm" c="dimmed">{model.request_count} 次请求</Text>
                        <Text size="sm" c="brand" fw={600}>{(model.credit_count ?? model.token_count).toLocaleString()} Credits</Text>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}

            {detail.recent_usage.daily_trend?.length > 0 && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>每日趋势（最近7天）</Text>
                {detail.recent_usage.daily_trend.slice(-7).map((day, index) => (
                  <Paper key={`${day.date}-${index}`} withBorder radius="lg" p="md">
                    <Group justify="space-between" align="center">
                      <Text size="sm" c="dimmed" w={96}>{day.date}</Text>
                      <Stack gap={6} style={{ flex: 1 }}>
                        <Progress
                          value={Math.min(
                            detail.recent_usage.daily_average > 0
                              ? ((day.credit_count ?? day.token_count) / detail.recent_usage.daily_average) * 50
                              : 0,
                            100
                          )}
                          color="brand"
                          radius="xl"
                        />
                        <Text size="sm">{(day.credit_count ?? day.token_count).toLocaleString()} Credits</Text>
                      </Stack>
                      <Text size="sm" c="dimmed">{day.request_count} 次</Text>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>

          <Group justify="flex-end">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

export default UserDetailModal
