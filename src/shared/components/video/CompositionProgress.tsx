import React from 'react'
import { Badge, Button, Group, Progress, Stack, Text, ThemeIcon } from '@mantine/core'
import {
  PlayIcon,
  StopIcon,
  ClockIcon,
  FilmIcon
} from '@/shared/icons/tabler'
import type { CompositionProgress as CompositionProgressType } from '../../types'
import { formatTime, getPhaseDescription } from '@/shared/hooks/useVideoComposer'
import { WorkflowPanel } from '@/shared/components/ui/WorkflowPrimitives'

interface CompositionProgressProps {
  progress: CompositionProgressType
  isComposing: boolean
  estimatedTimeRemaining?: number
  onCancel?: () => void
}

export const CompositionProgress: React.FC<CompositionProgressProps> = ({
  progress,
  isComposing,
  estimatedTimeRemaining,
  onCancel
}) => {
  const {
    phase,
    currentSegment,
    totalSegments,
    percentage,
    message
  } = progress

  const phases = [
    {
      key: 'preparing',
      label: '准备',
      isActive: phase === 'preparing',
      isComplete: ['clipping', 'processing_audio', 'composing', 'finalizing'].includes(phase)
    },
    {
      key: 'clipping',
      label: '裁剪',
      isActive: phase === 'clipping',
      isComplete: ['processing_audio', 'composing', 'finalizing'].includes(phase)
    },
    {
      key: 'processing_audio',
      label: '音频',
      isActive: phase === 'processing_audio',
      isComplete: ['composing', 'finalizing'].includes(phase)
    },
    {
      key: 'composing',
      label: '拼接',
      isActive: phase === 'composing',
      isComplete: phase === 'finalizing'
    },
    {
      key: 'finalizing',
      label: '完成',
      isActive: phase === 'finalizing',
      isComplete: false
    }
  ]

  return (
    <WorkflowPanel>
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon variant="light" color="brand" size="lg">
              <FilmIcon width={20} height={20} />
            </ThemeIcon>
            <Text fw={700} size="lg">视频合成进度</Text>
          </Group>

          {onCancel && isComposing && (
            <Button color="red" variant="light" onClick={onCancel} leftSection={<StopIcon width={16} height={16} />}>
              取消
            </Button>
          )}
        </Group>

        <Group gap="xs">
          {phases.map((item) => (
            <Badge
              key={item.key}
              color={item.isActive ? 'brand' : item.isComplete ? 'green' : 'gray'}
              variant={item.isActive || item.isComplete ? 'light' : 'outline'}
            >
              {item.label}
            </Badge>
          ))}
        </Group>

        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="var(--app-muted)">
              当前阶段: <Text span fw={700} c="var(--app-text)">{getPhaseDescription(phase)}</Text>
            </Text>
            <Text size="sm" fw={700}>{Math.round(percentage)}%</Text>
          </Group>
          <Progress value={Math.min(percentage, 100)} color="brand" size="lg" animated={isComposing} />
        </Stack>

        <Stack gap="sm">
          {totalSegments > 0 && (
            <Group gap="sm">
              <PlayIcon width={16} height={16} />
              <Text size="sm" c="var(--app-muted)">处理片段:</Text>
              <Text size="sm" fw={700} ff="monospace">{currentSegment} / {totalSegments}</Text>
            </Group>
          )}

          <Group align="flex-start" gap="sm">
            <Text size="sm" c="var(--app-muted)">状态:</Text>
            <Text size="sm">{message}</Text>
          </Group>

          {estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && (
            <Group gap="sm">
              <ClockIcon width={16} height={16} />
              <Text size="sm" c="var(--app-muted)">预估剩余时间:</Text>
              <Text size="sm" fw={700}>{formatTime(estimatedTimeRemaining)}</Text>
            </Group>
          )}
        </Stack>

        <Text ta="center" c="var(--app-muted)" size="xs">
          视频合成中，请勿关闭页面
        </Text>
      </Stack>
    </WorkflowPanel>
  )
}
