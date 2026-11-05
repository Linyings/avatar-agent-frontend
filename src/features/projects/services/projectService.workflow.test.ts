import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectService from './projectService'

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('ProjectService workflow contract', () => {
  beforeEach(() => {
    localStorage.setItem('auth_access_token', 'test-token')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('creates projects through the same-origin API proxy when no API base URL is configured', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      id: 'local-project-1',
      name: '本地测试项目',
      status: 'draft',
    }))

    await ProjectService.createProject({ name: '本地测试项目' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('saves script through canonical workflow step with revision and dependency hash', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {
        workflow_revision: 7,
        config: { content_hash: 'config-hash' },
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        workflow_revision: 8,
        content_hash: 'script-hash',
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        id: 'project-1',
        name: 'Project',
        status: 'processing',
      }))

    await ProjectService.saveProjectScript('project-1', { items: [{ text: 'hello' }] })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/projects/project-1/workflow')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v1/projects/project-1/workflow/steps/script')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      workflow_revision: 7,
      dependency_hash: 'config-hash',
      data: { items: [{ text: 'hello' }] },
    })
  })

  it('normalizes project list responses from projects, items, or data wrappers', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          items: [
            {
              id: 'project-1',
              name: '深度项目',
              metadata: { inference_mode: 'deep' },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
          has_more: false,
        },
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        projects: [
          {
            id: 'project-2',
            name: '快速项目',
            metadata: { inference_mode: 'shallow' },
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        has_more: false,
      }))

    const wrapped = await ProjectService.getProjects()
    const direct = await ProjectService.getProjects()

    expect(wrapped.projects).toHaveLength(1)
    expect(wrapped.projects[0].metadata?.inference_mode).toBe('deep')
    expect(wrapped.items).toBe(wrapped.projects)
    expect(wrapped.total).toBe(1)
    expect(direct.projects).toHaveLength(1)
    expect(direct.projects[0].metadata?.inference_mode).toBe('shallow')
  })

  it('does not fall back to legacy project update when canonical endpoint is unavailable', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'not found' }))

    await expect(ProjectService.saveProjectSubtitles('project-1', {
      '1': { subtitle: 'fallback', start_time: 0, end_time: 1 },
    })).rejects.toThrow('404')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/projects/project-1/workflow')
  })

  it('does not fall back when workflow save returns a conflict', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {
        workflow_revision: 7,
        config: { content_hash: 'config-hash' },
      }))
      .mockResolvedValueOnce(jsonResponse(409, { message: 'workflow conflict' }))

    await expect(ProjectService.saveProjectScript('project-1', { items: [] })).rejects.toThrow('409')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/workflow/steps/script')
  })

  it('returns per-step save results so callers can refresh revision and hashes', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { workflow_revision: 3 }))
      .mockResolvedValueOnce(jsonResponse(200, {
        workflow_revision: 4,
        content_hash: 'subtitle-hash',
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        workflow_revision: 5,
        content_hash: 'config-hash',
      }))

    const results = await ProjectService.saveWorkflowFields('project-1', {
      subtitle: { '1': { subtitle: 's', start_time: 0, end_time: 1 } },
      video_config: { style_name: 'dramatic' } as any,
    })

    expect(results.subtitles?.content_hash).toBe('subtitle-hash')
    expect(results.config?.content_hash).toBe('config-hash')
    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toEqual({
      workflow_revision: 4,
      dependency_hash: 'subtitle-hash',
      data: { style_name: 'dramatic' },
    })
  })

  it('uses freshly saved upstream hash for chained workflow field saves', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { workflow_revision: 3 }))
      .mockResolvedValueOnce(jsonResponse(200, {
        workflow_revision: 4,
        content_hash: 'video-hash',
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        workflow_revision: 5,
        content_hash: 'subtitle-hash',
      }))

    await ProjectService.saveWorkflowFields('project-1', {
      video_context: {
        items: {
          '1': { subtitle: 'source', start_time: 0, end_time: 1 },
        },
      } as any,
      subtitle: {
        '1': { subtitle: 'source', start_time: 0, end_time: 1 },
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      workflow_revision: 3,
      data: {
        video_context: {
          items: {
            '1': { subtitle: 'source', start_time: 0, end_time: 1 },
          },
        },
      },
    })
    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toEqual({
      workflow_revision: 4,
      dependency_hash: 'video-hash',
      data: {
        '1': { subtitle: 'source', start_time: 0, end_time: 1 },
      },
    })
  })
})
