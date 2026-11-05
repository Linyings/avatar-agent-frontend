import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_NAME,
  buildAutoProjectNameUpdate,
  deriveProjectNameFromFileName,
  getEditableProjectVideoName,
  isAutoNamedProject,
} from './projectNaming'

describe('projectNaming', () => {
  it('从上传视频文件名推导项目名称', () => {
    expect(deriveProjectNameFromFileName('旅行素材.mp4')).toBe('旅行素材')
    expect(deriveProjectNameFromFileName('  demo.final.mov  ')).toBe('demo.final')
    expect(deriveProjectNameFromFileName('')).toBe(DEFAULT_PROJECT_NAME)
  })

  it('识别自动命名项目，避免创建时占位名进入编辑态', () => {
    expect(isAutoNamedProject({
      name: DEFAULT_PROJECT_NAME,
      metadata: { auto_name_from_video: true },
    })).toBe(true)

    expect(getEditableProjectVideoName({
      name: DEFAULT_PROJECT_NAME,
      metadata: { auto_name_from_video: true },
    })).toBe('')

    expect(isAutoNamedProject({
      name: '手动命名',
      metadata: { auto_name_from_video: false },
    })).toBe(false)
  })

  it('构建同步视频文件名的项目更新载荷', () => {
    expect(buildAutoProjectNameUpdate({
      metadata: { inference_mode: 'deep' },
    }, '短剧混剪.mp4')).toEqual({
      name: '短剧混剪',
      metadata: {
        inference_mode: 'deep',
        auto_name_from_video: true,
        source_video_filename: '短剧混剪.mp4',
      },
    })
  })
})
