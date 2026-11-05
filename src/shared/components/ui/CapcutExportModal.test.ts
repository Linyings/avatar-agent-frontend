import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { MantineProvider } from '@mantine/core'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestDirectoryHandle } from '@/features/projects/services/capcut'
import type { ExportProgress } from '@/features/projects/services/capcut/types'
import CapcutExportModal from './CapcutExportModal'

vi.mock('@/features/projects/services/capcut', () => ({
  checkCompatibility: () => ({
    strategy: 'filesystem',
    message: '支持直接创建草稿',
    limitations: []
  }),
  requestDirectoryHandle: vi.fn()
}))

const readModal = () => readFileSync(
  resolve(process.cwd(), 'src/shared/components/ui/CapcutExportModal.tsx'),
  'utf8'
)

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('CapcutExportModal layout', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('keeps guidance behind the help button and removes the old heavy cards', () => {
    const content = readModal()

    expect(content).toContain('<Popover.Target>')
    expect(content).toContain('aria-label="查看导出说明"')
    expect(content).toContain('<Popover.Dropdown>')
    expect(content).toContain('导出流程')
    expect(content).toContain('常见草稿目录')
    expect(content).toContain('剪映要求草稿内记录素材绝对路径')
    expect(content).toContain('JSON 中记录的素材路径会使用这里填写的绝对路径')

    expect(content).not.toContain('const shouldShowDraftPathInput')
    expect(content).not.toContain('{shouldShowDraftPathInput && (')
    expect(content).not.toContain('Badge')
    expect(content).not.toContain('Paper')
    expect(content).not.toContain('<details>')
    expect(content).not.toContain('自动选择文件夹')
    expect(content).not.toContain('导入剪映小贴士')
    expect(content).not.toContain('如何快速找到剪映草稿目录？')
  })

  it('shows the cached draft path in filesystem mode and keeps it editable', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'capcut_draft_path',
      '/Users/test/Movies/JianyingPro/User Data/Projects/com.lveditor.draft'
    )

    render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, {
          isOpen: true,
          onClose: vi.fn(),
          existingVideoFile: new File(['video'], 'demo.mp4', { type: 'video/mp4' }),
          onExport: vi.fn()
        })
      )
    )

    const draftPathInput = screen.getByLabelText('剪映草稿目录路径')
    expect(draftPathInput).toHaveValue('/Users/test/Movies/JianyingPro/User Data/Projects/com.lveditor.draft')

    await user.clear(draftPathInput)
    await user.type(draftPathInput, '/Users/test/Movies/JianyingPro/User Data/Projects/custom.draft')

    expect(draftPathInput).toHaveValue('/Users/test/Movies/JianyingPro/User Data/Projects/custom.draft')
  })

  it('keeps browser export using the File System Access directory picker', async () => {
    const user = userEvent.setup()
    const directoryHandle = { name: 'draft-root' } as FileSystemDirectoryHandle
    const onExport = vi.fn().mockResolvedValue(undefined)
    const videoFile = new File(['video'], 'demo.mp4', { type: 'video/mp4' })
    localStorage.setItem('capcut_draft_path', 'D:\\BrowserDrafts')
    vi.mocked(requestDirectoryHandle).mockResolvedValue(directoryHandle)

    render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, {
          isOpen: true,
          onClose: vi.fn(),
          existingVideoFile: videoFile,
          onExport
        })
      )
    )

    await user.click(screen.getByRole('button', { name: '开始导出' }))

    expect(requestDirectoryHandle).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledWith(
      videoFile,
      'D:\\BrowserDrafts',
      directoryHandle,
      expect.any(Function)
    )
  })

  it('uses the controlled native directory without opening the browser directory picker', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn().mockResolvedValue('D:\\JianyingDrafts')
    const onExport = vi.fn().mockResolvedValue(undefined)
    const videoFile = new File([], 'demo.mp4', { type: 'video/mp4' })

    render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, {
          isOpen: true,
          onClose: vi.fn(),
          existingVideoFile: videoFile,
          onExport,
          desktopDirectory: {
            path: 'D:\\JianyingDrafts',
            onSelect
          }
        })
      )
    )

    const draftPathInput = screen.getByLabelText('剪映草稿目录路径')
    expect(draftPathInput).toHaveValue('D:\\JianyingDrafts')
    expect(draftPathInput).toHaveAttribute('readonly')

    await user.click(screen.getByRole('button', { name: '更换目录' }))
    expect(onSelect).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '开始导出' }))
    expect(onExport).toHaveBeenCalledWith(
      videoFile,
      'D:\\JianyingDrafts',
      undefined,
      expect.any(Function)
    )
    expect(requestDirectoryHandle).not.toHaveBeenCalled()
  })

  it('disables native export while the directory is loading or missing', () => {
    const { rerender } = render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, {
          isOpen: true,
          onClose: vi.fn(),
          existingVideoFile: new File([], 'demo.mp4', { type: 'video/mp4' }),
          onExport: vi.fn(),
          desktopDirectory: { path: '', loading: true, onSelect: vi.fn() }
        })
      )
    )

    expect(screen.getByRole('button', { name: '开始导出' })).toBeDisabled()

    rerender(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, {
          isOpen: true,
          onClose: vi.fn(),
          existingVideoFile: new File([], 'demo.mp4', { type: 'video/mp4' }),
          onExport: vi.fn(),
          desktopDirectory: { path: '', onSelect: vi.fn() }
        })
      )
    )

    expect(screen.getByRole('button', { name: '开始导出' })).toBeDisabled()
  })

  it('shows native directory selection failures inside the modal', async () => {
    const user = userEvent.setup()

    render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, {
          isOpen: true,
          onClose: vi.fn(),
          existingVideoFile: new File([], 'demo.mp4', { type: 'video/mp4' }),
          onExport: vi.fn(),
          desktopDirectory: {
            path: 'D:\\JianyingDrafts',
            onSelect: vi.fn().mockRejectedValue(new Error('picker failed'))
          }
        })
      )
    )

    await user.click(screen.getByRole('button', { name: '更换目录' }))

    expect(await screen.findByText('选择剪映草稿目录失败：picker failed')).toBeVisible()
  })

  it('shows external native errors and exposes the successful draft path for manual reveal', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn().mockRejectedValue(new Error('reveal failed'))
    const resultPath = 'D:\\JianyingDrafts\\11111111-1111-4111-8111-111111111111'

    render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, {
          isOpen: true,
          onClose: vi.fn(),
          existingVideoFile: new File([], 'demo.mp4', { type: 'video/mp4' }),
          onExport: vi.fn(),
          desktopDirectory: {
            path: 'D:\\JianyingDrafts',
            error: '剪映草稿目录检测失败，请手动选择',
            resultPath,
            onSelect: vi.fn(),
            onReveal
          }
        })
      )
    )

    expect(screen.getByText('剪映草稿目录检测失败，请手动选择')).toBeVisible()
    expect(screen.getByText(resultPath)).toBeVisible()

    await user.click(screen.getByRole('button', { name: '在文件夹中显示' }))

    expect(onReveal).toHaveBeenCalledWith(resultPath)
    expect(await screen.findByText('在文件夹中显示失败：reveal failed')).toBeVisible()
  })

  it('ignores a stale export completion and progress after closing and reopening', async () => {
    const user = userEvent.setup()
    const exportOperation = createDeferred<void>()
    let reportProgress: ((progress: ExportProgress) => void) | undefined
    const onExport = vi.fn((
      _videoFile: File,
      _draftPath: string,
      _dirHandle?: FileSystemDirectoryHandle,
      onProgress?: (progress: ExportProgress) => void
    ) => {
      reportProgress = onProgress
      return exportOperation.promise
    })
    const commonProps = {
      onClose: vi.fn(),
      existingVideoFile: new File([], 'demo.mp4', { type: 'video/mp4' }),
      onExport,
      desktopDirectory: {
        path: 'D:\\JianyingDrafts',
        onSelect: vi.fn()
      }
    }
    const { rerender } = render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, { isOpen: true, ...commonProps })
      )
    )

    await user.click(screen.getByRole('button', { name: '开始导出' }))
    rerender(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, { isOpen: false, ...commonProps })
      )
    )
    rerender(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, { isOpen: true, ...commonProps })
      )
    )

    expect(await screen.findByRole('button', { name: '开始导出' })).toBeEnabled()
    await act(async () => {
      reportProgress?.({ stage: 'writing', progress: 75, message: '旧导出进度' })
      exportOperation.resolve()
      await exportOperation.promise
    })

    expect(screen.queryByText('旧导出进度')).not.toBeInTheDocument()
    expect(screen.queryByText('✅ 草稿已创建完成，可直接在剪映中打开！')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始导出' })).toBeEnabled()
  })

  it('ignores a stale reveal failure after closing and reopening', async () => {
    const user = userEvent.setup()
    const revealOperation = createDeferred<void>()
    const resultPath = 'D:\\JianyingDrafts\\draft-id'
    const commonProps = {
      onClose: vi.fn(),
      existingVideoFile: new File([], 'demo.mp4', { type: 'video/mp4' }),
      onExport: vi.fn(),
      desktopDirectory: {
        path: 'D:\\JianyingDrafts',
        resultPath,
        onSelect: vi.fn(),
        onReveal: vi.fn(() => revealOperation.promise)
      }
    }
    const { rerender } = render(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, { isOpen: true, ...commonProps })
      )
    )

    await user.click(screen.getByRole('button', { name: '在文件夹中显示' }))
    rerender(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, { isOpen: false, ...commonProps })
      )
    )
    rerender(
      React.createElement(
        MantineProvider,
        null,
        React.createElement(CapcutExportModal, { isOpen: true, ...commonProps })
      )
    )

    await act(async () => {
      revealOperation.reject(new Error('stale reveal failure'))
      try {
        await revealOperation.promise
      } catch {
        // The component owns this rejection; awaiting only flushes its continuation.
      }
    })

    expect(screen.queryByText('在文件夹中显示失败：stale reveal failure')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '在文件夹中显示' })).toBeEnabled()
  })
})
