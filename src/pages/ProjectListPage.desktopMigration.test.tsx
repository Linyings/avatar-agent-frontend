import { MantineProvider } from '@mantine/core'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ProjectListPage from './ProjectListPage'
import { ProjectService } from '@/features/projects'
import type { Project } from '@/features/projects'
import type { ProjectListViewProps } from '@/features/projects/components/ProjectListView'
import { DEFAULT_PROJECT_NAME } from '@/features/projects/utils/projectNaming'
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

vi.mock('@/features/projects/components/ProjectListView', () => ({
  ProjectListView: ({ onCreateProject, isCreatingProject }: ProjectListViewProps) => (
    <button type="button" onClick={() => onCreateProject('frame')} disabled={isCreatingProject}>
      新建项目
    </button>
  ),
}))

const createdProject: Project = {
  id: 'project-frame',
  owner_id: 'owner-1',
  name: DEFAULT_PROJECT_NAME,
  is_public: false,
  tags: [],
  status: 'draft',
  created_at: '2026-09-16T10:00:00.000Z',
  updated_at: '2026-09-16T10:00:00.000Z',
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
    <MantineProvider env="test">
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/:projectId/:stage/:step" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
}

describe('ProjectListPage project creation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://download-test.narratoai.cn/')
    vi.mocked(ProjectService.getProjects).mockResolvedValue({
      projects: [],
      total: 0,
      has_more: false,
      page: 1,
      limit: 50,
    })
    vi.mocked(ProjectService.createProject).mockResolvedValue(createdProject)
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('点击新建直接创建网页项目，不出现 Windows 下载提示', async () => {
    const user = userEvent.setup()
    let resolveCreation!: (project: Project) => void
    vi.mocked(ProjectService.createProject).mockReturnValue(new Promise((resolve) => {
      resolveCreation = resolve
    }))
    renderPage()
    await user.click(screen.getByRole('button', { name: '新建项目' }))

    expect(screen.queryByRole('dialog', { name: '推荐使用 Windows 版本' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '下载 Windows 版本' })).not.toBeInTheDocument()

    expect(ProjectService.createProject).toHaveBeenCalledTimes(1)
    expect(ProjectService.createProject).toHaveBeenCalledWith({
      name: DEFAULT_PROJECT_NAME,
      metadata: {
        inference_mode: 'frame',
        auto_name_from_video: true,
      },
    })
    expect(screen.queryByTestId('location')).not.toBeInTheDocument()

    await act(async () => resolveCreation(createdProject))

    expect(await screen.findByTestId('location')).toHaveTextContent('/projects/project-frame/material/upload')
    expect(ProjectService.createProject).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
