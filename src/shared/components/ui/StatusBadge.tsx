import type { ProjectStatus } from '@/features/projects'
import StatusChip from './StatusChip'

interface StatusBadgeProps {
  status: ProjectStatus
  size?: 'sm' | 'md' | 'lg'
}

const statusConfig: Record<ProjectStatus, { text: string; color: string }> = {
  draft: { text: 'Draft', color: 'yellow' },
  processing: { text: 'Processing', color: 'blue' },
  completed: { text: 'Completed', color: 'green' },
  archived: { text: 'Exported', color: 'gray' },
}

const sizeMap = {
  sm: 'xs',
  md: 'sm',
  lg: 'md',
} as const

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { text: 'Unknown', color: 'gray' }

  return (
    <StatusChip tone={config.color === 'green' ? 'success' : config.color === 'yellow' ? 'warning' : config.color === 'blue' ? 'brand' : 'neutral'} size={sizeMap[size]}>
      {config.text}
    </StatusChip>
  )
}
