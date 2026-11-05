import { frameWorkflowSteps } from '@/features/projects/workflow/frame'
import type { FrameDebugRun } from '@/features/projects/workflow/frame'
import { buildFrameWorkflowProgressItems } from './frameWorkflowProgressItems'

const makeRun = (records: FrameDebugRun['records']): FrameDebugRun => ({
  id: 'run-stale-active-step',
  projectId: 'project-1',
  mode: 'dry-run',
  status: 'running',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  records,
})

describe('buildFrameWorkflowProgressItems', () => {
  it('uses the authoritative active step when an earlier raw running record is stale', () => {
    const run = makeRun({
      'merge-videos': {
        id: 'merge-videos',
        status: 'running',
        progress: { percentage: 92, message: '旧的合并进度' },
      },
      'extract-audio': {
        id: 'extract-audio',
        status: 'running',
        progress: { percentage: 45, message: '正在提取音频' },
      },
    })

    const items = buildFrameWorkflowProgressItems(
      run,
      'extract-audio',
      frameWorkflowSteps,
      record => typeof record?.progress?.message === 'string'
        ? record.progress.message
        : undefined,
    )

    expect(items.filter(item => item.status === 'running').map(item => item.id)).toEqual([
      'extract-audio',
    ])
    expect(items[0]).toMatchObject({
      id: 'merge-videos',
      status: 'pending',
      progress: undefined,
      message: undefined,
    })
    expect(items[1]).toMatchObject({
      id: 'extract-audio',
      status: 'running',
      progress: 45,
      message: '正在提取音频',
    })
  })
})
