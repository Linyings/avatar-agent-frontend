import React, { useState } from 'react'
import { Alert, Button, Group, List, Modal, Paper, Stack, Text, Textarea, ThemeIcon } from '@mantine/core'
import { ShieldCheckIcon } from '@/shared/icons/tabler'
import { adminUserService } from '../services/adminUserService'
import type { AdminUserSummary, ApiError } from '../types/user'

interface RoleUpdateModalProps {
  user: AdminUserSummary
  onSuccess: () => void
  onClose: () => void
}

const RoleUpdateModal: React.FC<RoleUpdateModalProps> = ({ user, onSuccess, onClose }) => {
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const targetRole = !user.is_admin
  const action     = targetRole ? '设为管理员' : '取消管理员'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await adminUserService.updateUserRole(user.id, { is_admin: targetRole, reason: reason.trim() || null })
      setSuccess(true)
      setTimeout(() => { onSuccess() }, 1500)
    } catch (err) {
      console.error('Failed to update user role:', err)
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
          <ThemeIcon size="lg" radius="xl" color="violet" variant="light">
            <ShieldCheckIcon width={18} height={18} />
          </ThemeIcon>
          <Text fw={600}>更新用户权限</Text>
        </Group>
      }
    >
      <Stack gap="md">
        {success ? (
          <Stack align="center" py="xl" gap="xs">
            <Text size="2rem">✅</Text>
            <Text fw={700} size="lg">权限更新成功！</Text>
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
                  <Text size="xs" fw={600} c={user.is_admin ? 'violet.3' : 'dimmed'}>
                    当前：{user.is_admin ? '管理员' : '普通用户'}
                  </Text>
                </Stack>
              </Paper>

              <Alert color="violet" variant="light">
              {targetRole ? (
                <Stack gap="xs">
                  <Text size="sm">设为管理员后，该用户将拥有：</Text>
                  <List size="xs" spacing={4}>
                    <List.Item>访问管理后台的权限</List.Item>
                    <List.Item>管理其他用户的权限</List.Item>
                    <List.Item>查看系统数据和统计</List.Item>
                    <List.Item>修改系统配置的权限</List.Item>
                  </List>
                </Stack>
              ) : (
                <Text size="sm">取消管理员后，该用户将失去所有管理权限，成为普通用户。</Text>
              )}
              </Alert>

              {!targetRole && (
                <Alert color="yellow" variant="light">
                  ⚠️ 注意：不能取消自己的管理员权限，系统至少需要保留一个管理员账户
                </Alert>
              )}

              <Textarea
                id="role-reason"
                label="操作原因（可选）"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder={`请输入${action}的原因`}
                rows={3}
                disabled={loading}
              />

              {error && <Alert color="red" variant="light">{error}</Alert>}

              <Group justify="flex-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  取消
                </Button>
                <Button type="submit" loading={loading} disabled={loading} color="violet">
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

export default RoleUpdateModal
