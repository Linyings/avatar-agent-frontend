import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import {
  PlusIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  SpeakerWaveIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  StopIcon
} from '@/shared/icons/tabler'
import type { ScriptItem, AudioGenerationStatus } from '@/shared/types'
import { WorkflowPanel } from '@/shared/components/ui/WorkflowPrimitives'

const formatAudioDuration = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }

  if (value >= 60) {
    const minutes = Math.floor(value / 60)
    const seconds = value - minutes * 60
    const secondsFixed = seconds.toFixed(1)
    const paddedSeconds = secondsFixed.padStart(4, '0')
    return `${minutes}:${paddedSeconds}`
  }

  if (value >= 10) {
    return `${value.toFixed(1)}s`
  }

  return `${value.toFixed(2)}s`
}

interface DubbingScriptTableProps {
  data: ScriptItem[]
  onChange: (newData: ScriptItem[]) => void
  onGenerateAudio?: (itemId: number, text: string) => Promise<void>
  onPlayAudio?: (itemId: number, audioUrl: string) => void
  onPauseAudio?: () => void
  onStopAudio?: () => void
  onClearSingleAudio?: (itemId: number) => Promise<void>
  audioGenerationStatus?: Map<number, AudioGenerationStatus>
  currentPlayingId?: number | null
  globalOperations?: {
    onGenerateAll?: () => Promise<void>
    onCalibrateAll?: () => Promise<void>
    onSaveScript?: () => Promise<void>
    onClearAllAudio?: () => Promise<void>
  }
  isAnalyzingCalibration?: boolean
  isCalibrating?: boolean
}

interface EditingCell {
  rowId: number
  field: keyof ScriptItem
}

const DubbingScriptTable: React.FC<DubbingScriptTableProps> = ({
  data = [],
  onChange,
  onGenerateAudio,
  onPlayAudio,
  onPauseAudio,
  onStopAudio,
  onClearSingleAudio,
  audioGenerationStatus = new Map(),
  currentPlayingId = null,
  globalOperations,
  isAnalyzingCalibration = false,
  isCalibrating = false
}) => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // 自动聚焦编辑输入框
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

  // 开始编辑单元格
  const startEditing = useCallback((rowId: number, field: keyof ScriptItem) => {
    const item = data.find(item => item._id === rowId)
    if (item) {
      setEditingCell({ rowId, field })
      setEditValue(String(item[field] || ''))
    }
  }, [data])

  // 保存编辑
  const saveEdit = useCallback(() => {
    if (!editingCell) return

    const newData = data.map(item => {
      if (item._id !== editingCell.rowId) return item

      // 对于数字字段进行转换
      let value: any = editValue
      if (editingCell.field === 'start' || editingCell.field === 'end') {
        value = Number(editValue)
      }

      return { ...item, [editingCell.field]: value }
    })

    onChange(newData)
    setEditingCell(null)
    setEditValue('')
  }, [editingCell, editValue, data, onChange])

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingCell) return

    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        saveEdit()
        break
      case 'Escape':
        e.preventDefault()
        cancelEdit()
        break
      case 'Tab':
        e.preventDefault()
        saveEdit()
        break
    }
  }, [editingCell, saveEdit, cancelEdit])

  // 添加新行
  const addNewRow = useCallback(() => {
    const newId = Math.max(0, ...data.map(item => item._id)) + 1
    const newItem: ScriptItem = {
      _id: newId,
      text: '新解说词',
      start: 0,
      end: 5,
      org: ''
    }
    onChange([...data, newItem])
  }, [data, onChange])

  // 删除行
  const deleteRow = useCallback((rowId: number) => {
    const newData = data.filter(item => item._id !== rowId)
    onChange(newData)
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
  }, [data, onChange])

  // 生成音频
  const handleGenerateAudio = useCallback(async (item: ScriptItem) => {
    if (!onGenerateAudio) return

    // 从最新的数据中获取当前项，确保使用最新内容
    const currentItem = data.find(d => d._id === item._id) || item
    const narrationText = (currentItem.text || currentItem.narration || '').trim()

    if (!narrationText) return

    await onGenerateAudio(currentItem._id, narrationText)
  }, [onGenerateAudio, data])

  // 播放音频
  const handlePlayAudio = useCallback((item: ScriptItem) => {
    if (onPlayAudio && item.audio_url) {
      onPlayAudio(item._id, item.audio_url)
    }
  }, [onPlayAudio])

  // 暂停音频
  const handlePauseAudio = useCallback(() => {
    if (onPauseAudio) {
      onPauseAudio()
    }
  }, [onPauseAudio])

  // 停止音频
  const handleStopAudio = useCallback(() => {
    if (onStopAudio) {
      onStopAudio()
    }
  }, [onStopAudio])

  // 渲染音频状态图标
  const renderAudioStatus = (item: ScriptItem) => {
    // 判断是否为原片(text为空且org不为空)
    const isOriginal = (!item.text || item.text.trim() === '') && (item.org && item.org.trim() !== '')

    if (isOriginal) {
      return (
        <Tooltip label="原片音频">
          <Badge variant="light" color="blue" leftSection={<SpeakerWaveIcon width={14} height={14} />}>
            原片
          </Badge>
        </Tooltip>
      )
    }

    const status = audioGenerationStatus.get(item._id)

    if (status?.status === 'generating') {
      return (
        <Badge variant="light" color="yellow" leftSection={<Loader size={12} color="yellow" />}>
          生成中
        </Badge>
      )
    }

    if (status?.status === 'uploading') {
      return (
        <Badge variant="light" color="blue" leftSection={<Loader size={12} color="blue" />}>
          保存中
        </Badge>
      )
    }

    if (status?.status === 'failed') {
      return (
        <Tooltip label={`生成失败: ${status.error || '未知错误'}`}>
          <Badge variant="light" color="red" leftSection={<ExclamationTriangleIcon width={14} height={14} />}>
            失败
          </Badge>
        </Tooltip>
      )
    }

    // 检查音频URL(支持 audio_url 和 audio 字段)
    const hasAudio = item.audio_url || item.audio
    if (hasAudio) {
      const audioDuration = item.duration ?? (item as { audio_duration?: number }).audio_duration ?? null
      const formattedDuration = formatAudioDuration(audioDuration)
      return (
        <Tooltip label={formattedDuration ? `音频已生成 · ${formattedDuration}` : '音频已生成'}>
          <Badge variant="light" color="green" leftSection={<CheckCircleIcon width={14} height={14} />}>
            {formattedDuration || '完成'}
          </Badge>
        </Tooltip>
      )
    }

    return (
      <Tooltip label="待生成音频">
        <Badge variant="light" color="gray" leftSection={<ExclamationTriangleIcon width={14} height={14} />}>
          待生成
        </Badge>
      </Tooltip>
    )
  }

  // 删除单个音频
  const handleClearSingleAudio = useCallback(async (item: ScriptItem) => {
    const hasAudio = item.audio_url || item.audio
    if (onClearSingleAudio && hasAudio) {
      await onClearSingleAudio(item._id)
    }
  }, [onClearSingleAudio])

  // 渲染音频操作按钮
  const renderAudioActions = (item: ScriptItem) => {
    // 判断是否为原片(text为空且org不为空)
    const isOriginal = (!item.text || item.text.trim() === '') && (item.org && item.org.trim() !== '')

    if (isOriginal) {
      return (
        <Text size="xs" c="var(--app-muted)" ta="center">
          原片
        </Text>
      )
    }

    const status = audioGenerationStatus.get(item._id)
    const isGenerating = status?.status === 'generating'
    const isUploading = status?.status === 'uploading'
    const isPlaying = currentPlayingId === item._id
    const hasAudio = item.audio_url || item.audio

    const actionTitle = hasAudio
      ? '重新生成音频'
      : status?.status === 'failed'
        ? '重试生成音频'
        : '生成音频'

    return (
      <Group gap={4} justify="center" wrap="nowrap">
        {hasAudio && (
          <ActionIcon
            variant="subtle"
            color="blue"
            onClick={() => isPlaying ? handlePauseAudio() : handlePlayAudio(item)}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <PauseIcon width={16} height={16} />
            ) : (
              <PlayIcon width={16} height={16} />
            )}
          </ActionIcon>
        )}

        <ActionIcon
          variant="subtle"
          color="brand"
          onClick={() => {
            // 确保使用最新的数据项
            const currentItem = data.find(d => d._id === item._id) || item
            handleGenerateAudio(currentItem)
          }}
          disabled={isGenerating || isUploading}
          loading={isGenerating || isUploading}
          title={actionTitle}
        >
          <ArrowPathIcon width={16} height={16} />
        </ActionIcon>

        {hasAudio && (
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={() => handleClearSingleAudio(item)}
            title="删除音频"
          >
            <TrashIcon width={16} height={16} />
          </ActionIcon>
        )}

        {isPlaying && (
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={handleStopAudio}
            title="停止"
          >
            <StopIcon width={16} height={16} />
          </ActionIcon>
        )}
      </Group>
    )
  }

  // 渲染编辑器
  const renderEditor = (item: ScriptItem, field: keyof ScriptItem) => {
    if (editingCell?.rowId !== item._id || editingCell?.field !== field) {
      return null
    }

    // 文本区域字段
    if (field === 'org' || field === 'text') {
      return (
        <Textarea
          ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={saveEdit}
          autosize
          minRows={2}
          rows={2}
        />
      )
    }

    // 数字字段 (开始时间、结束时间)
    return (
      <TextInput
        ref={editInputRef as React.RefObject<HTMLInputElement>}
        value={editValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={saveEdit}
        type={(field === 'start' || field === 'end') ? 'number' : 'text'}
        step={(field === 'start' || field === 'end') ? '0.001' : undefined}
      />
    )
  }

  // 渲染单元格内容
  const renderCellContent = (item: ScriptItem, field: keyof ScriptItem) => {
    if (editingCell?.rowId === item._id && editingCell?.field === field) {
      return renderEditor(item, field)
    }

    const value = item[field]

    // 格式化显示值
    let displayValue = ''
    if (field === 'start' || field === 'end') {
      displayValue = value ? String(Number(value).toFixed(2)) + 's' : '0.00s'
    } else {
      displayValue = String(value || '')
    }

    return (
      <Box
        onClick={() => startEditing(item._id, field)}
        title="点击编辑"
        p="xs"
        style={{
          minHeight: 36,
          cursor: 'pointer',
          borderRadius: 'var(--mantine-radius-sm)',
          transition: 'background-color var(--app-transition)',
        }}
      >
        <Text size="sm" lineClamp={field === 'org' || field === 'text' ? 3 : 1}>
          {displayValue}
        </Text>
      </Box>
    )
  }

  // 统计数据
  // 判断解说片段:text不为空且不是原片
  const narrativeItems = data.filter(item => {
    const hasNarration = item.text && item.text.trim() !== ''
    const isOriginal = (!item.text || item.text.trim() === '') && (item.org && item.org.trim() !== '')
    return hasNarration && !isOriginal
  })
  const completedItems = narrativeItems.filter(item => item.audio_url || item.audio)
  const pendingItems = narrativeItems.filter(item => !item.audio_url && !item.audio)

  return (
    <WorkflowPanel>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" gap="lg">
          <Stack gap={6}>
            <Text fw={700} size="lg">配音脚本</Text>
            <Group gap="xs">
              <Badge variant="light" color="gray">共 {data.length} 项</Badge>
              <Badge variant="light" color="blue">解说 {narrativeItems.length}</Badge>
              <Badge variant="light" color="green">已配音 {completedItems.length}</Badge>
              <Badge variant="light" color="yellow">待配音 {pendingItems.length}</Badge>
            </Group>
          </Stack>

          <Group gap="sm" justify="flex-end">
          {globalOperations && (
            <>
              {pendingItems.length > 0 && (
                <Button
                  color="brand"
                  size="md"
                  onClick={globalOperations.onGenerateAll}
                  title="一键批量生成所有解说片段的音频"
                  aria-label="批量生成所有解说片段的音频"
                  leftSection={<SpeakerWaveIcon width={18} height={18} />}
                >
                  生成全部音频
                </Button>
              )}

              {completedItems.length > 0 && (
                <Button
                  variant="outline"
                  color="brand"
                  size="md"
                  onClick={globalOperations.onCalibrateAll}
                  disabled={isAnalyzingCalibration || isCalibrating}
                  title="校准时间戳：根据音频时长自动微调解说片段的开始和结束时间，确保画面、字幕与解说严格同步。建议在批量生成音频后运行此步骤。"
                  aria-label="校准时间戳，确保画面字幕与解说音频同步"
                  loading={isAnalyzingCalibration || isCalibrating}
                  leftSection={<ArrowPathIcon width={18} height={18} />}
                >
                  {isAnalyzingCalibration ? '分析中...' : isCalibrating ? '校准中...' : '校准时间戳'}
                </Button>
              )}

              <Button
                variant="subtle"
                color="green"
                size="sm"
                onClick={globalOperations.onSaveScript}
                leftSection={<CheckCircleIcon width={16} height={16} />}
              >
                保存脚本
              </Button>

              {completedItems.length > 0 && (
                <Button
                  variant="subtle"
                  color="red"
                  size="sm"
                  onClick={globalOperations.onClearAllAudio}
                  leftSection={<TrashIcon width={16} height={16} />}
                >
                  清理音频
                </Button>
              )}
            </>
          )}

          <Button
            variant="subtle"
            color="brand"
            size="sm"
            onClick={addNewRow}
            leftSection={<PlusIcon width={16} height={16} />}
          >
            添加
          </Button>
          </Group>
        </Group>

        <ScrollArea type="auto">
          <Table striped highlightOnHover verticalSpacing="sm" miw={1120}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={48}>
                  <Checkbox
                  aria-label="选择所有脚本行"
                  checked={selectedRows.size === data.length && data.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRows(new Set(data.map(item => item._id)))
                    } else {
                      setSelectedRows(new Set())
                    }
                  }}
                />
                </Table.Th>
                <Table.Th w={64}>序号</Table.Th>
                <Table.Th w={110}>开始时间</Table.Th>
                <Table.Th w={110}>结束时间</Table.Th>
                <Table.Th>原始字幕</Table.Th>
                <Table.Th>解说词</Table.Th>
                <Table.Th w={120}>音频状态</Table.Th>
                <Table.Th w={140}>音频操作</Table.Th>
                <Table.Th w={80}>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
            {data.map((item, index) => {
              // 判断是否为原片(text为空且org不为空)
              const isOriginal = (!item.text || item.text.trim() === '') && (item.org && item.org.trim() !== '')

              return (
                <Table.Tr
                  key={item._id}
                  style={{
                    borderLeft: `3px solid ${!isOriginal ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-blue-6)'}`,
                    background: selectedRows.has(item._id) ? 'var(--app-brand-soft-bg)' : undefined,
                  }}
                >
                  <Table.Td>
                    <Checkbox
                      aria-label={`选择第 ${index + 1} 行`}
                      checked={selectedRows.has(item._id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedRows)
                        if (e.target.checked) {
                          newSelected.add(item._id)
                        } else {
                          newSelected.delete(item._id)
                        }
                        setSelectedRows(newSelected)
                      }}
                    />
                  </Table.Td>

                  <Table.Td>{index + 1}</Table.Td>

                  <Table.Td>
                    {renderCellContent(item, 'start')}
                  </Table.Td>

                  <Table.Td>
                    {renderCellContent(item, 'end')}
                  </Table.Td>

                  <Table.Td>
                    {renderCellContent(item, 'org')}
                  </Table.Td>

                  <Table.Td>
                    {renderCellContent(item, 'text')}
                  </Table.Td>

                  <Table.Td>
                    {renderAudioStatus(item)}
                  </Table.Td>

                  <Table.Td>
                    {renderAudioActions(item)}
                  </Table.Td>

                  <Table.Td>
                    <Group justify="center">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => deleteRow(item._id)}
                        title="删除"
                      >
                        <TrashIcon width={16} height={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              )
            })}
            </Table.Tbody>
          </Table>
        </ScrollArea>

      {data.length === 0 && (
        <Stack align="center" gap="md" py="xl">
          <Text c="var(--app-muted)">还没有脚本数据</Text>
          <Button
            variant="outline"
            color="brand"
            onClick={addNewRow}
            leftSection={<PlusIcon width={16} height={16} />}
          >
            添加第一项
          </Button>
        </Stack>
      )}
      </Stack>
    </WorkflowPanel>
  )
}

export default DubbingScriptTable
