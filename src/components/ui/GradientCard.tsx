/**
 * GradientCard — 渐变封面卡片（FlovaTV 样式）
 * 用于案例展示、产物卡片封面、套餐卡片等
 * M-12 修复：hover 通过 onMouseEnter/Leave 实现，不用内联伪类
 */
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

interface GradientCardProps {
  children?: ReactNode
  gradientFrom?: string
  gradientTo?: string
  radius?: string
  padding?: string
  style?: CSSProperties
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

export function GradientCard({
  children, gradientFrom = '#180d26', gradientTo = '#3a1656',
  radius = 'var(--radius-md)', padding = 'var(--space-4)',
  style, className, onClick, hoverable = true,
}: GradientCardProps) {
  const [hovered, setHovered] = useState(false)

  const baseStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
    borderRadius: radius,
    border: `1px solid ${hovered && hoverable ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'}`,
    padding,
    cursor: onClick ? 'pointer' : 'default',
    transition: hoverable ? 'all 200ms ease' : 'none',
    position: 'relative',
    overflow: 'hidden',
    transform: hovered && hoverable && onClick ? 'translateY(-2px)' : 'none',
    boxShadow: hovered && hoverable && onClick ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
    ...style,
  }

  return (
    <div
      className={className}
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  )
}
