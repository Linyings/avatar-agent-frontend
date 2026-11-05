import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { ActionIcon, Alert, Button, Code, Group, Modal, Popover, Progress, Stack, Text, TextInput } from '@mantine/core'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  FolderOpenIcon,
  InformationCircleIcon
} from '@/shared/icons/tabler'
import {
  checkCompatibility,
  requestDirectoryHandle,
  type ExportProgress
} from '@/features/projects/services/capcut'
import type { ExportStrategy } from '@/features/projects/services/capcut/types'

// localStorage key for caching draft path
const DRAFT_PATH_STORAGE_KEY = 'capcut_draft_path'

interface CapcutExportModalProps {
  isOpen: boolean
  onClose: () => void
  /** 现有的视频文件（必需） */
  existingVideoFile?: File
  /** 导出回调 */
  onExport: (
    videoFile: File,
    draftPath: string,
    dirHandle?: FileSystemDirectoryHandle,
    onProgress?: (progress: ExportProgress) => void
  ) => Promise<void>
  desktopDirectory?: {
    path: string
    loading?: boolean
    error?: string | null
    resultPath?: string | null
    onSelect(): Promise<string | null>
    onReveal?(path: string): Promise<void>
  }
}

const formatDesktopActionError = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error) || !error.message.trim()) return fallback
  return /[\u3400-\u9fff]/.test(error.message)
    ? error.message
    : `${fallback}：${error.message}`
}

const CapcutExportModal: React.FC<CapcutExportModalProps> = ({
  isOpen,
  onClose,
  existingVideoFile,
  onExport,
  desktopDirectory
}) => {
  const [draftPath, setDraftPath] = useState<string>(() => {
    // 从 localStorage 读取缓存的路径
    try {
      return localStorage.getItem(DRAFT_PATH_STORAGE_KEY) || ''
    } catch (error) {
      console.error('Failed to load draft path from localStorage:', error)
      return ''
    }
  })
  const [isExporting, setIsExporting] = useState(false)
  const [isRevealing, setIsRevealing] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [exportStrategy, setExportStrategy] = useState<ExportStrategy>('filesystem')
  const [capabilityMessage, setCapabilityMessage] = useState<string>('')
  const [capabilityWarnings, setCapabilityWarnings] = useState<string[]>([])
  const isOpenRef = useRef(isOpen)
  const sessionGenerationRef = useRef(0)
  const operationGenerationRef = useRef(0)
  const isDesktopMode = desktopDirectory !== undefined
  const effectiveDraftPath = isDesktopMode ? desktopDirectory.path : draftPath

  const isCurrentOperation = useCallback((session: number, operation: number) => (
    isOpenRef.current
    && sessionGenerationRef.current === session
    && operationGenerationRef.current === operation
  ), [])

  useLayoutEffect(() => {
    isOpenRef.current = isOpen
    sessionGenerationRef.current += 1
    operationGenerationRef.current += 1
    setIsExporting(false)
    setIsRevealing(false)
    setProgress(null)
    setError(null)
    setSuccess(null)
  }, [isOpen])

  // 检测浏览器能力和导出策略
  useEffect(() => {
    if (isDesktopMode) {
      setExportStrategy('filesystem')
      setCapabilityMessage('桌面端将直接写入已配置的剪映草稿目录')
      setCapabilityWarnings([])
      setError(null)
      return
    }

    if (isOpen && existingVideoFile) {
      const capability = checkCompatibility(existingVideoFile.size)
      setExportStrategy(capability.strategy)
      setCapabilityMessage(capability.message)
      setCapabilityWarnings(capability.limitations || [])

      // 如果是阻断策略，立即显示错误
      if (capability.strategy === 'blocked') {
        setError(capability.limitations?.join('\n') || '无法导出')
      } else {
        // 清除之前的错误
        setError(null)
      }
    }
  }, [isDesktopMode, isOpen, existingVideoFile])

  useEffect(() => {
    if (isOpen && desktopDirectory?.error) setError(desktopDirectory.error)
  }, [isOpen, desktopDirectory?.error])

  // 当路径变化时，自动保存到 localStorage
  useEffect(() => {
    if (!isDesktopMode && draftPath.trim()) {
      try {
        localStorage.setItem(DRAFT_PATH_STORAGE_KEY, draftPath.trim())
      } catch (error) {
        console.error('Failed to save draft path to localStorage:', error)
      }
    }
  }, [draftPath, isDesktopMode])

  // 处理导出
  const handleExport = useCallback(async () => {
    if (!existingVideoFile) {
      setError('缺少视频文件，请先准备原始视频')
      return
    }

    // 阻断策略不允许导出
    if (!isDesktopMode && exportStrategy === 'blocked') {
      return
    }

    const trimmedDraftPath = effectiveDraftPath.trim()

    if (!trimmedDraftPath) {
      setError('请输入剪映草稿目录的绝对路径')
      return
    }

    setIsExporting(true)
    setError(null)
    setSuccess(null)
    setProgress(null)
    const session = sessionGenerationRef.current
    const operation = operationGenerationRef.current + 1
    operationGenerationRef.current = operation
    const reportProgress = (nextProgress: ExportProgress) => {
      if (isCurrentOperation(session, operation)) setProgress(nextProgress)
    }

    try {
      // File System API 模式：立即请求文件夹（必须在用户手势上下文中）
      let dirHandle: FileSystemDirectoryHandle | undefined

      if (!isDesktopMode && exportStrategy === 'filesystem') {
        try {
          dirHandle = await requestDirectoryHandle()
        } catch (err) {
          if (isCurrentOperation(session, operation)) {
            console.error('文件夹选择失败:', err)
            setError(err instanceof Error ? err.message : '文件夹选择失败')
            setIsExporting(false)
          }
          return
        }
      }

      // 调用导出（现在已经有了 dirHandle）
      await onExport(existingVideoFile, trimmedDraftPath, dirHandle, reportProgress)

      if (!isCurrentOperation(session, operation)) return

      // 根据策略设置成功消息
      if (exportStrategy === 'filesystem') {
        setSuccess('✅ 草稿已创建完成，可直接在剪映中打开！')
      } else {
        setSuccess('✅ ZIP 文件已下载，请解压到剪映草稿目录')
      }
    } catch (err) {
      if (isCurrentOperation(session, operation)) {
        console.error('导出失败:', err)
        setError(err instanceof Error ? err.message : '导出失败，请重试')
      }
    } finally {
      if (isCurrentOperation(session, operation)) {
        setIsExporting(false)
        setProgress(null)
      }
    }
  }, [existingVideoFile, exportStrategy, effectiveDraftPath, isCurrentOperation, isDesktopMode, onExport])

  const handleSelectDesktopDirectory = useCallback(async () => {
    if (!desktopDirectory) return
    const session = sessionGenerationRef.current
    const operation = operationGenerationRef.current + 1
    operationGenerationRef.current = operation
    setError(null)
    try {
      await desktopDirectory.onSelect()
    } catch (error) {
      if (isCurrentOperation(session, operation)) {
        setError(formatDesktopActionError(error, '选择剪映草稿目录失败'))
      }
    }
  }, [desktopDirectory, isCurrentOperation])

  const handleRevealDesktopResult = useCallback(async () => {
    const resultPath = desktopDirectory?.resultPath
    if (!resultPath || !desktopDirectory.onReveal) return
    const session = sessionGenerationRef.current
    const operation = operationGenerationRef.current + 1
    operationGenerationRef.current = operation
    setError(null)
    setIsRevealing(true)
    try {
      await desktopDirectory.onReveal(resultPath)
    } catch (error) {
      if (isCurrentOperation(session, operation)) {
        setError(formatDesktopActionError(error, '在文件夹中显示失败'))
      }
    } finally {
      if (isCurrentOperation(session, operation)) setIsRevealing(false)
    }
  }, [desktopDirectory, isCurrentOperation])

  // 重置状态
  const handleClose = useCallback(() => {
    if (!isExporting) {
      operationGenerationRef.current += 1
      setProgress(null)
      setError(null)
      setSuccess(null)
      setIsRevealing(false)
      onClose()
    }
  }, [isExporting, onClose])

  const strategyLabel =
    exportStrategy === 'filesystem'
      ? '直接创建草稿'
      : exportStrategy === 'zip'
        ? '下载 ZIP 后导入'
        : '当前浏览器无法导出'
  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      size="lg"
      closeOnClickOutside={!isExporting}
      closeOnEscape={!isExporting}
      withCloseButton={!isExporting}
      title={
        <Group gap="xs">
          <Text fw={700}>导出到剪映草稿</Text>
          <Popover width={460} position="bottom-start" withArrow shadow="lg">
            <Popover.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                radius="xl"
                size="sm"
                aria-label="查看导出说明"
              >
                ?
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="sm">
                <Group gap="xs">
                  <InformationCircleIcon width={18} height={18} />
                  <Text fw={700}>导出说明</Text>
                </Group>

                <Stack gap={4}>
                  <Text size="sm" fw={700}>当前方式：{strategyLabel}</Text>
                  {capabilityMessage && <Text size="sm">{capabilityMessage}</Text>}
                  {capabilityWarnings.length > 0 && (
                    <Stack gap={2}>
                      {capabilityWarnings.map((warning, idx) => (
                        <Text size="sm" c="dimmed" key={idx}>- {warning}</Text>
                      ))}
                    </Stack>
                  )}
                </Stack>

                <Stack gap={4}>
                  <Text size="sm" fw={700}>导出流程</Text>
                  <Text size="sm">1. 系统使用当前项目视频、解说音频和背景音乐素材，无需重新上传。</Text>
                  <Text size="sm">2. 剪映要求草稿内记录素材绝对路径；浏览器无法读取文件夹选择器返回的本机路径。</Text>
                  <Text size="sm">3. 输入框中的绝对路径会写入 JSON 素材路径；点击“开始导出”选择的目录用于实际写入草稿文件。</Text>
                  <Text size="sm">4. ZIP 模式下，请把下载的压缩包解压到剪映草稿目录后再导入。</Text>
                </Stack>

                <Stack gap={4}>
                  <Text size="sm" fw={700}>常见草稿目录</Text>
                  <Text size="xs" fw={700}>Windows</Text>
                  <Code block>C:\Users\用户名\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft</Code>
                  <Text size="xs" fw={700}>macOS</Text>
                  <Code block>/Users/用户名/Movies/JianyingPro/User Data/Projects/com.lveditor.draft</Code>
                </Stack>

                <Text size="sm" c="dimmed">
                  如果剪映提示素材丢失，请确认已填写路径、文件夹选择器选中的目录、剪映桌面端实际草稿目录三者一致。
                </Text>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </Group>
      }
    >
      <Stack gap="md">
      {existingVideoFile && (
        <Text size="sm" c="dimmed" truncate>
          视频素材：{existingVideoFile.name}
        </Text>
      )}

      {!existingVideoFile && (
        <Alert color="red" variant="light" icon={<ExclamationCircleIcon width={18} height={18} />}>
          缺少视频文件，请先准备原始视频
        </Alert>
      )}

      <TextInput
        type="text"
        label="剪映草稿目录路径"
        value={effectiveDraftPath}
        onChange={(event) => {
          if (!isDesktopMode) setDraftPath(event.currentTarget.value)
        }}
        placeholder="粘贴剪映草稿目录绝对路径"
        disabled={isExporting || desktopDirectory?.loading}
        readOnly={isDesktopMode}
        leftSection={<FolderOpenIcon width={18} height={18} />}
        description={
          isDesktopMode
            ? '桌面端会将草稿直接写入此目录，无需再次授权浏览器文件夹。'
            : exportStrategy === 'filesystem'
            ? 'JSON 中记录的素材路径会使用这里填写的绝对路径；点击导出时选择的文件夹负责实际写入草稿文件，请保持二者一致。'
            : 'JSON 中记录的素材路径会使用这里填写的绝对路径；ZIP 下载后请解压到同一个草稿目录。'
        }
        styles={{ input: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
      />

      {desktopDirectory && (
        <Button
          type="button"
          variant="light"
          size="xs"
          leftSection={<FolderOpenIcon width={16} height={16} />}
          loading={desktopDirectory.loading}
          disabled={isExporting || !!success}
          onClick={() => void handleSelectDesktopDirectory()}
          style={{ alignSelf: 'flex-start' }}
        >
          更换目录
        </Button>
      )}

      {desktopDirectory?.resultPath && (
        <Stack gap="xs">
          <Text size="sm" fw={700}>剪映草稿已保存到</Text>
          <Code block style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
            {desktopDirectory.resultPath}
          </Code>
          {desktopDirectory.onReveal && (
            <Button
              type="button"
              variant="light"
              size="xs"
              leftSection={<FolderOpenIcon width={16} height={16} />}
              loading={isRevealing}
              disabled={isExporting}
              onClick={() => void handleRevealDesktopResult()}
              style={{ alignSelf: 'flex-start' }}
            >
              在文件夹中显示
            </Button>
          )}
        </Stack>
      )}

      {isExporting && progress && (
        <Stack gap="xs">
          <Group justify="space-between" mb="xs">
            <Text size="sm">{progress.message}</Text>
            <Text size="sm" fw={700}>{progress.progress}%</Text>
          </Group>
          <Progress value={progress.progress} color="brand" />
          {progress.currentItem && progress.totalItems && (
            <Text size="sm" c="dimmed" mt="xs">
              {progress.currentItem} / {progress.totalItems}
            </Text>
          )}
        </Stack>
      )}

      {error && (
        <Alert color="red" variant="light" icon={<ExclamationCircleIcon width={18} height={18} />}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert color="green" variant="light" icon={<CheckCircleIcon width={18} height={18} />}>
          {success}
        </Alert>
      )}

      <Group justify="flex-end" gap="sm">
        <Button type="button" variant="outline" onClick={handleClose} disabled={isExporting}>
          {success ? '关闭' : '取消'}
        </Button>
        <Button
          type="button"
          onClick={handleExport}
          loading={isExporting}
          disabled={
            isExporting ||
            !existingVideoFile ||
            (!isDesktopMode && exportStrategy === 'blocked') ||
            desktopDirectory?.loading ||
            !effectiveDraftPath.trim() ||
            !!success
          }
        >
          {isExporting
            ? '导出中...'
            : exportStrategy === 'blocked'
            ? '无法导出'
            : '开始导出'}
        </Button>
      </Group>
      </Stack>
    </Modal>
  )
}

export default CapcutExportModal
