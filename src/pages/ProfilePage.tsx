import type { ComponentProps, ComponentType } from 'react'
import { useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Grid,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useAuth } from '@/features/auth'
import { authService } from '@/features/auth/services/authService'
import type {
  PasswordUpdateRequest,
  UserProfileUpdateRequest,
  UserSettingsUpdate,
} from '@/features/auth/types/auth'
import {
  BellIcon,
  Cog6ToothIcon,
  LockClosedIcon,
  UserIcon,
} from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import { formatRelativeTime } from '@/shared/utils/dateHelpers'

type FeedbackMessage = { type: 'success' | 'error'; text: string } | null

const panelStyle = {
  background: 'var(--app-dashboard-panel-bg)',
  border: '1px solid var(--app-border)',
  boxShadow: 'var(--app-shadow)',
  color: 'var(--app-text)',
} as const

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: ComponentType<ComponentProps<'svg'>>
  title: string
}) {
  return (
    <Group gap="sm" pb="md" style={{ borderBottom: '1px solid var(--app-border)' }}>
      <ThemeIcon color="brand" variant="light" radius="md" size="lg">
        <Icon width={18} height={18} />
      </ThemeIcon>
      <Text fw={600} size="lg">
        {title}
      </Text>
    </Group>
  )
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('dark')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<FeedbackMessage>(null)

  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')

  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [autoSave, setAutoSave] = useState(true)
  const [emailNotifications, setEmailNotifications] = useState(true)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        const userSettings = await authService.getUserSettings()

        if (userSettings.preferences.auto_save !== undefined) {
          setAutoSave(userSettings.preferences.auto_save)
        }
        if (userSettings.notification_settings.email_notifications !== undefined) {
          setEmailNotifications(userSettings.notification_settings.email_notifications)
        }
      } catch (error) {
        console.error('加载用户设置失败:', error)
        setMessage({ type: 'error', text: '加载用户设置失败' })
      }
    }

    if (user) {
      loadUserSettings()
    }
  }, [setColorScheme, user])

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '')
      setAvatarUrl(user.avatar_url || '')
    }
  }, [user])

  useEffect(() => {
    setTheme(computedColorScheme)
  }, [computedColorScheme])

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true)
      setMessage(null)

      const updateData: UserProfileUpdateRequest = {
        display_name: displayName || null,
        avatar_url: avatarUrl || null,
      }

      const updatedUser = await authService.updateProfile(updateData)
      updateUser(updatedUser)

      setMessage({ type: 'success', text: '个人资料已更新' })
    } catch (error) {
      console.error('更新失败:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '更新个人资料失败' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true)
      setMessage(null)

      const settingsData: UserSettingsUpdate = {
        preferences: {
          theme,
          auto_save: autoSave,
        },
        notification_settings: {
          email_notifications: emailNotifications,
        },
      }

      await authService.updateUserSettings(settingsData)

      setMessage({ type: 'success', text: '设置已更新' })
    } catch (error) {
      console.error('更新设置失败:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '更新设置失败' })
    } finally {
      setIsSaving(false)
    }
  }

  const resetPasswordForm = () => {
    setShowPasswordModal(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const handleClosePasswordModal = () => {
    if (isSaving) return
    resetPasswordForm()
  }

  const handleUpdatePassword = async () => {
    try {
      setMessage(null)

      if (!currentPassword || !newPassword || !confirmPassword) {
        setMessage({ type: 'error', text: '请填写所有密码字段' })
        return
      }

      if (newPassword !== confirmPassword) {
        setMessage({ type: 'error', text: '两次输入的新密码不一致' })
        return
      }

      if (newPassword.length < 8) {
        setMessage({ type: 'error', text: '新密码长度不能少于 8 个字符' })
        return
      }

      setIsSaving(true)

      const passwordData: PasswordUpdateRequest = {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }

      await authService.updatePassword(passwordData)

      setMessage({ type: 'success', text: '密码已更新' })
      resetPasswordForm()
    } catch (error) {
      console.error('修改密码失败:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '修改密码失败' })
    } finally {
      setIsSaving(false)
    }
  }

  if (!user) {
    return (
      <Center mih="100vh">
        <Text c="dimmed">加载中...</Text>
      </Center>
    )
  }

  const userDisplayName = user.display_name || user.username
  const userInitial = userDisplayName.charAt(0).toUpperCase()

  return (
    <AppPageShell size="xl" py={{ base: 24, md: 40 }}>
        <Stack gap={4}>
          <Title order={1}>个人资料</Title>
          <Text c="dimmed">管理您的账户设置和个人信息</Text>
        </Stack>

        {message && (
          <Alert color={message.type === 'success' ? 'green' : 'red'} variant="light">
            {message.text}
          </Alert>
        )}

        <Grid data-testid="profile-content-grid" gap={{ base: 'lg', xl: 'xl' }} align="flex-start">
          <Grid.Col data-testid="profile-primary-column" span={{ base: 12, lg: 8 }}>
            <Stack gap="xl">
              <Paper component="section" p={{ base: 'md', md: 'xl' }} radius={8} style={panelStyle}>
                <Stack gap="lg">
                  <SectionHeader icon={UserIcon} title="个人资料" />

                  <Group align="flex-start" gap="lg" wrap="wrap">
                    <Avatar src={avatarUrl || undefined} alt={userDisplayName} size={84} radius="md">
                      {userInitial}
                    </Avatar>

                    <TextInput
                      label="头像 URL"
                      description="输入头像图片的 URL 地址"
                      placeholder="https://example.com/avatar.jpg"
                      value={avatarUrl}
                      onChange={(event) => setAvatarUrl(event.currentTarget.value)}
                      style={{ flex: '1 1 320px', minWidth: 0 }}
                    />
                  </Group>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    <TextInput
                      label="昵称"
                      placeholder="输入您的昵称"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.currentTarget.value)}
                    />
                    <TextInput label="邮箱" value={user.email} disabled />
                    <TextInput label="用户名" value={user.username} disabled />
                    <TextInput label="加入时间" value={formatRelativeTime(user.created_at)} disabled />
                  </SimpleGrid>

                  <Group justify="flex-end" pt="md" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <Button onClick={handleSaveProfile} loading={isSaving} radius="md">
                      保存资料
                    </Button>
                  </Group>
                </Stack>
              </Paper>

              <Paper component="section" p={{ base: 'md', md: 'xl' }} radius={8} style={panelStyle}>
                <Stack gap="lg">
                  <SectionHeader icon={BellIcon} title="通知设置" />

                  <Group justify="space-between" align="flex-start" gap="lg" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text fw={500}>邮件通知</Text>
                      <Text size="sm" c="dimmed">
                        接收有关重要更新和更改的电子邮件通知
                      </Text>
                    </Stack>

                    <Switch
                      checked={emailNotifications}
                      onChange={(event) => setEmailNotifications(event.currentTarget.checked)}
                    />
                  </Group>

                  <Group justify="flex-end" pt="md" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <Button onClick={handleSaveSettings} loading={isSaving} radius="md">
                      保存设置
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>

          <Grid.Col data-testid="profile-side-column" span={{ base: 12, lg: 4 }}>
            <Stack gap="xl">
              <Paper component="section" p={{ base: 'md', md: 'xl' }} radius={8} style={panelStyle}>
                <Stack gap="lg">
                  <SectionHeader icon={Cog6ToothIcon} title="账户信息" />

                  <SimpleGrid cols={{ base: 1, sm: 3, lg: 1 }} spacing="lg">
                    <Stack gap={6}>
                      <Text size="sm" c="dimmed">
                        账户状态
                      </Text>
                      <Badge color={user.is_active ? 'green' : 'red'} radius="sm" variant="light" w="fit-content">
                        {user.is_active ? '活跃' : '未激活'}
                      </Badge>
                    </Stack>

                    <Stack gap={6}>
                      <Text size="sm" c="dimmed">
                        邮箱验证
                      </Text>
                      <Badge color={user.is_verified ? 'brand' : 'gray'} radius="sm" variant="light" w="fit-content">
                        {user.is_verified ? '已验证' : '未验证'}
                      </Badge>
                    </Stack>

                    <Stack gap={6}>
                      <Text size="sm" c="dimmed">
                        用户角色
                      </Text>
                      <Text>{user.is_admin ? '管理员' : '普通用户'}</Text>
                    </Stack>
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Paper component="section" p={{ base: 'md', md: 'xl' }} radius={8} style={panelStyle}>
                <Stack gap="lg">
                  <SectionHeader icon={Cog6ToothIcon} title="偏好设置" />

                  <Group justify="space-between" align="flex-start" gap="lg" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text fw={500}>主题</Text>
                      <Text size="sm" c="dimmed">
                        选择您喜欢的界面主题
                      </Text>
                    </Stack>

                    <Select
                      data={[
                        { value: 'light', label: '浅色' },
                        { value: 'dark', label: '深色' },
                      ]}
                      value={theme}
                      onChange={(value) => {
                        if (value) {
                          const nextTheme = value as 'light' | 'dark'
                          setTheme(nextTheme)
                          setColorScheme(nextTheme)
                        }
                      }}
                      allowDeselect={false}
                      w={140}
                    />
                  </Group>

                  <Group justify="space-between" align="flex-start" gap="lg" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text fw={500}>自动保存</Text>
                      <Text size="sm" c="dimmed">
                        在您进行更改时自动保存您的工作
                      </Text>
                    </Stack>

                    <Switch checked={autoSave} onChange={(event) => setAutoSave(event.currentTarget.checked)} />
                  </Group>
                </Stack>
              </Paper>

              <Paper component="section" p={{ base: 'md', md: 'xl' }} radius={8} style={panelStyle}>
                <Stack gap="lg">
                  <SectionHeader icon={LockClosedIcon} title="安全设置" />

                  <Group justify="space-between" align="center" gap="lg" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text fw={500}>修改密码</Text>
                      <Text size="sm" c="dimmed">
                        更改您的账户密码
                      </Text>
                    </Stack>

                    <Button onClick={() => setShowPasswordModal(true)} variant="default" radius="md" size="sm">
                      修改
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      <Modal
        opened={showPasswordModal}
        onClose={handleClosePasswordModal}
        title="修改密码"
        size="md"
        centered
        closeOnClickOutside={!isSaving}
        closeOnEscape={!isSaving}
        withCloseButton={!isSaving}
      >
        <Stack gap="md">
          <PasswordInput
            label="当前密码"
            placeholder="输入当前密码"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
          />
          <PasswordInput
            label="新密码"
            placeholder="输入新密码（至少 8 个字符）"
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
          />
          <PasswordInput
            label="确认新密码"
            placeholder="再次输入新密码"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          />

          <Group grow mt="sm">
            <Button onClick={handleClosePasswordModal} variant="default" radius="md" disabled={isSaving}>
              取消
            </Button>
            <Button onClick={handleUpdatePassword} loading={isSaving} radius="md">
              更新密码
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppPageShell>
  )
}
