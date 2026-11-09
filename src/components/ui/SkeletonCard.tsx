/**
 * SkeletonCard — 骨架屏加载态
 * 形状与产物卡片一致，避免全屏 spinner
 */
interface SkeletonCardProps {
  height?: number | string
  showHeader?: boolean
  showRows?: number
  style?: React.CSSProperties
}

export function SkeletonCard({
  height = 120, showHeader = true, showRows = 2, style,
}: SkeletonCardProps) {
  const shimmer = 'linear-gradient(90deg, var(--color-surface) 25%, var(--color-surface-hover) 50%, var(--color-surface) 75%)'

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-4)',
      height,
      ...style,
    }}>
      {showHeader && (
        <div style={{
          height: 14, width: '40%',
          borderRadius: 'var(--radius-sm)',
          background: shimmer,
          backgroundSize: '200% 100%',
          animation: 'skeletonShimmer 1.5s ease-in-out infinite',
          marginBottom: 'var(--space-3)',
        }} />
      )}
      {Array.from({ length: showRows }).map((_, i) => (
        <div key={i} style={{
          height: 10, width: `${90 - i * 20}%`,
          borderRadius: 'var(--radius-sm)',
          background: shimmer,
          backgroundSize: '200% 100%',
          animation: 'skeletonShimmer 1.5s ease-in-out infinite',
          animationDelay: `${i * 0.15}s`,
          marginTop: 'var(--space-2)',
        }} />
      ))}
    </div>
  )
}

// 注入关键帧
if (typeof document !== 'undefined' && !document.getElementById('skeleton-shimmer-style')) {
  const s = document.createElement('style')
  s.id = 'skeleton-shimmer-style'
  s.textContent = `
    @keyframes skeletonShimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `
  document.head.appendChild(s)
}
