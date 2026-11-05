import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Accordion,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  List,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { CheckCircleIcon, Sparkles } from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import { useTokenPackages } from '@/features/subscriptions/hooks'
import type { TokenPackage } from '@/features/subscriptions/types'
import { useAuth } from '@/features/auth'
import { CreditPaymentModal } from '@/features/subscriptions/components/CreditPaymentModal'

const faqItems = [
  {
    value: 'expiry',
    question: 'Credits有效期是多久？',
    answer: '每次购买的 Credits 自支付成功起 30 天内有效，到期后未使用的余额会自动清零。系统会优先使用更早到期的 Credits。',
  },
  {
    value: 'payment',
    question: '如何充值Credits？',
    answer: '选择套餐和微信或支付宝后扫码支付，支付成功后 Credits 会立即到账。',
  },
  {
    value: 'billing',
    question: 'Credits如何计费？',
    answer:
      '标准视频按 15 分钟为一个参考量级，单条约消耗 2 万 Credits。实际消耗会随视频时长、画面复杂度和 AI 分析深度变化；超长视频因上下文增加，Credits 消耗会进一步上升。',
  },
  {
    value: 'channel',
    question: '支持哪些支付方式？',
    answer: '支持微信扫码支付和支付宝扫码支付，价格均以人民币结算。',
  },
] as const

const elevatedSurfaceStyle = {
  background: 'var(--app-surface-elevated)',
  borderColor: 'var(--app-border)',
  boxShadow: 'var(--app-shadow)',
} as const

const contrastSurfaceStyle = {
  background: 'var(--app-dashboard-panel-subtle-bg)',
  border: '1px solid var(--app-border-subtle)',
} as const

const primaryButtonStyles = {
  root: {
    boxShadow: '0 12px 28px rgba(63, 124, 255, 0.22)',
  },
} as const

const heroPanelStyle = {
  background:
    'linear-gradient(135deg, var(--app-brand-soft-bg-strong), transparent 42%), var(--app-surface-elevated)',
  borderColor: 'var(--app-border)',
  boxShadow: 'var(--app-shadow-strong)',
} as const

const mutedBadgeStyle = {
  background: 'var(--app-brand-soft-bg)',
  border: '1px solid var(--app-brand-soft-border)',
  color: 'var(--app-nav-active-text)',
} as const

const formatCredits = (credits: number) => credits.toLocaleString()
const estimateVideos = (credits: number) => Math.max(1, Math.floor(credits / 20000))

export default function PricingPage() {
  const { packages, isLoading } = useTokenPackages()
  const [selectedPackage, setSelectedPackage] = useState<TokenPackage | null>(null)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  const handleSelectPackage = (pkg: TokenPackage) => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    setSelectedPackage(pkg)
    setIsPaymentModalOpen(true)
  }

  const handlePaymentSuccess = () => {
    navigate('/subscription')
  }

  const gridCols = packages.length >= 3 ? 3 : packages.length === 2 ? 2 : 1

  return (
    <AppPageShell py={{ base: 28, md: 48 }} gap={36}>
      <Paper
        withBorder
        radius={8}
        p={{ base: 'lg', md: 32 }}
        style={heroPanelStyle}
      >
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: 'xl', lg: 42 }} verticalSpacing="xl">
          <Stack justify="center" gap="lg">
            <Badge color="brand" variant="light" radius="xl" w="fit-content" style={mutedBadgeStyle}>
              Credits 充值
            </Badge>
            <Stack gap="sm">
              <Title
                order={1}
                style={{
                  maxWidth: 680,
                  fontSize: 'clamp(2rem, 4vw, 3.25rem)',
                  lineHeight: 1.12,
                  letterSpacing: 0,
                  fontWeight: 600,
                  color: 'var(--app-text)',
                }}
              >
                选择适合当前产能的套餐
              </Title>
              <Text maw={680} size="md" c="var(--app-muted)" lh={1.75}>
                按实际使用购买，无需订阅。每笔 Credits 自到账起 30 天有效，适合按项目灵活充值。
              </Text>
            </Stack>
            <Group gap="sm">
              <Badge color="brand" variant="light">30 天有效</Badge>
              <Badge color="brand" variant="light">多充多送</Badge>
              <Badge color="brand" variant="light">微信 / 支付宝</Badge>
            </Group>
          </Stack>

          <Paper
            withBorder
            radius={8}
            p={{ base: 'lg', md: 'xl' }}
            style={elevatedSurfaceStyle}
          >
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon radius="xl" variant="light" color="brand">
                  <Sparkles width={18} height={18} />
                </ThemeIcon>
                <Title order={2} size="h5" fw={600}>
                  计费策略说明
                </Title>
              </Group>
              <List spacing="sm" c="var(--app-muted)">
                <List.Item>
                  <Text span fw={600} c="var(--app-text)">
                    标准视频
                  </Text>
                  ：单条视频按 15 分钟计算，100 万 Credits 可剪辑约 50 条视频
                </List.Item>
                <List.Item>
                  <Text span fw={600} c="var(--app-text)">
                    实际消耗
                  </Text>
                  ：根据视频长度、复杂度等因素，Credits 消耗会有细微差别
                </List.Item>
                <List.Item>
                  <Text span fw={600} c="var(--app-text)">
                    超长视频
                  </Text>
                  ：对于超长视频，计费会随着模型上下文增加而递增
                </List.Item>
              </List>
              <Divider color="var(--app-border)" />
              <Text size="sm" c="var(--app-muted)">
                建议根据 30 天内的预计用量选择套餐，到期未使用的 Credits 将自动清零。
              </Text>
            </Stack>
          </Paper>
        </SimpleGrid>
      </Paper>

      <Stack gap="lg">
        <Group justify="space-between" align="end">
          <Stack gap={4}>
            <Title order={2} size="h3" fw={600}>
              充值套餐
            </Title>
            <Text c="var(--app-muted)">
              从小额验证到稳定生产，按当前项目节奏选择即可。
            </Text>
          </Stack>
        </Group>

        {isLoading ? (
          <PricingSkeletonGrid />
        ) : packages.length === 0 ? (
          <Paper withBorder radius={8} p="xl" ta="center" style={elevatedSurfaceStyle}>
            <Text c="var(--app-muted)">暂无可用的充值套餐</Text>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 1, md: gridCols }} spacing="lg">
            {packages.map((pkg) => (
              <PricingPackageCard key={pkg.id} pkg={pkg} onSelect={handleSelectPackage} />
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <Stack gap="xl">
        <Stack align="center" ta="center" gap="sm">
          <Badge color="brand" variant="light" radius="xl" style={mutedBadgeStyle}>
            FAQ
          </Badge>
          <Title order={2} fw={600} size="h3">常见问题</Title>
          <Text c="var(--app-muted)" maw={620}>
            付款、计费和 Credits 使用方式都集中在这里，帮助用户更快理解购买决策。
          </Text>
        </Stack>

        <Accordion
          variant="separated"
          radius="lg"
          defaultValue="expiry"
          styles={{
            item: {
              background: 'var(--app-surface-elevated)',
              border: '1px solid var(--app-border)',
              borderRadius: 8,
              boxShadow: 'none',
            },
          }}
        >
          {faqItems.map((item) => (
            <Accordion.Item key={item.value} value={item.value}>
              <Accordion.Control>
                <Text fw={600}>{item.question}</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Text c="var(--app-muted)" lh={1.8}>
                  {item.answer}
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Stack>
      {selectedPackage && (
        <CreditPaymentModal
          package={selectedPackage}
          opened={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onPaid={handlePaymentSuccess}
        />
      )}
    </AppPageShell>
  )
}

function PricingPackageCard({
  pkg,
  onSelect,
}: {
  pkg: TokenPackage
  onSelect: (pkg: TokenPackage) => void
}) {
  return (
    <Card
      withBorder
      radius={8}
      padding="xl"
      h="100%"
      style={{
        background: pkg.is_featured
          ? 'linear-gradient(180deg, var(--app-brand-soft-bg-strong), transparent 92%), var(--app-surface-elevated)'
          : elevatedSurfaceStyle.background,
        borderColor: pkg.is_featured ? 'var(--app-brand-soft-border-strong)' : 'var(--app-border)',
        boxShadow: pkg.is_featured ? 'var(--app-shadow-strong)' : undefined,
      }}
    >
      <Stack h="100%" gap="lg">
        <Group justify="space-between" align="start">
          <Stack gap={6}>
            <Title order={3} fw={600} size="h4">{pkg.display_name}</Title>
            <Text size="sm" c="var(--app-muted)">
              {pkg.description || '适合日常使用的 Credits 套餐'}
            </Text>
          </Stack>
          {pkg.is_featured && (
            <Badge color="brand" variant="light" radius="xl">
              最推荐
            </Badge>
          )}
        </Group>

        <Stack gap={4}>
          <Text size="2.4rem" fw={700} lh={1}>
            ¥{Number(pkg.price).toFixed(2)}
          </Text>
          <Text size="xs" c="var(--app-muted)">
            人民币一次性购买，到账后 30 天有效
          </Text>
          <Text c="var(--app-muted)">
            可获得 {formatCredits(pkg.credit_amount ?? pkg.token_amount)} Credits
            {(pkg.bonus_credits ?? pkg.bonus_tokens) > 0 ? ` + ${formatCredits(pkg.bonus_credits ?? pkg.bonus_tokens)} 赠送` : ''}
          </Text>
        </Stack>

        <Paper
          radius="lg"
          p="md"
          style={contrastSurfaceStyle}
        >
          <Stack gap={4}>
            <Text size="xs" c="var(--app-muted)">
              总计 Credits
            </Text>
            <Text size="xl" fw={700} c="var(--app-text)">
              {formatCredits(pkg.total_credits_with_bonus ?? pkg.total_tokens_with_bonus)}
            </Text>
            <Text size="xs" c="var(--app-muted)">
              约可剪辑 {estimateVideos(pkg.total_credits_with_bonus ?? pkg.total_tokens_with_bonus)} 条视频
            </Text>
          </Stack>
        </Paper>

        <Stack gap="sm">
          <PackageFeature text="Credits 到账后 30 天有效" />
          <PackageFeature text="按实际使用计费" />
          <PackageFeature text="支持所有功能" />
        </Stack>

        <Button fullWidth radius="xl" mt="auto" onClick={() => onSelect(pkg)} styles={primaryButtonStyles}>
          充值 {formatCredits(pkg.total_credits_with_bonus ?? pkg.total_tokens_with_bonus)} Credits
        </Button>
      </Stack>
    </Card>
  )
}

function PackageFeature({ text }: { text: string }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon size={28} radius="xl" variant="light" color="brand">
        <CheckCircleIcon width={16} height={16} />
      </ThemeIcon>
      <Text c="var(--app-muted)">{text}</Text>
    </Group>
  )
}

function PricingSkeletonGrid() {
  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
      {Array.from({ length: 3 }).map((_, index) => (
        <Paper
          key={index}
          withBorder
          radius={8}
          p="xl"
          style={elevatedSurfaceStyle}
        >
          <Stack gap="lg">
            <Skeleton height={18} width="35%" radius="xl" />
            <Skeleton height={48} width="56%" radius="xl" />
            <Skeleton height={92} radius="lg" />
            <Skeleton height={14} radius="xl" />
            <Skeleton height={14} radius="xl" width="82%" />
            <Skeleton height={44} radius="xl" mt="md" />
          </Stack>
        </Paper>
      ))}
    </SimpleGrid>
  )
}
