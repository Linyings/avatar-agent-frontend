import React, { useState } from 'react'
import { Alert, Badge, Button, Group, Modal, NumberInput, ScrollArea, Stack, Switch, Table, Text } from '@mantine/core'
import {
  ExclamationTriangleIcon,
  ClockIcon,
  SpeakerWaveIcon,
  CheckIcon,
  InformationCircleIcon
} from '@/shared/icons/tabler'
import type { CalibrationResult, CalibrationOptions } from '@/shared/types'
import { MetricCard, MetricGrid, WorkflowPanel } from './WorkflowPrimitives'

interface TimestampCalibrationDialogProps {
  isOpen: boolean
  onClose: () => void
  calibrationResult: CalibrationResult
  onConfirmCalibration: (options: CalibrationOptions) => void
  onSkipCalibration: () => void
}

export const TimestampCalibrationDialog: React.FC<TimestampCalibrationDialogProps> = ({
  isOpen,
  onClose,
  calibrationResult,
  onConfirmCalibration,
  onSkipCalibration
}) => {
  const [options, setOptions] = useState<CalibrationOptions>({
    toleranceSeconds: 0.5,
    autoAdjustSubsequent: true
  })

  if (!isOpen) return null

  const needCalibrationItems = calibrationResult.items.filter(item => item.needsCalibration)
  const averageDifference = needCalibrationItems.length > 0
    ? calibrationResult.totalDifference / needCalibrationItems.length
    : 0

  const handleConfirm = () => {
    onConfirmCalibration(options)
    onClose()
  }

  const handleSkip = () => {
    onSkipCalibration()
    onClose()
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <Group gap="sm">
          <ExclamationTriangleIcon width={24} height={24} />
          <div>
            <Text fw={600}>时间戳校准</Text>
            <Text size="sm" c="dimmed">检测到音频时长与视频片段时长不一致</Text>
          </div>
        </Group>
      }
    >
      <Stack gap="lg">
        <MetricGrid>
          <MetricCard icon={<InformationCircleIcon width={16} height={16} />} label="需要校准" value={`${needCalibrationItems.length} 个`} />
          <MetricCard icon={<ClockIcon width={16} height={16} />} label="总时长差异" value={`${Math.round(calibrationResult.totalDifference * 100) / 100}s`} />
          <MetricCard icon={<SpeakerWaveIcon width={16} height={16} />} label="平均差异" value={`${Math.round(averageDifference * 100) / 100}s`} />
          <MetricCard icon={<CheckIcon width={16} height={16} />} label="校准率" value={`${Math.round((needCalibrationItems.length / calibrationResult.items.length) * 100)}%`} />
        </MetricGrid>

        <Stack gap="sm">
          <Text fw={700}>需要校准的片段</Text>
          <WorkflowPanel p={0} shadow="none">
            <ScrollArea type="auto">
              <Table striped highlightOnHover miw={760}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>片段ID</Table.Th>
                    <Table.Th>时间戳</Table.Th>
                    <Table.Th>原时长</Table.Th>
                    <Table.Th>音频时长</Table.Th>
                    <Table.Th>差异</Table.Th>
                    <Table.Th>状态</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {needCalibrationItems.map((item) => (
                    <Table.Tr key={item._id}>
                      <Table.Td><Text ff="monospace">#{item._id}</Text></Table.Td>
                      <Table.Td><Text ff="monospace">{item.timestamp}</Text></Table.Td>
                      <Table.Td>{Math.round(item.originalDuration * 100) / 100}s</Table.Td>
                      <Table.Td>{Math.round(item.audioDuration * 100) / 100}s</Table.Td>
                      <Table.Td>
                        <Text c={item.difference > 1 ? 'red' : 'yellow'} fw={700}>
                          {item.difference > 0 ? '+' : ''}{Math.round(item.difference * 100) / 100}s
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {item.needsCalibration ? (
                          <Badge color="yellow" leftSection={<ExclamationTriangleIcon width={12} height={12} />}>需校准</Badge>
                        ) : (
                          <Badge color="green" leftSection={<CheckIcon width={12} height={12} />}>正常</Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </WorkflowPanel>
        </Stack>

        <WorkflowPanel tone="subtle" shadow="none">
          <Stack gap="md">
            <Text fw={700}>校准选项</Text>
            <Group align="flex-start" gap="sm">
              <Switch
                id="auto-adjust"
                checked={options.autoAdjustSubsequent}
                onChange={(event) =>
                  setOptions(prev => ({ ...prev, autoAdjustSubsequent: event.currentTarget.checked }))
                }
              />
              <Stack gap={4}>
                <Text component="label" htmlFor="auto-adjust" fw={500}>自动调整后续片段时间</Text>
                <Text size="xs" c="dimmed">校准当前片段后，自动调整后续所有片段的开始时间，避免时间重叠</Text>
              </Stack>
            </Group>

            <Stack gap="xs">
              <Text component="label" htmlFor="tolerance" fw={500}>时长差异容忍阈值（秒）</Text>
              <NumberInput
                id="tolerance"
                min={0}
                max={5}
                step={0.1}
                value={options.toleranceSeconds}
                onChange={(value) => setOptions(prev => ({ ...prev, toleranceSeconds: Number(value) || 0.5 }))}
                w={128}
              />
              <Text size="xs" c="dimmed">低于此阈值的时长差异将不会触发校准提示</Text>
            </Stack>
          </Stack>
        </WorkflowPanel>

        <Alert color="blue" variant="light" title="校准说明" icon={<InformationCircleIcon width={18} height={18} />}>
          <ul>
            <li>校准后，视频片段时长将调整为音频实际时长</li>
            <li>开始时间保持不变，只调整结束时间</li>
            <li>如果启用“自动调整后续片段”，所有后续片段时间将相应调整</li>
            <li>校准不可撤销，请确认后再执行</li>
          </ul>
        </Alert>

        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            共发现 {needCalibrationItems.length} 个片段需要校准，总时长差异 {Math.round(calibrationResult.totalDifference * 100) / 100} 秒
          </Text>
          <Group>
            <Button variant="subtle" onClick={handleSkip}>跳过校准</Button>
            <Button onClick={handleConfirm}>确认校准</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

export default TimestampCalibrationDialog
