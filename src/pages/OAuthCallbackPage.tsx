import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Anchor, Box, Button, Center, Loader, Stack, Text, Title } from '@mantine/core'
import { useAuth } from '@/features/auth'
import { authService } from '@/features/auth/services/authService'
import type { UserProfile } from '@/features/auth'
import { normalizePostLoginDestination } from './LoginPage'

const oauthTicketExchanges = new Map<string, Promise<{ user: UserProfile; redirectPath: string }>>()

const completeOAuthTicket = (ticket: string): Promise<{ user: UserProfile; redirectPath: string }> => {
  const existing = oauthTicketExchanges.get(ticket)
  if (existing) {
    return existing
  }

  const exchange = (async () => {
    const response = await authService.exchangeOAuthTicket(ticket)
    const user = await authService.getCurrentUser()
    return { user, redirectPath: response.redirect_path || '/' }
  })()

  oauthTicketExchanges.set(ticket, exchange)
  exchange.finally(() => {
    window.setTimeout(() => {
      oauthTicketExchanges.delete(ticket)
    }, 30_000)
  })
  return exchange
}

export default function OAuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { updateUser } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    const ticket = params.get('ticket')
    const providerError = params.get('error')
    if (providerError) {
      setError('第三方登录失败，请重试')
      return
    }
    if (!ticket) {
      setError('登录票据缺失，请重新登录')
      return
    }

    let cancelled = false
    const exchange = async () => {
      try {
        const { user, redirectPath } = await completeOAuthTicket(ticket)
        if (cancelled) return
        updateUser(user)
        navigate(normalizePostLoginDestination(redirectPath), { replace: true })
      } catch {
        if (!cancelled) {
          setError('第三方登录验证失败，请重新登录')
        }
      }
    }

    void exchange()
    return () => {
      cancelled = true
    }
  }, [navigate, params, updateUser])

  return (
    <Center mih="100vh" px="md">
      <Box w="100%" maw={420}>
        <Stack gap="lg" align="center">
          {error ? (
            <>
              <Title order={1} fz={28}>登录失败</Title>
              <Alert color="red" radius="md" w="100%">{error}</Alert>
              <Button component={Link} to="/login" fullWidth>
                返回登录
              </Button>
              <Anchor component={Link} to="/" size="sm">
                回到首页
              </Anchor>
            </>
          ) : (
            <>
              <Loader />
              <Title order={1} fz={28}>正在完成登录</Title>
              <Text c="dimmed" ta="center">请稍候，正在验证第三方账户。</Text>
            </>
          )}
        </Stack>
      </Box>
    </Center>
  )
}
