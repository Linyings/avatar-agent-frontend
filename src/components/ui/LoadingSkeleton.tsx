/**
 * L-05 修复：通用加载状态占位符组件
 * 使用 Skeleton 提供视觉反馈
 */
import { Skeleton } from '@mantine/core'

interface LoadingSkeletonProps {
  type?: 'text' | 'card' | 'list' | 'chat'
  rows?: number
  height?: number | string
}

export function LoadingSkeleton({ type = 'text', rows = 3, height }: LoadingSkeletonProps) {
  if (type === 'chat') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Skeleton height={32} width={32} circle />
            <div style={{ flex: 1 }}>
              <Skeleton height={12} width="40%" mb={8} />
              <Skeleton height={10} width="90%" mb={4} />
              <Skeleton height={10} width="75%" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton height={height || 120} radius="md" />
        <Skeleton height={14} width="60%" />
        <Skeleton height={12} width="40%" />
      </div>
    )
  }

  if (type === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Skeleton height={40} width={40} radius="md" />
            <div style={{ flex: 1 }}>
              <Skeleton height={12} width="70%" mb={6} />
              <Skeleton height={10} width="40%" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 默认文本骨架
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height || 12} width={i === rows - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}
