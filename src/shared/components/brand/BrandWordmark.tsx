import { Box } from '@mantine/core'
import type { CSSProperties } from 'react'
import { PRODUCT_NAME } from '@/shared/brand/identity'

interface BrandWordmarkProps {
  size?: number
  tone?: 'adaptive' | 'light' | 'dark'
}

const wordmarkFont =
  '"General Sans", Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'

export default function BrandWordmark({ size = 18, tone = 'adaptive' }: BrandWordmarkProps) {
  const isDarkTone = tone === 'dark'
  const mainColor = tone === 'adaptive' ? 'var(--app-text)' : isDarkTone ? '#ffffff' : '#07152d'
  const mainHighlight =
    tone === 'adaptive'
      ? 'color-mix(in srgb, var(--app-text) 42%, transparent)'
      : isDarkTone
        ? 'rgba(255, 255, 255, 0.72)'
        : 'rgba(196, 91, 45, 0.22)'
  const accentGradient = 'linear-gradient(150deg, #9be86f 4%, #62d875 42%, #32c67d 100%)'

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'baseline',
    fontFamily: wordmarkFont,
    fontSize: size,
    fontWeight: 750,
    letterSpacing: 0,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  }

  const textGradientStyle: CSSProperties = {
    color: 'transparent',
    backgroundImage: `linear-gradient(180deg, ${mainHighlight} 0%, ${mainColor} 38%, ${mainColor} 100%)`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    textShadow: isDarkTone ? '0 8px 24px rgba(0, 0, 0, 0.18)' : '0 10px 22px rgba(7, 21, 45, 0.1)',
  }

  const accentStyle: CSSProperties = {
    color: 'transparent',
    backgroundImage: accentGradient,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    textShadow: '0 8px 20px rgba(196, 91, 45, 0.22)',
  }

  return (
    <Box component="span" aria-label={PRODUCT_NAME} style={baseStyle}>
      <Box component="span" aria-hidden style={textGradientStyle}>
        数字人
      </Box>
      <Box component="span" aria-hidden style={{ ...accentStyle, marginLeft: size * 0.04 }}>
        口播
      </Box>
    </Box>
  )
}
