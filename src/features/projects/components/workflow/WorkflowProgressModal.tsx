import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  CheckCircleIcon,
  EyeIcon,
  FilmIcon,
  PauseIcon,
  PlayIcon,
  XMarkIcon,
} from '@/shared/icons/tabler'
import { useI18n } from '@/shared/i18n/I18nProvider'
import type { DesktopFallbackRecommendation } from './desktopFallback'

export type WorkflowProgressStatus =
  | 'idle' | 'running' | 'stopping' | 'stopped'
  | 'interrupted' | 'blocked' | 'finalizing'
  | 'waiting-review' | 'success' | 'error'

export interface WorkflowProgressItem {
  id: string
  index: number
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress?: number
  message?: string
}

export interface WorkflowProgressModalProps {
  opened: boolean
  status: WorkflowProgressStatus
  progress: number
  items: WorkflowProgressItem[]
  message?: string
  error?: string
  desktopFallback?: DesktopFallbackRecommendation
  canClose: boolean
  canPause: boolean
  canResume: boolean
  canCancel: boolean
  outputStepIds?: readonly string[]
  onClose(): void
  onPause(): void
  onResume(): void
  onCancel(): void
  onViewStepOutput?(stepId: string): void
}

const statusTitle: Record<WorkflowProgressStatus, string> = {
  idle: '正在执行通用模式',
  running: '正在执行通用模式',
  stopping: '正在停止通用模式',
  stopped: '通用模式已停止',
  interrupted: '任务已中断，可继续',
  blocked: '等待充值后继续',
  finalizing: '正在确认积分扣除',
  'waiting-review': '请审核解说文案',
  success: '通用模式已完成',
  error: '通用模式失败',
}

const statusAlert: Partial<Record<WorkflowProgressStatus, string>> = {
  stopped: '任务已停止。点击继续会复用已完成步骤，从第一个未完成步骤继续执行。',
  interrupted: '网络或页面会话已中断。任务断点会保留 24 小时，继续后只执行未完成步骤。',
  blocked: '余额不足，任务已暂停。请在网页端充值后继续，已完成步骤不会重复扣费。',
  finalizing: '最终视频已保存到本地，正在重试确认积分扣除。网络恢复后会自动继续。',
  'waiting-review': '解说文案已生成。确认后会继续执行“画面匹配”和后续步骤。',
}

const itemStatusColor: Record<WorkflowProgressItem['status'], string> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
}

const itemStatusLabel: Record<WorkflowProgressItem['status'], string> = {
  pending: '等待',
  running: '执行中',
  completed: '完成',
  failed: '失败',
}

export function WorkflowProgressModal({
  opened,
  status,
  progress,
  items,
  message,
  error,
  desktopFallback,
  canClose,
  canPause,
  canResume,
  canCancel,
  outputStepIds,
  onClose,
  onPause,
  onResume,
  onCancel,
  onViewStepOutput,
}: WorkflowProgressModalProps) {
  const { t } = useI18n()
  const alert = statusAlert[status]
  const titleColor = status === 'success'
    ? 'green'
    : status === 'error' || error
      ? 'red'
      : ['blocked', 'interrupted', 'stopped'].includes(status)
        ? 'yellow'
        : 'blue'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={canClose}
      closeOnEscape={canClose}
      withCloseButton={canClose}
      centered
      size="xl"
      radius="md"
      title={(
        <Group gap="sm">
          <ThemeIcon radius="xl" variant="light" color={titleColor}>
            {status === 'success'
              ? <CheckCircleIcon width={18} height={18} />
              : <FilmIcon width={18} height={18} />}
          </ThemeIcon>
          <Text fw={800}>{t(statusTitle[status])}</Text>
        </Group>
      )}
    >
      <Stack gap="md">
        {error && <Alert color="red" variant="light">{error}</Alert>}
        {desktopFallback && (
          <Alert color="blue" variant="light" title={t(desktopFallback.title)}>
            <Text size="sm">{t(desktopFallback.message)}</Text>
          </Alert>
        )}
        {!error && alert && (
          <Alert color={status === 'finalizing' ? 'blue' : 'yellow'} variant="light">
            {t(alert)}
          </Alert>
        )}

        <Paper
          withBorder
          radius="md"
          p="md"
          style={{
            borderColor: 'var(--app-border-subtle)',
            background: 'var(--app-surface-alt)',
          }}
        >
          <Stack gap="sm">
            {message && <Text size="sm" fw={800} lineClamp={2}>{message}</Text>}
            <Progress
              aria-label={t('通用模式进度')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              value={progress}
              size="lg"
              radius="xl"
              color={error || status === 'error' ? 'red' : status === 'stopped' || status === 'stopping' ? 'yellow' : 'brand'}
            />
          </Stack>
        </Paper>

        <ScrollArea h={300} type="auto">
          <Stack gap={0}>
            {items.map((item, itemIndex) => (
              <Box
                key={item.id}
                py="sm"
                px="xs"
                data-frameflow-step={item.id}
                data-frameflow-status={item.status}
                data-frameflow-active={item.status === 'running' ? 'true' : 'false'}
                style={{
                  borderBottom: itemIndex < items.length - 1 ? '1px solid var(--app-border-subtle)' : undefined,
                  backgroundColor: item.status === 'running' ? 'var(--app-brand-soft-bg)' : 'transparent',
                }}
              >
                <Stack gap={6}>
                  <Group justify="space-between" gap="sm" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                      <ThemeIcon
                        size={30}
                        radius="xl"
                        color={itemStatusColor[item.status]}
                        variant={item.status === 'running' || item.status === 'completed' ? 'light' : 'subtle'}
                      >
                        <Text size="xs" fw={900}>{item.index}</Text>
                      </ThemeIcon>
                      <Stack gap={1} style={{ minWidth: 0 }}>
                        <Text size="sm" fw={800} truncate>{t(item.label)}</Text>
                        {item.message && <Text size="xs" c="dimmed" lineClamp={1}>{t(item.message)}</Text>}
                      </Stack>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Badge
                        size="sm"
                        color={itemStatusColor[item.status]}
                        variant={item.status === 'running' ? 'filled' : 'light'}
                        data-frameflow-status-badge={item.id}
                      >
                        {t(itemStatusLabel[item.status])}
                      </Badge>
                      {onViewStepOutput && outputStepIds?.includes(item.id) ? (
                        <Tooltip label={t('查看 AI 产物')}>
                          <ActionIcon
                            variant="light"
                            color="blue"
                            aria-label={`${t('查看 AI 产物')}：${t(item.label)}`}
                            data-testid={`workflow-step-output-${item.id}`}
                            onClick={() => onViewStepOutput(item.id)}
                          >
                            <EyeIcon width={16} height={16} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                    </Group>
                  </Group>
                  {item.status === 'running' && (
                    typeof item.progress === 'number' ? (
                      <Progress value={item.progress} size="sm" radius="xl" color="brand" animated />
                    ) : (
                      <Group gap="xs" c="dimmed">
                        <Loader size="xs" color="brand" />
                        <Text size="xs">{t('正在等待异步结果')}</Text>
                      </Group>
                    )
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        </ScrollArea>

        <Group justify="space-between">
          <Group gap="xs">
            {canPause && (
              <Button
                variant="light"
                color="yellow"
                leftSection={<PauseIcon width={16} height={16} />}
                onClick={onPause}
              >
                {t('暂停任务')}
              </Button>
            )}
            {canResume && (
              <Button
                color="brand"
                leftSection={<PlayIcon width={16} height={16} />}
                onClick={onResume}
              >
                {t('继续执行')}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="light"
                color="yellow"
                leftSection={<XMarkIcon width={16} height={16} />}
                onClick={onCancel}
                disabled={status === 'stopping'}
              >
                {t(status === 'stopping' ? '正在停止' : '停止任务')}
              </Button>
            )}
          </Group>
          {canClose && (
            <Button variant="light" color="gray" onClick={onClose}>
              {t('关闭')}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
