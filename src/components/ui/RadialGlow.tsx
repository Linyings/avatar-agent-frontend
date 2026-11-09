/**
 * RadialGlow — 多层径向光晕背景
 * 橙色主光 + 白色高光 + 底部线性渐变
 */
import type { CSSProperties } from 'react'

interface RadialGlowProps {
  style?: CSSProperties
  /** 是否显示白色高光（右上角） */
  whiteHighlight?: boolean
  /** 是否显示底部线性渐变 */
  bottomFade?: boolean
  /** 主光强度 0-1 */
  intensity?: number
}

export function RadialGlow({
  style, whiteHighlight = true, bottomFade = true,
  intensity = 0.34,
}: RadialGlowProps) {
  const layers: string[] = [
    `radial-gradient(ellipse 80% 42% at 50% -8%, rgba(232,130,10,${intensity}), rgba(232,130,10,0%) 58%)`,
  ]
  if (whiteHighlight) {
    layers.push('radial-gradient(circle at 74% 16%, rgba(255,255,255,0.07), rgba(255,255,255,0%) 28%)')
  }
  if (bottomFade) {
    layers.push('linear-gradient(180deg, #080808 0%, #120e0c 56%, #080808 100%)')
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: layers.join(', '),
      pointerEvents: 'none',
      ...style,
    }} />
  )
}
