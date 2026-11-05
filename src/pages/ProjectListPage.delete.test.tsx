import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { StrictMode } from 'react'
import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ProjectListPage from './ProjectListPage'
import { ProjectService } from '@/features/projects'
import type { Project } from '@/features/projects'
import { DEFAULT_PROJECT_NAME } from '@/features/projects/utils/projectNaming'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'
import { localAudioStorageService } from '@/shared/services/localAudioStorageService'

vi.mock('@/features/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/projects')>()

  return {
    ...actual,
    ProjectService: {
      getProjects: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
    },
  }
})

vi.mock('@/shared/services/localAssetStorageService', () => ({
  localAssetStorageService: {
    deleteProjectAssets: vi.fn(),
  },
}))

vi.mock('@/shared/services/localAudioStorageService', () => ({
  localAudioStorageService: {
    deleteProjectCachedData: vi.fn(),
  },
}))

const project: Project = {
  id: 'project-1',
  owner_id: 'owner-1',
  name: '示例项目',
  is_public: false,
  tags: [],
  status: 'draft',
  created_at: '2026-04-22T10:00:00.000Z',
  updated_at: '2026-04-23T10:00:00.000Z',
  workflow: { mode: 'frame', status: 'draft', current_step: 'step_0_created', current_step_id: null, current_step_index: 0, revision: 1, steps: {}, stages: {} },
  artifacts: {},
  metadata: {},
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/:projectId/:stage/:step" element={<LocationProbe />} />
          <Route path="/projects/:projectId/:stage" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
}

function renderPageInStrictMode() {
  return render(
    <StrictMode>
      <MantineProvider>
        <MemoryRouter initialEntries={['/projects']}>
          <Routes>
            <Route path="/projects" element={<ProjectListPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </StrictMode>
  )
}

describe('ProjectListPage project cards', () => {
  beforeEach(() => {
    localStorage.setItem('project-list-view-mode', 'card')
    vi.mocked(ProjectService.getProjects).mockResolvedValue({
      projects: [project],
      total: 1,
      has_more: false,
      page: 1,
      limit: 50,
    })
    vi.mocked(ProjectService.deleteProject).mockResolvedValue({ message: 'ok' })
    vi.mocked(localAssetStorageService.deleteProjectAssets).mockResolvedValue(undefined)
    vi.mocked(localAudioStorageService.deleteProjectCachedData).mockResolvedValue(undefined)
    vi.mocked(ProjectService.createProject).mockResolvedValue({
      ...project,
      id: 'project-frame',
      name: DEFAULT_PROJECT_NAME,
    })
  })

  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('加载项目时展示分层骨架卡片而不是空白占位', () => {
    vi.mocked(ProjectService.getProjects).mockReturnValue(new Promise(() => {}))

    renderPage()

    expect(screen.getAllByTestId('project-card-loading-skeleton')).toHaveLength(6)
    expect(screen.getAllByTestId('project-card-skeleton-media')).toHaveLength(6)
  })

  it('初始加载在 StrictMode 下复用同一个列表请求', async () => {
    renderPageInStrictMode()

    expect(await screen.findByText('示例项目')).toBeInTheDocument()
    expect(ProjectService.getProjects).toHaveBeenCalledTimes(1)
    expect(ProjectService.getProjects).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      sort_by: 'updated_at',
      sort_order: 'desc',
    })
  })

  it('在卡片视图展示删除按钮并确认删除项目', async () => {
    renderPage()

    const deleteButton = await screen.findByRole('button', { name: '删除项目 示例项目' })
    await userEvent.click(deleteButton)

    await screen.findByText('确定要删除这个项目吗？此操作无法撤销。')
    await userEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(ProjectService.deleteProject).toHaveBeenCalledWith('project-1')
    })
    await waitFor(() => {
      expect(localAssetStorageService.deleteProjectAssets).toHaveBeenCalledWith('project-1')
      expect(localAudioStorageService.deleteProjectCachedData).toHaveBeenCalledWith('project-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('示例项目')).not.toBeInTheDocument()
    })
  })

  it('本地缓存清理失败时仍完成项目删除', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(localAssetStorageService.deleteProjectAssets).mockRejectedValue(new Error('OPFS cleanup failed'))

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '删除项目 示例项目' }))
    await userEvent.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(ProjectService.deleteProject).toHaveBeenCalledWith('project-1')
      expect(screen.queryByText('示例项目')).not.toBeInTheDocument()
    })
    expect(warnSpy).toHaveBeenCalledWith('[projectLocalCleanup] 删除项目本地缓存失败:', expect.objectContaining({ projectId: 'project-1' }))
    warnSpy.mockRestore()
  })

  it('在项目卡片将旧推理模式标记为已下线', async () => {
    vi.mocked(ProjectService.getProjects).mockResolvedValue({
      projects: [{
        ...project,
        metadata: {
          inference_mode: 'deep',
        },
      }],
      total: 1,
      has_more: false,
      page: 1,
      limit: 50,
    })

    renderPage()

    expect(await screen.findByText('已下线')).toBeInTheDocument()
  })

  it('默认草稿项目不再展示冗余状态徽标', async () => {
    renderPage()

    expect(await screen.findByText('示例项目')).toBeInTheDocument()
    expect(screen.queryByText('草稿')).not.toBeInTheDocument()
  })

  it('仅保留通用模式筛选并排除旧模式项目', async () => {
    vi.mocked(ProjectService.getProjects).mockResolvedValue({
      projects: [
        {
          ...project,
          id: 'project-frame',
          name: '逐帧项目',
          metadata: { inference_mode: 'frame' },
        },
        {
          ...project,
          id: 'project-shallow',
          name: '快速项目',
          metadata: { inference_mode: 'shallow' },
        },
        {
          ...project,
          id: 'project-deep',
          name: '深度项目',
          metadata: { inference_mode: 'deep' },
        },
        {
          ...project,
          id: 'project-avatar',
          name: '口播项目',
          metadata: { kind: 'avatar_mvp' },
        },
      ],
      total: 4,
      has_more: false,
      page: 1,
      limit: 50,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('逐帧项目').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('深度项目').length).toBeGreaterThan(0)
    expect(screen.getAllByText('快速项目').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '通用模式' }))

    expect(screen.queryByText('快速项目')).not.toBeInTheDocument()
    expect(screen.queryByText('深度项目')).not.toBeInTheDocument()
    expect(screen.getAllByText('逐帧项目').length).toBeGreaterThan(0)
    expect(screen.queryByText('口播项目')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '数字人口播' }))
    expect(screen.getAllByText('口播项目').length).toBeGreaterThan(0)
    expect(screen.queryByText('逐帧项目')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '快速推理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '深度推理' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '通用模式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '数字人口播' })).toBeInTheDocument()
  })

  it('点击新建项目并选择通用模式后进入素材工作台', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '新建项目' }))
    expect(ProjectService.createProject).not.toHaveBeenCalled()
    await userEvent.click(await screen.findByRole('button', { name: '新建通用模式项目' }))

    expect(ProjectService.createProject).toHaveBeenCalledWith({
      name: DEFAULT_PROJECT_NAME,
      metadata: {
        inference_mode: 'frame',
        auto_name_from_video: true,
      },
    })
    expect(screen.queryByText('创建新项目')).not.toBeInTheDocument()
    expect(await screen.findByTestId('location')).toHaveTextContent('/projects/project-frame/material/upload')
  })

  it('新建数字人口播项目时不携带旧任务并进入空白项目', async () => {
    vi.mocked(ProjectService.createProject).mockResolvedValue({
      ...project,
      id: 'project-avatar',
      name: '数字人口播',
      metadata: { inference_mode: 'avatar' },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '新建项目' }))
    await userEvent.click(await screen.findByRole('button', { name: '新建数字人口播项目' }))

    expect(ProjectService.createProject).toHaveBeenCalledWith({
      name: '数字人口播',
      metadata: { inference_mode: 'avatar' },
    })
    expect(await screen.findByTestId('location')).toHaveTextContent('/projects/project-avatar/avatar')
  })

  it('将删除按钮放在卡片右上角并移除图片状态标签', () => {
    const content = readFileSync(resolve(process.cwd(), 'src/features/projects/components/ProjectListView.tsx'), 'utf8')

    expect(content).toContain('right={10}')
    expect(content).not.toContain("project.status === 'draft' ?")
  })
})
