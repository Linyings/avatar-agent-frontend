import React, { useState } from 'react'
import { Alert, Button, Group, Modal, Paper, Stack, Text, Textarea, ThemeIcon } from '@mantine/core'
import { NoSymbolIcon, CheckCircleIcon } from '@/shared/icons/tabler'
import { adminUserService } from '../services/adminUserService'
import type { AdminUserSummary, ApiError } from '../types/user'

interface StatusUpdateModalProps {
  user: AdminUserSummary
  onSuccess: () => void
  onClose: () => void
}

const StatusUpdateModal: React.FC<StatusUpdateModalProps> = ({ user, onSuccess, onClose }) => {
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const targetStatus = !user.is_active
  const action       = targetStatus ? '解封' : '封禁'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await adminUserService.updateUserStatus(user.id, { is_active: targetStatus, reason: reason.trim() || null })
      setSuccess(true)
      setTimeout(() => { onSuccess() }, 1500)
    } catch (err) {
      console.error('Failed to update user status:', err)
      setError((err as ApiError).message || '更新失败，请重试')
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
          <ThemeIcon size="lg" radius="xl" color={targetStatus ? 'green' : 'red'} variant="light">
            {targetStatus
              ? <CheckCircleIcon width={18} height={18} />
              : <NoSymbolIcon width={18} height={18} />
            }
          </ThemeIcon>
          <Text fw={600}>{action}用户</Text>
        </Group>
      }
    >
      <Stack gap="md">
        {success ? (
          <Stack align="center" py="xl" gap="xs">
            <Text size="2rem">✅</Text>
            <Text fw={700} size="lg">{action}成功！</Text>
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
                  <Text size="xs" fw={600} c={user.is_active ? 'green.3' : 'red.3'}>
                    当前状态：{user.is_active ? '正常' : '已封禁'}
                  </Text>
                </Stack>
              </Paper>

              <Alert color={targetStatus ? 'green' : 'red'} variant="light">
              {targetStatus
                ? '✓ 解封后，该用户将能够正常登录和使用系统'
                : '⚠️ 封禁后，该用户将无法登录和使用系统'
              }
              </Alert>

              <Textarea
                id="status-reason"
                label="操作原因（可选）"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder={`请输入${action}原因，如：违反规则、测试账号、用户申请等`}
                rows={3}
                disabled={loading}
              />

              {error && <Alert color="red" variant="light">{error}</Alert>}

              <Group justify="flex-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  取消
                </Button>
                <Button type="submit" loading={loading} disabled={loading} color={targetStatus ? 'green' : 'red'}>
                  {loading ? '处理中...' : `确认${action}`}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Modal>
  )
}

export default StatusUpdateModal
