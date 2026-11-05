import React from 'react'
import { Link } from 'react-router-dom'
import {
  Anchor,
  Badge,
  Card,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  BanknotesIcon,
  BellIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  CreditCardIcon,
  DocumentTextIcon,
  EyeIcon,
  MicrophoneIcon,
  ServerIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@/shared/icons/tabler'
import { useAuth } from '@/features/auth'
import AppPageShell from '@/shared/components/ui/AppPageShell'

const stats = [
  {
    name: '总用户数',
    value: '1,247',
    change: '+12%',
    changeType: 'increase' as const,
    icon: UsersIcon,
  },
  {
    name: '活跃项目',
    value: '89',
    change: '+3%',
    changeType: 'increase' as const,
    icon: DocumentTextIcon,
  },
  {
    name: '系统负载',
    value: '68%',
    change: '-5%',
    changeType: 'decrease' as const,
    icon: CpuChipIcon,
  },
  {
    name: '月度处理量',
    value: '2.3k',
    change: '+18%',
    changeType: 'increase' as const,
    icon: ChartBarIcon,
  },
]

const quickActions = [
  {
    name: '系统设置',
    description: '管理系统配置和参数',
    href: '/admin/settings',
    icon: Cog6ToothIcon,
    color: 'blue',
  },
  {
    name: '公告发布',
    description: '向所有激活用户广播系统公告',
    href: '/admin/announcements',
    icon: BellIcon,
    color: 'blue',
  },
  {
    name: '价格管理',
    description: '维护 Credits 人民币成本和利润单价',
    href: '/admin/billing-rates',
    icon: BanknotesIcon,
    color: 'green',
  },
  {
    name: '订阅管理',
    description: '管理 Creem 月付和年付订阅计划',
    href: '/admin/subscriptions/plans',
    icon: CreditCardIcon,
    color: 'brand',
  },
  {
    name: 'Credits 套餐',
    description: '管理一次性充值套餐和支付映射',
    href: '/admin/credit-packages',
    icon: BanknotesIcon,
    color: 'green',
  },
  {
    name: '统计分析',
    description: '查看系统任务和作业状态',
    href: '/admin/analytics',
    icon: EyeIcon,
    color: 'green',
  },
  {
    name: '用户管理',
    description: '管理用户账户和权限',
    href: '/admin/users',
    icon: UsersIcon,
    color: 'violet',
  },
  {
    name: 'TTS音色管理',
    description: '管理 SiliconFlow 音色、合成和转写',
    href: '/admin/tts-voices',
    icon: MicrophoneIcon,
    color: 'cyan',
  },
  {
    name: '系统日志',
    description: '查看系统运行日志',
    href: '#',
    icon: ServerIcon,
    color: 'orange',
  },
]

const recentActivities = [
  {
    id: 1,
    title: '用户注册',
    message: '新用户 zhang@example.com 完成注册',
    time: '5分钟前',
    color: 'blue',
    icon: UsersIcon,
  },
  {
    id: 2,
    title: '配置更新',
    message: '系统配置已更新',
    time: '15分钟前',
    color: 'gray',
    icon: Cog6ToothIcon,
  },
  {
    id: 3,
    title: '任务完成',
    message: '视频处理任务 #1234 已完成',
    time: '32分钟前',
    color: 'brand',
    icon: DocumentTextIcon,
  },
  {
    id: 4,
    title: '服务预警',
    message: 'TTS 服务连接异常',
    time: '1小时前',
    color: 'yellow',
    icon: CpuChipIcon,
  },
  {
    id: 5,
    title: '备份完成',
    message: '数据库备份完成',
    time: '2小时前',
    color: 'green',
    icon: ServerIcon,
  },
]

const serviceStatus = [
  { name: 'API 服务', status: '正常', color: 'green' },
  { name: '数据库', status: '正常', color: 'green' },
  { name: 'TTS 服务', status: '警告', color: 'yellow' },
]

const AdminDashboard: React.FC = () => {
  const { user } = useAuth()

  return (
    <AppPageShell py="xl">
        <Paper
          p="xl"
          radius="xl"
          withBorder
          style={{
            background: 'linear-gradient(135deg, rgba(91, 148, 255, 0.14), rgba(91, 148, 255, 0.04))',
            borderColor: 'rgba(91, 148, 255, 0.22)',
          }}
        >
          <Group align="flex-start" wrap="nowrap">
            <ThemeIcon size={52} radius="xl" variant="light" color="brand">
              <ShieldCheckIcon width={28} height={28} />
            </ThemeIcon>
            <Stack gap={6}>
              <Title order={1}>管理后台</Title>
              <Text c="dimmed">
                欢迎回来，{user?.display_name || user?.username}
              </Text>
              <Text c="dimmed">
                这里是系统管理中心，您可以监控系统状态、管理用户、配置系统参数。
              </Text>
            </Stack>
          </Group>
        </Paper>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
          {stats.map((item) => {
            const StatIcon = item.icon
            return (
              <Card key={item.name} padding="lg" radius="xl" withBorder>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={4}>
                    <Text size="sm" c="dimmed">
                      {item.name}
                    </Text>
                    <Text size="xl" fw={700}>
                      {item.value}
                    </Text>
                  </Stack>
                  <ThemeIcon size={48} radius="xl" variant="light" color="brand">
                    <StatIcon width={24} height={24} />
                  </ThemeIcon>
                </Group>
                <Badge
                  mt="lg"
                  variant="light"
                  color={item.changeType === 'increase' ? 'green' : 'red'}
                  w="fit-content"
                >
                  {item.change} 相比上月
                </Badge>
              </Card>
            )
          })}
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
          <Paper p="lg" radius="xl" withBorder>
            <Stack gap="md">
              <Title order={3}>快速操作</Title>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {quickActions.map((action) => {
                  const ActionIcon = action.icon
                  return (
                    <Card
                      key={action.name}
                      component={Link}
                      to={action.href}
                      padding="md"
                      radius="lg"
                      withBorder
                    >
                      <Group align="flex-start" wrap="nowrap">
                        <ThemeIcon size={44} radius="xl" variant="light" color={action.color}>
                          <ActionIcon width={22} height={22} />
                        </ThemeIcon>
                        <Stack gap={2}>
                          <Text fw={600}>{action.name}</Text>
                          <Text size="sm" c="dimmed">
                            {action.description}
                          </Text>
                        </Stack>
                      </Group>
                    </Card>
                  )
                })}
              </SimpleGrid>
            </Stack>
          </Paper>

          <Paper p="lg" radius="xl" withBorder>
            <Stack gap="md">
              <Title order={3}>最近活动</Title>
              {recentActivities.map((activity) => {
                const ActivityIcon = activity.icon
                return (
                  <Group key={activity.id} align="flex-start" wrap="nowrap">
                    <ThemeIcon size={40} radius="xl" variant="light" color={activity.color}>
                      <ActivityIcon width={20} height={20} />
                    </ThemeIcon>
                    <Stack gap={2} flex={1}>
                      <Text fw={600}>{activity.title}</Text>
                      <Text size="sm">{activity.message}</Text>
                      <Text size="xs" c="dimmed">
                        {activity.time}
                      </Text>
                    </Stack>
                  </Group>
                )
              })}

              <Anchor component={Link} to="#" c="brand" fw={600}>
                查看所有活动
              </Anchor>
            </Stack>
          </Paper>
        </SimpleGrid>

        <Paper p="lg" radius="xl" withBorder>
          <Stack gap="md">
            <Title order={3}>系统状态</Title>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              {serviceStatus.map((item) => (
                <Paper key={item.name} p="md" radius="lg" withBorder>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={4}>
                      <Text size="sm" c="dimmed">
                        {item.name}
                      </Text>
                      <Badge variant="light" color={item.color} w="fit-content">
                        {item.status}
                      </Badge>
                    </Stack>
                    <ThemeIcon size={18} radius="xl" color={item.color} />
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Paper>
    </AppPageShell>
  )
}

export default AdminDashboard
