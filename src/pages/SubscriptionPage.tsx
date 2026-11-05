import { useCallback, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import { useTokenBalance, useTokenPackages } from '@/features/subscriptions/hooks'
import { CreditPaymentModal } from '@/features/subscriptions/components/CreditPaymentModal'
import type { CreditPaymentOrder, TokenPackage } from '@/features/subscriptions/types'

const credits = (pkg: TokenPackage) => pkg.total_credits_with_bonus ?? pkg.total_tokens_with_bonus

export default function SubscriptionPage() {
  const { balance, isLoading: balanceLoading, error: balanceError, refetch } = useTokenBalance()
  const { packages, isLoading, error, refetch: refetchPackages } = useTokenPackages()
  const [selected, setSelected] = useState<TokenPackage | null>(null)
  const [latestPurchaseExpiry, setLatestPurchaseExpiry] = useState<string | null>(null)
  const paid = useCallback(async (order: CreditPaymentOrder) => {
    setSelected(null)
    setLatestPurchaseExpiry(order.expires_at ?? null)
    await Promise.all([refetch(), refetchPackages()])
  }, [refetch, refetchPackages])
  const sortedPackages = [...packages].sort((left, right) => Number(Boolean(right.is_trial)) - Number(Boolean(left.is_trial)) || left.sort_order - right.sort_order)

  return <AppPageShell py={{ base: 24, md: 40 }} gap={28}>
    <Stack gap={4}><Title order={1}>Credits 商店</Title><Text c="dimmed">一次购买，按需使用</Text></Stack>
    {(balanceError || error) && <Alert color="red">{balanceError || error}</Alert>}
    <Paper withBorder p="xl" radius={8}>
      {balanceLoading ? <Loader size="sm" /> : <Group justify="space-between" align="end">
        <Stack gap={4}><Text c="dimmed">可用 Credits</Text><Text fw={800} size="2.5rem">{Number(balance?.remaining_credits ?? balance?.remaining_tokens ?? 0).toLocaleString()}</Text></Stack>
        {balance?.next_expiry_at && <Text size="sm" c="dimmed">最早一批将于 {new Date(balance.next_expiry_at).toLocaleString()} 到期</Text>}
      </Group>}
    </Paper>
    {latestPurchaseExpiry && <Alert color="green" data-testid="latest-purchase-expiry">
      本次购买的 Credits 将于 {new Date(latestPurchaseExpiry).toLocaleString()} 到期
    </Alert>}
    <Stack gap="md"><Title order={2}>选择套餐</Title>
      {isLoading ? <Loader /> : <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {sortedPackages.map((pkg) => {
          const unavailable = pkg.purchase_eligible === false || Boolean(pkg.is_trial && balance?.trial_claimed)
          return <Paper key={pkg.id} withBorder p="xl" radius={8}>
            <Stack h="100%"><Group justify="space-between"><Title order={3}>{pkg.display_name}</Title>{pkg.is_trial && <Badge color="green">每个账号限购一次</Badge>}</Group>
              <Text size="2rem" fw={800}>¥{Number(pkg.price).toFixed(2)}</Text>
              <Text fw={600}>{credits(pkg).toLocaleString()} Credits</Text>
              {pkg.description && <Text size="sm" c="dimmed">{pkg.description}</Text>}
              <Text c="dimmed">购买后 30 天有效</Text>
              <Button mt="auto" disabled={unavailable} onClick={() => setSelected(pkg)}>{unavailable && pkg.is_trial ? '已购买' : '立即购买'}</Button>
            </Stack>
          </Paper>
        })}
      </SimpleGrid>}
    </Stack>
    {selected && <CreditPaymentModal package={selected} opened={Boolean(selected)} onClose={() => setSelected(null)} onPaid={paid} />}
  </AppPageShell>
}
