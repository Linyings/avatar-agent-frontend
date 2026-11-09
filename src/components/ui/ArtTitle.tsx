/**
 * ArtTitle — Cormorant Infant 艺术斜体标题
 */
import type { CSSProperties, ReactNode } from 'react'

interface ArtTitleProps {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  gradient?: boolean
  italic?: boolean
  style?: CSSProperties
  className?: string
}

const sizeMap = {
  sm:  '1.25rem',
  md:  '1.75rem',
  lg:  '2.5rem',
  xl:  '3.5rem',
  '2xl': '4.5rem',
}

export function ArtTitle({
  children, size = 'lg', gradient = false,
  italic = true, style, className,
}: ArtTitleProps) {
  const base: CSSProperties = {
    fontFamily: "'Cormorant Infant', Georgia, serif",
    fontStyle: italic ? 'italic' : 'normal',
    fontWeight: 600,
    fontSize: sizeMap[size],
    lineHeight: 1.15,
    letterSpacing: '-0.01em',
    ...(gradient ? {
      background: 'linear-gradient(135deg, #ff9d2e 0%, #e8820a 60%, #c45b2d 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    } : {
      color: 'var(--color-text)',
    }),
    ...style,
  }

  return (
    <span className={className} style={base}>
      {children}
    </span>
  )
}
