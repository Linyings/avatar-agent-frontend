import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { CompositionResultComponent } from './CompositionResult'
import type { CompositionResult } from '@/shared/types'

const renderResult = (result: CompositionResult) => render(
  <MantineProvider>
    <CompositionResultComponent result={result} />
  </MantineProvider>,
)

describe('CompositionResultComponent', () => {
  it('使用合成结果时长初始化预览播放器控制条', () => {
    renderResult({
      success: true,
      videoUrl: 'blob:preview-video',
      duration: 76,
      fileSize: 1024,
    })

    expect(screen.getAllByText('1 分 16 秒')).toHaveLength(2)
  })

  it('浏览器加载到有效媒体时长后同步预览播放器控制条', () => {
    const { container } = renderResult({
      success: true,
      videoUrl: 'blob:preview-video',
      duration: 76,
      fileSize: 1024,
    })

    const video = container.querySelector('video')
    expect(video).not.toBeNull()

    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 90,
    })

    fireEvent.loadedMetadata(video!)

    expect(screen.getAllByText('1 分 30 秒')).toHaveLength(2)
  })
})
