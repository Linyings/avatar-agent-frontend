import React, { useState } from 'react'
import { Alert, Button, Group, Modal, Paper, Stack, Text, TextInput, Textarea, ThemeIcon } from '@mantine/core'
import { BanknotesIcon } from '@/shared/icons/tabler'
import { adminUserService } from '../services/adminUserService'
import type { AdminUserSummary, ApiError } from '../types/user'

interface TokenAdjustmentModalProps {
  user: AdminUserSummary
  onSuccess: () => void
  onClose: () => void
}

const TokenAdjustmentModal: React.FC<TokenAdjustmentModalProps> = ({
  user,
  onSuccess,
  onClose
}) => {
  const [amount, setAmount]   = useState('')
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const remainingCredits = user.remaining_credits ?? user.remaining_tokens ?? 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const amountNum = parseInt(amount)
    if (isNaN(amountNum)) { setError('请输入有效的数字'); return }
    if (amountNum === 0)   { setError('调整数量不能为0'); return }
    if (!reason.trim())    { setError('请输入调整原因'); return }

    if (amountNum < 0 && Math.abs(amountNum) > remainingCredits) {
      setError(`减少数量不能超过当前余额（${remainingCredits.toLocaleString()}）`)
      return
    }

    setLoading(true)
    try {
      await adminUserService.adjustUserTokens(user.id, { amount: amountNum, reason: reason.trim() })
      setSuccess(true)
      setTimeout(() => { onSuccess() }, 1500)
    } catch (err) {
      console.error('Failed to adjust credits:', err)
      const apiError = err as ApiError
      setError(apiError.message || '调整失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
      title={
        <Group gap="sm">
          <ThemeIcon size="lg" radius="xl" color="brand" variant="light">
            <BanknotesIcon width={18} height={18} />
          </ThemeIcon>
          <Text fw={600}>调整 Credits 额度</Text>
        </Group>
      }
    >
      <Stack gap="md">
        {success ? (
          <Stack align="center" py="xl" gap="xs">
            <Text size="2rem">✅</Text>
            <Text fw={700} size="lg">调整成功！</Text>
            <Text c="dimmed" size="sm">正在刷新数据...</Text>
          </Stack>
        ) : (
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <Paper p="md">
                <Stack gap={4}>
                  <Text size="sm" c="dimmed">用户</Text>
                  <Text fw={600}>{user.display_name || user.username}</Text>
                  <Text size="sm" c="dimmed">{user.email}</Text>
                  <Text size="sm">
                    当前余额：
                    <Text component="span" fw={700} c="brand.4" ml={4}>
                      {remainingCredits.toLocaleString()} Credits
                    </Text>
                  </Text>
                </Stack>
              </Paper>

              <TextInput
                id="token-amount"
                label="调整数量 *"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                placeholder="正数=增加，负数=减少"
                disabled={loading}
                required
              />
              <Text size="xs" c="dimmed" mt={-8}>
                示例：输入 1000 表示增加1000 Credits，输入 -500 表示减少500 Credits
              </Text>

              <Textarea
                id="token-reason"
                label="调整原因 *"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="请输入调整原因，如：补偿、充值、违规扣除等"
                rows={3}
                disabled={loading}
                required
              />

              {error && <Alert color="red" variant="light">{error}</Alert>}

              <Group justify="flex-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  取消
                </Button>
                <Button type="submit" loading={loading} disabled={loading}>
                  {loading ? '处理中...' : '确认调整'}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Modal>
  )
}

export default TokenAdjustmentModal
