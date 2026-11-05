import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { BellIcon, CalendarIcon, PencilIcon, Send, TrashIcon } from '@/shared/icons/tabler'
import { NotificationType } from '@/shared/types/system'
import type {
  AdminAnnouncementSummary,
  AdminNotificationBroadcastResponse,
} from '@/features/admin/types/notification'
import { adminNotificationService } from '@/features/admin/services/adminNotificationService'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import PageHeader from '@/shared/components/ui/PageHeader'
import { useToast } from '@/shared/contexts/ToastContext'

interface FormState {
  title: string
  message: string
  expiresAt: string
}

const defaultFormState: FormState = {
  title: '',
  message: '',
  expiresAt: '',
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '未设置'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '时间格式无效'
  }

  return parsed.toLocaleString('zh-CN')
}

function describeExpiry(value?: string | null) {
  if (!value) {
    return '长期有效'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '时间格式无效'
  }

  if (parsed.getTime() < Date.now()) {
    return `已于 ${parsed.toLocaleString('zh-CN')} 过期`
  }

  return `将于 ${parsed.toLocaleString('zh-CN')} 过期`
}

const AnnouncementsPage: React.FC = () => {
  const { showError, showSuccess } = useToast()
  const [formState, setFormState] = useState<FormState>(defaultFormState)
  const [announcements, setAnnouncements] = useState<AdminAnnouncementSummary[]>([])
  const [editingAnnouncement, setEditingAnnouncement] = useState<AdminAnnouncementSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncementSummary | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null)
  const [result, setResult] = useState<AdminNotificationBroadcastResponse | null>(null)

  const loadAnnouncements = async (silenceLoading = false) => {
    if (!silenceLoading) {
      setIsLoadingAnnouncements(true)
    }

    try {
      const nextAnnouncements = await adminNotificationService.listAnnouncements()
      setAnnouncements(nextAnnouncements)
      setAnnouncementsError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载公告列表失败'
      setAnnouncementsError(message)
    } finally {
      if (!silenceLoading) {
        setIsLoadingAnnouncements(false)
      }
    }
  }

  useEffect(() => {
    void loadAnnouncements()
  }, [])

  const expiresAtPreview = useMemo(() => {
    if (!formState.expiresAt) {
      return '未设置过期时间'
    }

    const parsed = new Date(formState.expiresAt)
    if (Number.isNaN(parsed.getTime())) {
      return '时间格式无效'
    }

    return parsed.toLocaleString('zh-CN')
  }, [formState.expiresAt])

  const resetForm = () => {
    setEditingAnnouncement(null)
    setFormState(defaultFormState)
  }

  const startEditing = (announcement: AdminAnnouncementSummary) => {
    setEditingAnnouncement(announcement)
    setResult(null)
    setFormState({
      title: announcement.title,
      message: announcement.message,
      expiresAt: toDateTimeLocalValue(announcement.expires_at),
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const title = formState.title.trim()
    const message = formState.message.trim()
    if (!title || !message) {
      showError('内容不完整', '请填写公告标题和正文')
      return
    }

    let expiresAt: string | null = null
    if (formState.expiresAt) {
      const parsed = new Date(formState.expiresAt)
      if (Number.isNaN(parsed.getTime())) {
        showError('时间格式错误', '请输入有效的过期时间')
        return
      }
      expiresAt = parsed.toISOString()
    }

    setIsSubmitting(true)

    try {
      if (editingAnnouncement) {
        const response = await adminNotificationService.updateAnnouncement(editingAnnouncement.id, {
          title,
          message,
          expires_at: expiresAt,
        })

        showSuccess('公告已更新', `已同步更新当前保留的 ${response.target_user_count} 条公告通知`)
        resetForm()
        await loadAnnouncements(true)
      } else {
        const response = await adminNotificationService.broadcastNotification({
          title,
          message,
          type: NotificationType.SYSTEM,
          expires_at: expiresAt,
        })

        setResult(response)
        setFormState(defaultFormState)
        showSuccess('公告已发布', `已向 ${response.target_user_count} 位用户发送通知`)
        await loadAnnouncements(true)
      }
    } catch (error) {
      showError(
        editingAnnouncement ? '保存失败' : '发布失败',
        error instanceof Error ? error.message : undefined,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteAnnouncement = async () => {
    if (!deleteTarget) {
      return
    }

    setPendingDeleteId(deleteTarget.id)
    try {
      const response = await adminNotificationService.deleteAnnouncement(deleteTarget.id)
      if (editingAnnouncement?.id === deleteTarget.id) {
        resetForm()
      }
      showSuccess('公告已删除', `已删除当前保留的 ${response.deleted_count} 条公告通知`)
      setDeleteTarget(null)
      await loadAnnouncements(true)
    } catch (error) {
      showError('删除失败', error instanceof Error ? error.message : undefined)
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <AppPageShell size="lg">
      <PageHeader
        title="公告发布"
        subtitle="向当前所有激活用户广播系统公告，用户端通知中心会自动轮询并展示新消息。"
      />

      <Stack gap="lg">
        <Alert color="blue" variant="light" title="发送范围固定">
          v1 版本会把公告发送给当前所有激活用户，包含管理员账号本身；未来新注册用户不会补收这条历史公告。
        </Alert>

        {editingAnnouncement ? (
          <Alert color="yellow" variant="light" title="正在编辑已发布公告">
            保存后会同步更新当前仍保留这条公告的用户通知副本；如需返回发布新公告，请点击“取消编辑”。
          </Alert>
        ) : null}

        <Paper p="xl" radius="xl" withBorder>
          <Stack component="form" gap="lg" onSubmit={handleSubmit}>
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Text fw={700} size="lg">
                  {editingAnnouncement ? '编辑已发布公告' : '发布全站公告'}
                </Text>
                <Text size="sm" c="dimmed">
                  {editingAnnouncement
                    ? '会覆盖当前仍保留这条公告的用户通知内容。'
                    : '公告会作为站内通知写入用户通知中心。'}
                </Text>
              </Stack>
              <Badge color="blue" variant="light" leftSection={<BellIcon width={14} height={14} />}>
                固定类型：系统通知
              </Badge>
            </Group>

            <TextInput
              label="公告标题"
              placeholder="例如：系统维护通知"
              value={formState.title}
              onChange={(event) => {
                const value = event.currentTarget.value
                setFormState((prev) => ({ ...prev, title: value }))
              }}
            />

            <Textarea
              label="公告正文"
              placeholder="请输入要发送给用户的公告内容"
              value={formState.message}
              onChange={(event) => {
                const value = event.currentTarget.value
                setFormState((prev) => ({ ...prev, message: value }))
              }}
              rows={6}
            />

            <TextInput
              label="过期时间（可选）"
              type="datetime-local"
              placeholder="不填写则长期有效"
              leftSection={<CalendarIcon width={16} height={16} />}
              value={formState.expiresAt}
              onChange={(event) => {
                const value = event.currentTarget.value
                setFormState((prev) => ({ ...prev, expiresAt: value }))
              }}
            />

            <Text size="sm" c="dimmed">
              当前设置：{expiresAtPreview}
            </Text>

            <Group justify="flex-end">
              {editingAnnouncement ? (
                <Button type="button" variant="default" onClick={resetForm} disabled={isSubmitting}>
                  取消编辑
                </Button>
              ) : null}
              <Button
                type="submit"
                loading={isSubmitting}
                leftSection={editingAnnouncement ? <PencilIcon width={16} height={16} /> : <Send width={16} height={16} />}
              >
                {editingAnnouncement ? '保存修改' : '发布公告'}
              </Button>
            </Group>
          </Stack>
        </Paper>

        {result ? (
          <Alert color="green" variant="light" title="发布完成">
            <Stack gap={4}>
              <Text size="sm">已创建 {result.created_count} 条通知。</Text>
              <Text size="sm">触达用户数：{result.target_user_count}</Text>
              <Text size="sm">发布时间：{new Date(result.published_at).toLocaleString('zh-CN')}</Text>
            </Stack>
          </Alert>
        ) : null}

        <Paper p="xl" radius="xl" withBorder>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Text fw={700} size="lg">
                  已发布公告
                </Text>
                <Text size="sm" c="dimmed">
                  已发布的公告可以继续编辑或删除；修改会同步到当前仍保留这条通知的用户副本。
                </Text>
              </Stack>
              <Badge variant="light" color="gray">
                {announcements.length} 条
              </Badge>
            </Group>

            {announcementsError ? (
              <Alert color="red" variant="light" title="公告列表加载失败">
                {announcementsError}
              </Alert>
            ) : null}

            {isLoadingAnnouncements ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  正在加载已发布公告...
                </Text>
              </Group>
            ) : announcements.length === 0 ? (
              <Paper p="lg" radius="lg" withBorder>
                <Text size="sm" c="dimmed">
                  暂无已发布公告，发布后的公告会出现在这里，方便继续编辑和删除。
                </Text>
              </Paper>
            ) : (
              <Stack gap="md">
                {announcements.map((announcement) => {
                  const isEditing = editingAnnouncement?.id === announcement.id
                  const isExpired = Boolean(announcement.expires_at && new Date(announcement.expires_at).getTime() < Date.now())

                  return (
                    <Paper key={announcement.id} p="lg" radius="lg" withBorder>
                      <Stack gap="sm">
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={6} style={{ flex: 1 }}>
                            <Group gap="xs" wrap="wrap">
                              <Text fw={600}>{announcement.title}</Text>
                              <Badge color={isExpired ? 'red' : announcement.expires_at ? 'yellow' : 'green'} variant="light">
                                {isExpired ? '已过期' : announcement.expires_at ? '定时过期' : '长期有效'}
                              </Badge>
                              {isEditing ? (
                                <Badge color="blue" variant="light">
                                  编辑中
                                </Badge>
                              ) : null}
                            </Group>
                            <Text size="sm" c="dimmed">
                              发布时间：{formatDateTime(announcement.published_at)}
                            </Text>
                            <Text size="sm" c="dimmed">
                              最近更新：{formatDateTime(announcement.updated_at)}
                            </Text>
                            <Text size="sm" c="dimmed">
                              当前通知数：{announcement.target_user_count} · 过期设置：{describeExpiry(announcement.expires_at)}
                            </Text>
                          </Stack>

                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant={isEditing ? 'filled' : 'light'}
                              leftSection={<PencilIcon width={14} height={14} />}
                              onClick={() => startEditing(announcement)}
                            >
                              编辑
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              leftSection={<TrashIcon width={14} height={14} />}
                              loading={pendingDeleteId === announcement.id}
                              onClick={() => setDeleteTarget(announcement)}
                            >
                              删除
                            </Button>
                          </Group>
                        </Group>

                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                          {announcement.message}
                        </Text>
                      </Stack>
                    </Paper>
                  )
                })}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Stack>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteAnnouncement}
        title="删除已发布公告"
        message={deleteTarget ? `确定删除公告“${deleteTarget.title}”吗？删除后，当前仍保留这条公告的用户通知副本会一并移除。` : ''}
        confirmText="确认删除"
        cancelText="取消"
        type="danger"
      />
    </AppPageShell>
  )
}

export default AnnouncementsPage
