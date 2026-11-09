/**
 * tokens.ts — 设计 token 的 TypeScript 视图
 *
 * M-15：此前 6 个文件各自定义了一份 `T` 常量，值大量重复但各不相同，
 * 改一个色值要记得改六处，漏一处就是视觉不一致。
 *
 * 这里不重复写十六进制值，而是引用 tokens.css 中的 CSS 变量——
 * 单一真相仍留在 CSS 里，TS 只提供类型安全的名字。
 */

/** 背景与表面 */
export const T = {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  surfaceHover: 'var(--color-surface-hover)',
  surfaceRaised: 'var(--color-surface-raised)',

  /** 边框 */
  border: 'var(--color-border)',
  borderHover: 'var(--color-border-hover)',

  /** 文字 */
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-dim)',

  /** 强调色 */
  accent: 'var(--color-accent)',
  accentLight: 'var(--color-accent-light)',
  accentBg: 'var(--color-accent-bg)',
  accentBorder: 'var(--color-accent-border)',

  /** 语义色 */
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  dangerBg: 'rgba(239, 68, 68, 0.10)',

  /** 圆角 */
  radiusSm: 'var(--radius-sm)',
  radiusMd: 'var(--radius-md)',
  radiusLg: 'var(--radius-lg)',
  radiusPill: 'var(--radius-pill)',

  /** 动效 */
  transitionFast: 'var(--transition-fast)',
  transitionNormal: 'var(--transition-normal)',

  /** 字体 */
  fontArt: 'var(--font-art)',
  fontBody: 'var(--font-body)',
  fontMono: 'var(--font-mono)',
} as const

/** 布局尺寸（数值型，供 inline style 直接参与计算） */
export const layout = {
  sideW: 220,
  sideWNarrow: 200,
  agentPanelW: 380,
  topbarH: 48,
  navH: 60,
} as const

/** 侧边栏导航项状态色（AppSidebar 专用） */
export const navColors = {
  text: 'var(--color-muted)',
  activeText: 'var(--color-text)',
  activeBg: 'rgba(232, 130, 10, 0.14)',
  activeBorder: 'rgba(232, 130, 10, 0.50)',
  hoverBg: 'rgba(255, 255, 255, 0.05)',
} as const

export type Tokens = typeof T
