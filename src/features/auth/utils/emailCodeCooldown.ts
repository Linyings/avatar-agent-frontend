import { useEffect, useState } from 'react'

const EMAIL_CODE_COOLDOWN_MS = 60_000

export type EmailCodeCooldownPurpose = 'register' | 'verify_email' | 'reset_password'

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const cooldownKey = (purpose: EmailCodeCooldownPurpose, email: string): string => (
  `auth_email_code_cooldown:${purpose}:${normalizeEmail(email)}`
)

export const getEmailCodeCooldownRemaining = (
  purpose: EmailCodeCooldownPurpose,
  email: string
): number => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || typeof window === 'undefined') return 0

  const key = cooldownKey(purpose, normalizedEmail)
  const raw = window.localStorage.getItem(key)
  const expiresAt = raw ? Number(raw) : 0
  const remainingMs = expiresAt - Date.now()

  if (!Number.isFinite(expiresAt) || remainingMs <= 0) {
    window.localStorage.removeItem(key)
    return 0
  }

  return Math.ceil(remainingMs / 1000)
}

export const startEmailCodeCooldown = (
  purpose: EmailCodeCooldownPurpose,
  email: string
): number => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || typeof window === 'undefined') return 0

  window.localStorage.setItem(
    cooldownKey(purpose, normalizedEmail),
    String(Date.now() + EMAIL_CODE_COOLDOWN_MS)
  )

  return Math.ceil(EMAIL_CODE_COOLDOWN_MS / 1000)
}

export const clearEmailCodeCooldown = (
  purpose: EmailCodeCooldownPurpose,
  email: string
): void => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || typeof window === 'undefined') return

  window.localStorage.removeItem(cooldownKey(purpose, normalizedEmail))
}

export const useEmailCodeCooldown = (
  purpose: EmailCodeCooldownPurpose,
  email: string
): { countdown: number; startCooldown: () => number; clearCooldown: () => void } => {
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    const update = () => {
      setCountdown(getEmailCodeCooldownRemaining(purpose, email))
    }

    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [email, purpose])

  const startCooldown = () => {
    const seconds = startEmailCodeCooldown(purpose, email)
    setCountdown(seconds)
    return seconds
  }

  const clearCooldown = () => {
    clearEmailCodeCooldown(purpose, email)
    setCountdown(0)
  }

  return { countdown, startCooldown, clearCooldown }
}
