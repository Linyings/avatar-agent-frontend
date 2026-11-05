import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Checkbox,
  Divider,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  useComputedColorScheme
} from '@mantine/core'
import BrandLockup from '@/shared/components/brand/BrandLockup'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'
import ThemeToggle from '@/shared/components/ui/ThemeToggle'
import { BrandGithub, BrandGoogle, CheckCircleIcon, HomeIcon } from '@/shared/icons/tabler'
import { useAuth } from '@/features/auth'
import type { UserRegisterRequest, AuthError } from '@/features/auth'
import { authService, getOAuthStartUrl } from '@/features/auth/services/authService'
import { fadeInUp } from '@/shared/utils/animations'
import { getAuthErrorMessage } from '@/features/auth/utils/errorMessages'
import { useEmailCodeCooldown } from '@/features/auth/utils/emailCodeCooldown'
import { useI18n } from '@/shared/i18n/I18nProvider'

const passwordRules = [
  { id: 'length', text: '至少 8 个字符', test: (pwd: string) => pwd.length >= 8 },
  { id: 'uppercase', text: '包含大写字母', test: (pwd: string) => /[A-Z]/.test(pwd) },
  { id: 'lowercase', text: '包含小写字母', test: (pwd: string) => /[a-z]/.test(pwd) },
  { id: 'number', text: '包含数字', test: (pwd: string) => /\d/.test(pwd) }
]

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
    disabledBg: '#d9dbe1',
    disabledText: '#7a7d86',
    secondaryBg: '#ffffff',
    successBg: 'rgb(30 128 84 / 8%)',
    successBorder: 'rgb(30 128 84 / 20%)',
    successText: '#166f49',
    successIcon: '#188957',
    brandText: 'rgb(23 23 26 / 66%)',
    brandMuted: 'rgb(23 23 26 / 42%)',
    brandLine: 'rgb(23 23 26 / 22%)',
    mark: '#161619',
    checkboxBg: '#ffffff',
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
    disabledBg: 'rgb(255 255 255 / 14%)',
    disabledText: 'rgb(255 255 255 / 42%)',
    secondaryBg: 'rgb(255 255 255 / 5%)',
    successBg: 'rgb(78 203 138 / 11%)',
    successBorder: 'rgb(78 203 138 / 24%)',
    successText: 'rgb(195 246 220 / 92%)',
    successIcon: '#62d997',
    brandText: 'rgb(255 255 255 / 74%)',
    brandMuted: 'rgb(255 255 255 / 44%)',
    brandLine: 'rgb(255 255 255 / 24%)',
    mark: '#ffffff',
    checkboxBg: 'rgb(255 255 255 / 6%)',
    panel:
      'radial-gradient(circle at 12% 16%, rgb(224 122 69 / 34%), transparent 34%), radial-gradient(circle at 78% 24%, rgb(243 199 165 / 18%), transparent 38%), radial-gradient(circle at 62% 78%, rgb(196 91 45 / 24%), transparent 42%), linear-gradient(145deg, #050608 0%, #1a1410 52%, #06070a 100%)',
    panelSheen:
      'linear-gradient(120deg, rgb(255 255 255 / 8%), transparent 30%, rgb(224 122 69 / 12%) 70%, transparent)',
  },
} as const

const registerBrandVideoUrl =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_055001_8e16d972-3b2b-441c-86ad-2901a54682f9.mp4'

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

const evaluatePassword = (password: string) => {
  const passed = passwordRules.filter(rule => rule.test(password))
  return {
    score: passed.length,
    total: passwordRules.length,
  }
}

function BrandMark({ isDark }: { isDark: boolean }) {
  return <BrandLockup markSize={40} size={24} tone={isDark ? 'dark' : 'light'} />
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register, isLoading } = useAuth()
  const { locale, t } = useI18n()
  const computedColorScheme = useComputedColorScheme('light')
  const shouldReduceMotion = useReducedMotion()
  const isDark = computedColorScheme === 'dark'
  const palette = isDark ? authPalette.dark : authPalette.light

  const [formData, setFormData] = useState<Omit<UserRegisterRequest, 'display_name'> & { confirmPassword: string }>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    code: ''
  })

  const [error, setError] = useState<AuthError | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [codeSuccess, setCodeSuccess] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const { countdown, startCooldown, clearCooldown } = useEmailCodeCooldown('register', formData.email)
  const codeSuccessTimerRef = useRef<number | null>(null)

  const passwordStrength = evaluatePassword(formData.password)
  const disabled = isSubmitting || isLoading
  const isRegisterDisabled = disabled || passwordStrength.score < passwordStrength.total || !agreedToTerms

  const isEmailValid = (): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(formData.email.trim())
  }

  const buildError = (message: string): AuthError => ({ message })

  useEffect(() => {
    return () => {
      if (codeSuccessTimerRef.current !== null) {
        window.clearTimeout(codeSuccessTimerRef.current)
      }
    }
  }, [])

  const handleRequestCode = async () => {
    if (!isEmailValid()) {
      setError(buildError('请输入有效的邮箱地址'))
      return
    }
    if (isSendingCode || countdown > 0 || disabled) {
      return
    }

    setIsSendingCode(true)
    setError(null)
    setCodeSuccess(false)
    if (codeSuccessTimerRef.current !== null) {
      window.clearTimeout(codeSuccessTimerRef.current)
    }
    startCooldown()

    try {
      await authService.requestEmailCode(formData.email.trim(), locale)
      setCodeSuccess(true)
      codeSuccessTimerRef.current = window.setTimeout(() => {
        setCodeSuccess(false)
        codeSuccessTimerRef.current = null
      }, 5000)
    } catch (err) {
      const authError = (err as AuthError) || buildError('获取验证码失败')

      clearCooldown()
      setError(authError)
    } finally {
      setIsSendingCode(false)
    }
  }

  const validateForm = (): boolean => {
    if (!formData.username.trim()) {
      setError(buildError('请输入用户名'))
      return false
    }

    if (formData.username.length < 3) {
      setError(buildError('用户名至少 3 个字符'))
      return false
    }

    if (formData.username.length > 20) {
      setError(buildError('用户名不能超过 20 个字符'))
      return false
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      setError(buildError('用户名只能包含字母、数字、下划线和连字符'))
      return false
    }

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

    if (passwordStrength.score < passwordStrength.total) {
      setError(buildError('密码需满足全部安全要求'))
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      setError(buildError('两次输入的密码不一致'))
      return false
    }

    if (!formData.code.trim()) {
      setError(buildError('请输入邮箱验证码'))
      return false
    }

    if (!/^\d{6}$/.test(formData.code.trim())) {
      setError(buildError('邮箱验证码格式不正确（6位数字）'))
      return false
    }

    if (!agreedToTerms) {
      setError(buildError('请阅读并同意《隐私政策》和《使用条款》'))
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
      const username = formData.username.trim()
      const payload: UserRegisterRequest = {
        username,
        email: formData.email.trim(),
        password: formData.password,
        display_name: username,
        code: formData.code.trim()
      }

      await register(payload)
      navigate('/', { replace: true })
    } catch (err) {
      const authError = (err as AuthError) || buildError('注册失败，请稍后重试')
      setError(authError)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    const nextValue = name === 'code' ? value.replace(/\D/g, '').slice(0, 6) : value
    setFormData(prev => ({
      ...prev,
      [name]: nextValue
    }))

    if (error) {
      setError(null)
    }
  }

  const updateTermsAgreement = (checked: boolean) => {
    setAgreedToTerms(checked)
    if (error) {
      setError(null)
    }
  }

  const handleAgreementTextClick = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a')) {
      return
    }
    updateTermsAgreement(!agreedToTerms)
  }

  const handleOAuthLogin = (provider: 'github' | 'google') => {
    window.location.assign(getOAuthStartUrl(provider, '/'))
  }

  const formatCountdownLabel = (seconds: number) => {
    if (locale === 'zh-CN') return `${seconds}秒后`
    if (locale === 'fr') return `${seconds} s`
    if (locale === 'de') return `${seconds} s`
    return `${seconds}s`
  }

  const formatCodeSentMessage = (email: string) => {
    if (locale === 'fr') return `Code envoyé à ${email}. Valable pendant 10 minutes.`
    if (locale === 'de') return `Code an ${email} gesendet. 10 Minuten gültig.`
    if (locale === 'en') return `Code sent to ${email}. Valid for 10 minutes.`
    return `验证码已发送至 ${email}，10 分钟内有效`
  }

  const errorMessage = error ? t(getAuthErrorMessage(error, '注册失败，请稍后重试')) : ''
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
      background: isRegisterDisabled ? palette.disabledBg : palette.primaryBg,
      color: isRegisterDisabled ? palette.disabledText : palette.primaryText,
      fontWeight: 700,
      cursor: isRegisterDisabled ? 'not-allowed' : 'pointer',
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
        {!shouldReduceMotion && (
          <Box
            component="video"
            aria-hidden="true"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            src={registerBrandVideoUrl}
            style={baseBrandVideoStyle}
          />
        )}
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
              “{t('把脚本、分镜和配音交给同一个工作流。')}”
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
              idea · timeline · delivery
            </Text>
          </Stack>
        </Center>
      </Box>

      <Box style={{ ...baseRightPanelStyle, background: palette.rightBg }}>
        <Group pos="absolute" top={{ base: 28, sm: 48 }} right={{ base: 28, sm: 48 }} gap={8}>
          <ActionIcon component={Link} to="/" variant="transparent" c={palette.text} aria-label={t('返回首页')}>
            <HomeIcon size={22} stroke={1.8} />
          </ActionIcon>
          <LanguageSwitcher variant="icon" compact tone={isDark ? 'inverse' : 'default'} />
          <ThemeToggle />
        </Group>

        <Box hiddenFrom="md" pos="absolute" top={28} left={28}>
          <BrandMark isDark={isDark} />
        </Box>

        <Center mih="100vh" px={{ base: 28, sm: 40 }} py={{ base: 112, md: 48 }}>
          <motion.div
            initial={shouldReduceMotion ? false : 'hidden'}
            animate={shouldReduceMotion ? undefined : 'visible'}
            variants={shouldReduceMotion ? undefined : fadeInUp}
            style={formWrapStyle}
          >
            <Stack gap={20}>
              <Title order={1} fz={30} fw={800} c={palette.heading} ta="center">
                {t('创建您的账户')}
              </Title>

              {errorMessage && (
                <Alert color="red" radius={6} variant="light">
                  {errorMessage}
                </Alert>
              )}

              <Stack component="form" gap={10} onSubmit={handleSubmit}>
                <TextInput
                  name="username"
                  aria-label={t('用户名')}
                  required
                  autoComplete="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder={t('用户名')}
                  disabled={disabled}
                  styles={inputStyles}
                />

                <TextInput
                  name="email"
                  type="email"
                  aria-label={t('邮箱地址')}
                  required
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="name@example.com"
                  disabled={disabled}
                  styles={inputStyles}
                />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={10}>
                  <TextInput
                    name="code"
                    aria-label={t('邮箱验证码')}
                    required
                    inputMode="numeric"
                    maxLength={6}
                    pattern="\d{6}"
                    autoComplete="one-time-code"
                    value={formData.code}
                    onChange={handleInputChange}
                    placeholder={t('邮箱验证码')}
                    disabled={disabled}
                    styles={inputStyles}
                  />
                  <Button
                    type="button"
                    onClick={handleRequestCode}
                    loading={isSendingCode}
                    disabled={!isEmailValid() || countdown > 0 || isSendingCode || disabled}
                    variant="default"
                    styles={secondaryButtonStyles}
                  >
                    {countdown > 0 ? formatCountdownLabel(countdown) : codeSuccess ? t('已发送') : t('获取验证码')}
                  </Button>
                </SimpleGrid>

                {codeSuccess && (
                  <Group
                    role="status"
                    aria-live="polite"
                    gap={8}
                    wrap="nowrap"
                    style={{
                      minHeight: 38,
                      padding: '8px 10px',
                      borderRadius: 5,
                      border: `1px solid ${palette.successBorder}`,
                      background: palette.successBg,
                      color: palette.successText,
                    }}
                  >
                    <CheckCircleIcon size={17} stroke={2} color={palette.successIcon} style={{ flex: '0 0 auto' }} />
                    <Text size="sm" fw={600} lh={1.35} style={{ letterSpacing: 0 }}>
                      {formatCodeSentMessage(formData.email.trim())}
                    </Text>
                  </Group>
                )}

                <PasswordInput
                  name="password"
                  aria-label={t('登录密码')}
                  aria-describedby="register-password-rules"
                  required
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder={t('密码')}
                  disabled={disabled}
                  styles={inputStyles}
                />

                <SimpleGrid id="register-password-rules" cols={{ base: 1, sm: 2 }} spacing={6}>
                  {passwordRules.map((rule) => {
                    const passed = rule.test(formData.password)
                    return (
                      <Text key={rule.id} size="xs" c={passed ? palette.mutedStrong : palette.muted}>
                        {passed ? '✓ ' : ''}{t(rule.text)}
                      </Text>
                    )
                  })}
                </SimpleGrid>

                <PasswordInput
                  name="confirmPassword"
                  aria-label={t('确认密码')}
                  required
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder={t('确认密码')}
                  disabled={disabled}
                  styles={inputStyles}
                />

                <Group gap={12} align="flex-start" mt={2} wrap="nowrap">
                  <Checkbox
                    aria-label={t('我同意使用条款和隐私政策')}
                    checked={agreedToTerms}
                    onChange={(event) => updateTermsAgreement(event.currentTarget.checked)}
                    styles={{
                      root: {
                        paddingTop: 1,
                      },
                      input: {
                        borderColor: palette.inputBorder,
                        cursor: 'pointer',
                      },
                    }}
                  />
                  <Text
                    component="span"
                    size="sm"
                    c={palette.muted}
                    onClick={handleAgreementTextClick}
                    style={{ cursor: 'pointer', userSelect: 'none', lineHeight: 1.45 }}
                  >
                    <Box component="span" data-testid="agreement-toggle-text">
                      {t('我同意')}
                    </Box>
                    <Anchor
                      component={Link}
                      to="/terms-of-service"
                      c={palette.mutedStrong}
                      td="underline"
                      mx={4}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {t('使用条款')}
                    </Anchor>
                    {t('和')}
                    <Anchor
                      component={Link}
                      to="/privacy-policy"
                      c={palette.mutedStrong}
                      td="underline"
                      ml={4}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {t('隐私政策')}
                    </Anchor>
                  </Text>
                </Group>

                <Button
                  type="submit"
                  loading={disabled}
                  disabled={isRegisterDisabled}
                  fullWidth
                  styles={primaryButtonStyles}
                >
                  {t('注册')}
                </Button>
              </Stack>

              <Anchor component={Link} to="/login" size="sm" c={palette.muted} fw={500}>
                {t('已有账户？直接登录')}
              </Anchor>

              <Divider
                label={t('或继续使用')}
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
            </Stack>
          </motion.div>
        </Center>
      </Box>
    </Box>
  )
}
