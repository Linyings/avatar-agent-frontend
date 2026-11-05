import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Anchor, Box, Button, Center, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { authService } from '@/features/auth/services/authService'
import { useEmailCodeCooldown } from '@/features/auth/utils/emailCodeCooldown'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { countdown, startCooldown, clearCooldown } = useEmailCodeCooldown('reset_password', email)

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const sendCode = async () => {
    if (!isEmailValid) {
      setError('请输入有效的邮箱地址')
      return
    }
    setIsSending(true)
    setError('')
    setMessage('')
    startCooldown()
    try {
      await authService.forgotPassword({ email: email.trim() })
      setMessage('验证码已发送，请查看邮箱')
    } catch (err) {
      const authError = err as { message?: string }
      clearCooldown()
      setError(authError.message || '验证码发送失败')
    } finally {
      setIsSending(false)
    }
  }

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!isEmailValid) {
      setError('请输入有效的邮箱地址')
      return
    }
    if (password.length < 8) {
      setError('密码长度至少 8 位')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    setIsSubmitting(true)
    try {
      await authService.resetPassword({
        email: email.trim(),
        code: code.trim(),
        new_password: password,
        confirm_password: confirmPassword,
      })
      navigate('/login', { replace: true })
    } catch (err) {
      const authError = err as { message?: string }
      setError(authError.message || '密码重置失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Center mih="100vh" px="md">
      <Box w="100%" maw={420}>
        <Stack gap="lg">
          <Group justify="center">
            <LanguageSwitcher compact />
          </Group>
          <Title order={1} fz={30} ta="center">重置密码</Title>
          {message ? <Alert color="green" radius="md">{message}</Alert> : null}
          {error ? <Alert color="red" radius="md">{error}</Alert> : null}
          <Stack component="form" gap="sm" onSubmit={resetPassword}>
            <TextInput
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="default"
              loading={isSending}
              disabled={!isEmailValid || countdown > 0 || isSending}
              onClick={sendCode}
            >
              {countdown > 0 ? `${countdown}秒后` : '获取验证码'}
            </Button>
            <TextInput
              autoComplete="one-time-code"
              placeholder="邮箱验证码"
              value={code}
              onChange={(event) => setCode(event.currentTarget.value)}
            />
            <TextInput
              type="password"
              autoComplete="new-password"
              placeholder="新密码"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <TextInput
              type="password"
              autoComplete="new-password"
              placeholder="确认新密码"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            />
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              重置密码
            </Button>
          </Stack>
          <Text ta="center" size="sm" c="dimmed">
            想起密码了？
            <Anchor component={Link} to="/login" ml={4}>返回登录</Anchor>
          </Text>
        </Stack>
      </Box>
    </Center>
  )
}
