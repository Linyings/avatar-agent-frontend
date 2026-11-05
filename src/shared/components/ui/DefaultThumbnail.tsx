import React from 'react'
import { Box, Text } from '@mantine/core'
import { FilmIcon, DocumentTextIcon, ArchiveBoxIcon } from '@/shared/icons/tabler'
import type { ProjectStatus } from '@/features/projects'

interface DefaultThumbnailProps {
  status: ProjectStatus
  className?: string
}

const DefaultThumbnail: React.FC<DefaultThumbnailProps> = ({ status, className = '' }) => {
  const getStatusConfig = (status: ProjectStatus) => {
    const configs = {
      draft: {
        icon: FilmIcon,
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.18) 0%, rgba(51, 65, 85, 0.1) 45%, rgba(30, 64, 175, 0.18) 100%)',
        iconColor: '#93c5fd',
        borderColor: 'rgba(148, 163, 184, 0.22)',
        text: '无预览',
        textColor: '#cbd5e1'
      },
      processing: {
        icon: FilmIcon,
        background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.26) 0%, rgba(49, 46, 129, 0.12) 45%, rgba(88, 28, 135, 0.26) 100%)',
        iconColor: '#60a5fa',
        borderColor: 'rgba(59, 130, 246, 0.2)',
        text: '处理中',
        textColor: '#93c5fd'
      },
      completed: {
        icon: DocumentTextIcon,
        background: 'linear-gradient(135deg, rgba(20, 83, 45, 0.26) 0%, rgba(6, 78, 59, 0.12) 45%, rgba(17, 94, 89, 0.26) 100%)',
        iconColor: '#4ade80',
        borderColor: 'rgba(34, 197, 94, 0.2)',
        text: '已完成',
        textColor: '#86efac'
      },
      archived: {
        icon: ArchiveBoxIcon,
        background: 'linear-gradient(135deg, rgba(39, 39, 42, 0.26) 0%, rgba(51, 65, 85, 0.12) 45%, rgba(39, 39, 42, 0.26) 100%)',
        iconColor: '#9ca3af',
        borderColor: 'rgba(107, 114, 128, 0.2)',
        text: '已导出',
        textColor: '#d1d5db'
      }
    }
    return configs[status] || configs.draft
  }

  const config = getStatusConfig(status)
  const IconComponent = config.icon

  return (
    <Box
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 12,
        overflow: 'hidden',
        border: `1px solid ${config.borderColor}`,
        background: config.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box style={{ position: 'absolute', inset: 0, opacity: 0.08, color: config.iconColor }}>
        <Box style={{ position: 'absolute', top: 16, left: 16, width: 32, height: 32, border: '1px solid currentColor', borderRadius: '50%' }} />
        <Box style={{ position: 'absolute', top: 32, right: 24, width: 16, height: 16, background: 'currentColor', borderRadius: '50%' }} />
        <Box style={{ position: 'absolute', bottom: 24, left: 32, width: 24, height: 24, border: '1px solid currentColor', transform: 'rotate(45deg)' }} />
        <Box style={{ position: 'absolute', bottom: 16, right: 16, width: 12, height: 12, background: 'currentColor', borderRadius: 4 }} />
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
            gap: 8,
            padding: 16,
          }}
        >
          {Array.from({ length: 32 }).map((_, i) => (
            <Box key={i} style={{ background: 'currentColor', borderRadius: 4, opacity: 0.12 }} />
          ))}
        </Box>
      </Box>

      <Box style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Box
          style={{
            padding: 12,
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: config.iconColor,
          }}
        >
          <IconComponent style={{ width: 32, height: 32 }} />
        </Box>
        <Text fw={600} size="sm" c={config.textColor}>
          {config.text}
        </Text>
      </Box>

      <Box
        style={{
          position: 'absolute',
          insetInline: 0,
          bottom: 0,
          height: '34%',
          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.2) 100%)',
        }}
      />
    </Box>
  )
}

export default DefaultThumbnail
