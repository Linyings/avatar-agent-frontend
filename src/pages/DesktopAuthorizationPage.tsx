import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Anchor, Box, Button, Center, Loader, Stack, Text, Title } from '@mantine/core'
import { useAuth } from '@/features/auth'
import { authService } from '@/features/auth/services/authService'
import { useI18n } from '@/shared/i18n/I18nProvider'

type CallbackFollower = (callbackUrl: string) => void

interface DesktopAuthorizationPageProps {
  onFollowCallback?: CallbackFollower
}

const hasExactlyOneValue = (params: URLSearchParams, key: string): boolean => (
  params.getAll(key).length === 1 && Boolean(params.get(key)?.trim())
)

export const followDesktopAuthorizationCallback = (
  callbackUrl: string,
  follow: CallbackFollower = (url) => window.location.assign(url),
): void => {
  let parsed: URL
  try {
    parsed = new URL(callbackUrl)
  } catch {
    throw new Error('Invalid desktop authorization callback')
  }

  if (
    parsed.protocol !== 'narratoai:'
    || parsed.hostname !== 'auth'
    || parsed.pathname !== '/callback'
    || !hasExactlyOneValue(parsed.searchParams, 'request_id')
    || !hasExactlyOneValue(parsed.searchParams, 'code')
    || !hasExactlyOneValue(parsed.searchParams, 'state')
  ) {
    throw new Error('Invalid desktop authorization callback')
  }

  follow(callbackUrl)
}

export default function DesktopAuthorizationPage({ onFollowCallback }: DesktopAuthorizationPageProps) {
  const [params] = useSearchParams()
  const { isAuthenticated, isLoading } = useAuth()
  const { t } = useI18n()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const attemptedRequestRef = useRef<string | null>(null)

  const requestId = params.get('request_id')?.trim() || ''
  const state = params.get('state')?.trim() || ''
  const authorizationKey = `${requestId}:${state}`
  const loginState = {
    from: {
      pathname: '/desktop/authorize',
      search: `?${params.toString()}`,
    },
  }

  const authorize = useCallback(async () => {
    if (!requestId || !state) {
      setError(t('\u684c\u9762\u6388\u6743\u8bf7\u6c42\u65e0\u6548'))
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const response = await authService.authorizeDesktopRequest(requestId, state)
      followDesktopAuthorizationCallback(response.callback_url, onFollowCallback)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('\u684c\u9762\u6388\u6743\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002'))
    } finally {
      setIsSubmitting(false)
    }
  }, [onFollowCallback, requestId, state, t])

  useEffect(() => {
    if (isLoading || !isAuthenticated || !requestId || !state) return
    if (attemptedRequestRef.current === authorizationKey) return
    attemptedRequestRef.current = authorizationKey
    void authorize()
  }, [authorizationKey, authorize, isAuthenticated, isLoading, requestId, state])

  const retry = () => {
    attemptedRequestRef.current = null
    void authorize()
  }

  return (
    <Center mih="100vh" px="md">
      <Box w="100%" maw={440}>
        <Stack gap="lg" align="center">
          <Title order={1} fz={28}>{t('\u7ee7\u7eed 数字人口播 \u684c\u9762\u7aef')}</Title>

          {!requestId || !state ? (
            <Alert color="red" radius="md" w="100%">
              {t('\u684c\u9762\u6388\u6743\u8bf7\u6c42\u65e0\u6548\u6216\u5df2\u8fc7\u671f\u3002')}
            </Alert>
          ) : isLoading ? (
            <Loader />
          ) : !isAuthenticated ? (
            <Stack gap="sm" w="100%">
              <Text c="dimmed" ta="center">{t('\u8bf7\u767b\u5f55\u4ee5\u7ee7\u7eed\u4f7f\u7528\u684c\u9762\u7aef\u3002')}</Text>
              <Button component={Link} to="/login" state={loginState} fullWidth>
                {t('\u767b\u5f55')}
              </Button>
            </Stack>
          ) : (
            <Stack gap="sm" w="100%">
              <Text c="dimmed" ta="center">{t('\u6388\u6743\u6b64\u6d4f\u89c8\u5668\u4f1a\u8bdd\u5e76\u8fd4\u56de 数字人口播 \u684c\u9762\u7aef\u3002')}</Text>
              {error && <Alert color="red" radius="md">{error}</Alert>}
              {error ? (
                <Button onClick={retry} loading={isSubmitting} fullWidth>
                  {t('\u91cd\u8bd5')}
                </Button>
              ) : (
                <Center py="sm"><Loader /></Center>
              )}
            </Stack>
          )}

          <Anchor component={Link} to="/" size="sm">{t('\u8fd4\u56de 数字人口播')}</Anchor>
        </Stack>
      </Box>
    </Center>
  )
}
