import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
  useComputedColorScheme
} from '@mantine/core'
import BrandLockup from '@/shared/components/brand/BrandLockup'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'
import ThemeToggle from '@/shared/components/ui/ThemeToggle'
import { BrandGithub, BrandGoogle, HomeIcon } from '@/shared/icons/tabler'
import { useAuth } from '@/features/auth'
import type { UserLoginRequest, AuthError } from '@/features/auth'
import { getOAuthStartUrl } from '@/features/auth/services/authService'
import { fadeInUp } from '@/shared/utils/animations'
import { getAuthErrorMessage } from '@/features/auth/utils/errorMessages'
import { getPostLoginDestination } from '@/features/auth/utils/postLoginDestination'
export { getPostLoginDestination, normalizePostLoginDestination } from '@/features/auth/utils/postLoginDestination'

const authPalette = {
  light: {
    pageBg: '#f7f7f8',
    rightBg: '#f7f7f8',
    text: '#17171a',
    heading: '#111113',
    muted: '#73737d',
    mutedStrong: '#62626c',
    divider: '#e5e5e8',
    inputBg: '#ffffff',
    inputBorder: '#dfe1e6',
    primaryBg: '#1b1b1f',
    primaryText: '#ffffff',
    secondaryBg: '#ffffff',
    brandText: 'rgb(23 23 26 / 66%)',
    brandMuted: 'rgb(23 23 26 / 42%)',
    brandLine: 'rgb(23 23 26 / 22%)',
    mark: '#161619',
    panel:
      'radial-gradient(circle at 8% 18%, rgb(255 211 185 / 82%), transparent 36%), radial-gradient(circle at 68% 16%, rgb(190 184 207 / 78%), transparent 34%), radial-gradient(circle at 64% 76%, rgb(190 185 226 / 86%), transparent 40%), linear-gradient(145deg, #f3d0bd 0%, #c5bdd4 48%, #c2bee7 100%)',
    panelSheen:
      'linear-gradient(120deg, rgb(255 255 255 / 28%), transparent 30%, rgb(255 255 255 / 12%) 70%, transparent)',
  },
  dark: {
    pageBg: '#050608',
    rightBg: '#07080b',
    text: '#f7f8fb',
    heading: '#ffffff',
    muted: 'rgb(255 255 255 / 58%)',
    mutedStrong: 'rgb(255 255 255 / 72%)',
    divider: 'rgb(255 255 255 / 12%)',
    inputBg: 'rgb(255 255 255 / 6%)',
    inputBorder: 'rgb(255 255 255 / 14%)',
    primaryBg: '#ffffff',
    primaryText: '#090a0d',
    secondaryBg: 'rgb(255 255 255 / 5%)',
    brandText: 'rgb(255 255 255 / 74%)',
    brandMuted: 'rgb(255 255 255 / 44%)',
    brandLine: 'rgb(255 255 255 / 24%)',
    mark: '#ffffff',
    panel:
      'radial-gradient(circle at 12% 16%, rgb(224 122 69 / 34%), transparent 34%), radial-gradient(circle at 78% 24%, rgb(243 199 165 / 18%), transparent 38%), radial-gradient(circle at 62% 78%, rgb(196 91 45 / 24%), transparent 42%), linear-gradient(145deg, #050608 0%, #1a1410 52%, #06070a 100%)',
    panelSheen:
      'linear-gradient(120deg, rgb(255 255 255 / 8%), transparent 30%, rgb(224 122 69 / 12%) 70%, transparent)',
  },
} as const

const loginBrandVideoUrl =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4'

const baseBrandPanelStyle = {
  position: 'relative',
  overflow: 'hidden',
  flex: '1 1 0',
  minWidth: 0,
  minHeight: '100vh',
} as const

const baseBrandNoiseStyle = {
  position: 'absolute',
  inset: 0,
  opacity: 0.58
} as const

const baseBrandVideoStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
} as const

const baseBrandVideoOverlayStyle = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(circle at 52% 50%, rgb(255 255 255 / 10%), transparent 34%), linear-gradient(90deg, rgb(0 0 0 / 42%), rgb(0 0 0 / 24%)), linear-gradient(180deg, rgb(0 0 0 / 18%), transparent 42%, rgb(0 0 0 / 28%))',
} as const

const baseRightPanelStyle = {
  position: 'relative',
  flex: '1 1 0',
  minWidth: 0,
  minHeight: '100vh',
} as const

const formWrapStyle = {
  width: '100%',
  maxWidth: 400
} as const

interface LoginPageProps {
  showOAuth?: boolean
}

function BrandMark({ isDark }: { isDark: boolean }) {
  return <BrandLockup markSize={40} size={24} tone={isDark ? 'dark' : 'light'} />
}

export default function LoginPage({ showOAuth = true }: LoginPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading } = useAuth()
  const computedColorScheme = useComputedColorScheme('light')
  const isDark = computedColorScheme === 'dark'
  const palette = isDark ? authPalette.dark : authPalette.light

  const from = getPostLoginDestination(location.state)

  const [formData, setFormData] = useState<UserLoginRequest>({
    email: '',
    password: ''
  })

  const [error, setError] = useState<AuthError | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const buildError = (message: string): AuthError => ({ message })

  const validateForm = (): boolean => {
    if (!formData.email.trim()) {
      setError(buildError('请输入邮箱地址'))
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError(buildError('请输入有效的邮箱地址'))
      return false
    }

    if (!formData.password) {
      setError(buildError('请输入密码'))
      return false
    }

    if (formData.password.length < 6) {
      setError(buildError('密码长度至少 6 位'))
      return false
    }

    return true
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      await login(formData)
      navigate(from, { replace: true })
    } catch (err) {
      const authError = (err as AuthError) || buildError('登录失败，请稍后重试')
      setError(authError)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    if (error) {
      setError(null)
    }
  }

  const handleOAuthLogin = (provider: 'github' | 'google') => {
    window.location.assign(getOAuthStartUrl(provider, from))
  }

  const errorMessage = error ? getAuthErrorMessage(error, '登录失败，请稍后重试') : ''
  const disabled = isSubmitting || isLoading
  const inputStyles = {
    input: {
      height: 46,
      borderRadius: 5,
      background: palette.inputBg,
      borderColor: palette.inputBorder,
      color: palette.text,
      fontSize: 15
    }
  } as const
  const primaryButtonStyles = {
    root: {
      height: 46,
      borderRadius: 5,
      background: palette.primaryBg,
      color: palette.primaryText,
      fontWeight: 700
    }
  } as const
  const secondaryButtonStyles = {
    root: {
      height: 44,
      borderRadius: 5,
      background: palette.secondaryBg,
      color: palette.text,
      border: `1px solid ${palette.inputBorder}`,
      fontWeight: 700
    }
  } as const

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', background: palette.pageBg, color: palette.text }}>
      <Box visibleFrom="md" style={{ ...baseBrandPanelStyle, background: palette.panel }}>
        <Box
          component="video"
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          src={loginBrandVideoUrl}
          style={baseBrandVideoStyle}
        />
        <Box aria-hidden="true" style={baseBrandVideoOverlayStyle} />
        <Box aria-hidden="true" style={{ ...baseBrandNoiseStyle, backgroundImage: palette.panelSheen }} />
        <Box pos="absolute" top={42} left={50}>
          <BrandMark isDark />
        </Box>

        <Center h="100%" px={72} style={{ position: 'relative', zIndex: 1 }}>
          <Stack gap={18} align="center" ta="center">
            <Text
              c="rgb(255 255 255 / 86%)"
              fw={800}
              fz={{ md: 27, xl: 31 }}
              style={{ letterSpacing: 0 }}
            >
              “从灵感到成片，一次登录继续创作。”
            </Text>
            <Box
              aria-hidden="true"
              style={{
                width: 168,
                height: 34,
                borderBottom: '2px solid rgb(255 255 255 / 32%)',
                borderRadius: '50%',
                transform: 'translateY(-16px) rotate(-1deg)'
              }}
            />
            <Text c="rgb(255 255 255 / 54%)" fz={15} fw={500} style={{ letterSpacing: 0 }}>
              script · storyboard · voiceover
            </Text>
          </Stack>
        </Center>
      </Box>

      <Box style={{ ...baseRightPanelStyle, background: palette.rightBg }}>
        <Group pos="absolute" top={{ base: 28, sm: 48 }} right={{ base: 28, sm: 48 }} gap={8}>
          <ActionIcon component={Link} to="/" variant="transparent" c={palette.text} aria-label="返回首页">
            <HomeIcon size={22} stroke={1.8} />
          </ActionIcon>
          <LanguageSwitcher variant="icon" compact tone={isDark ? 'inverse' : 'default'} />
          <ThemeToggle />
        </Group>

        <Box hiddenFrom="md" pos="absolute" top={28} left={28}>
          <BrandMark isDark={isDark} />
        </Box>

        <Center mih="100vh" px={{ base: 28, sm: 40 }} py={{ base: 112, md: 48 }}>
          <motion.div initial="hidden" animate="visible" variants={fadeInUp} style={formWrapStyle}>
            <Stack gap={26}>
              <Title order={1} fz={30} fw={800} c={palette.heading} ta="center">
                登录您的账户
              </Title>

              {errorMessage && (
                <Alert color="red" radius={6} variant="light">
                  {errorMessage}
                </Alert>
              )}

              <Stack component="form" gap={10} onSubmit={handleSubmit}>
                <TextInput
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="name@example.com"
                  disabled={disabled}
                  styles={inputStyles}
                />

                <TextInput
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="密码"
                  disabled={disabled}
                  styles={inputStyles}
                />

                <Button
                  type="submit"
                  loading={disabled}
                  disabled={disabled}
                  fullWidth
                  styles={primaryButtonStyles}
                >
                  登录
                </Button>
              </Stack>

              <Group justify="space-between" mt={-14}>
                <Anchor component={Link} to="/register" size="sm" c={palette.muted} fw={500}>
                  前往创建
                </Anchor>
                <Anchor component={Link} to="/forgot-password" size="sm" c={palette.muted} fw={500}>
                  忘记密码
                </Anchor>
              </Group>

              {showOAuth && (
                <>
                  <Divider
                    label="或继续使用"
                    labelPosition="center"
                    styles={{
                      root: { borderColor: palette.divider },
                      label: { color: palette.muted, background: palette.rightBg, paddingInline: 12 }
                    }}
                  />

                  <Stack gap={10}>
                    <Button
                      type="button"
                      variant="default"
                      styles={secondaryButtonStyles}
                      leftSection={<BrandGithub size={20} />}
                      onClick={() => handleOAuthLogin('github')}
                    >
                      GitHub
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      styles={secondaryButtonStyles}
                      leftSection={<BrandGoogle size={20} />}
                      onClick={() => handleOAuthLogin('google')}
                    >
                      Google
                    </Button>
                  </Stack>
                </>
              )}

              <Text c={palette.muted} size="sm" ta="center" lh={1.65} mt={4}>
                点击继续，即表示您同意我们的
                <br />
                <Anchor component={Link} to="/terms-of-service" c={palette.mutedStrong} td="underline">
                  使用条款
                </Anchor>
                和
                <Anchor component={Link} to="/privacy-policy" c={palette.mutedStrong} td="underline" ml={4}>
                  隐私政策
                </Anchor>
              </Text>
            </Stack>
          </motion.div>
        </Center>
      </Box>
    </Box>
  )
}
