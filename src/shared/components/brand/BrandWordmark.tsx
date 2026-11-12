import { Box } from '@mantine/core'
import type { CSSProperties } from 'react'
import { PRODUCT_NAME } from '@/shared/brand/identity'

interface BrandWordmarkProps {
  size?: number
  tone?: 'adaptive' | 'light' | 'dark'
}

// Script face for "Ava", geometric sans for "Speak"; loaded in index.html with
// system fallbacks so the wordmark never blocks startup.
export const BRAND_SCRIPT_FONT = '"Pacifico", "Brush Script MT", "Segoe Script", cursive'
export const BRAND_SANS_FONT = '"Space Grotesk", "General Sans", Inter, "Noto Sans SC", sans-serif'

export default function BrandWordmark({ size = 18, tone = 'adaptive' }: BrandWordmarkProps) {
  const isDarkTone = tone === 'dark'
  const mainColor = tone === 'adaptive' ? 'var(--app-text)' : isDarkTone ? '#ffffff' : '#07152d'

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'baseline',
    fontSize: size,
    lineHeight: 1.15,
    whiteSpace: 'nowrap',
  }
  const scriptStyle: CSSProperties = {
    fontFamily: BRAND_SCRIPT_FONT,
    fontWeight: 400,
    fontSize: size * 1.12,
    color: 'transparent',
    backgroundImage: 'linear-gradient(120deg, #fc8b73 0%, #d77bd8 55%, #8f8cff 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    paddingRight: size * 0.06,
  }
  const sansStyle: CSSProperties = { fontFamily: BRAND_SANS_FONT, fontWeight: 700, letterSpacing: '-0.02em', color: mainColor }
  const tldStyle: CSSProperties = { fontFamily: BRAND_SANS_FONT, fontWeight: 400, color: '#90daff', marginLeft: size * 0.02 }

  return (
    <Box component="span" aria-label={PRODUCT_NAME} style={baseStyle}>
      <Box component="span" aria-hidden style={scriptStyle}>Ava</Box>
      <Box component="span" aria-hidden style={sansStyle}>Speak</Box>
      <Box component="span" aria-hidden style={tldStyle}>.ai</Box>
    </Box>
  )
}
