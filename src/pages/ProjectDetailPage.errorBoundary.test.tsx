import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import ProjectDetailPage from './ProjectDetailPage'

const projectDetailMocks = vi.hoisted(() => ({
  clearError: vi.fn(),
  loadProject: vi.fn(),
  materialShouldThrow: true,
}))

vi.mock('@/features/projects', () => ({
  useProject: () => ({
    currentProject: {
      id: 'project-1',
      name: 'Project',
      status: 'processing',
      workflow: {
        mode: 'frame',
        status: 'processing',
        current_step: 'step_0_created',
        current_step_id: null,
        current_step_index: 0,
        revision: 1,
        steps: {},
        stages: {},
      },
      artifacts: {},
      metadata: {},
    },
    isLoading: false,
    error: null,
    loadProject: projectDetailMocks.loadProject,
    clearError: projectDetailMocks.clearError,
  }),
}))

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
  }),
}))

vi.mock('@/features/projects/components/stages/MaterialStage', () => ({
  default: () => {
    if (projectDetailMocks.materialShouldThrow) {
      throw new Error('stage boom')
    }

    return <div>material stage recovered</div>
  },
}))

vi.mock('@/features/projects/components/stages/AnalysisStage', () => ({
  default: () => <div>analysis stage recovered</div>,
}))

vi.mock('@/features/projects/components/stages/DubbingStage', () => ({
  default: () => <div>dubbing stage recovered</div>,
}))

function renderProjectDetailPage(initialEntry = '/projects/project-1/material/upload') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/projects/:projectId/:stage/:step?"
            element={(
              <>
                <Link to="/projects/project-1/analysis">切换分析阶段</Link>
                <ProjectDetailPage />
              </>
            )}
          />
          <Route path="/projects" element={<div>项目列表</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
}

describe('ProjectDetailPage stage error boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectDetailMocks.materialShouldThrow = true
  })

  it('隔离 stage 渲染异常，并在切换 stage 后自动恢复', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      renderProjectDetailPage()

      expect(await screen.findByText('项目工作流暂时不可用')).toBeInTheDocument()
      expect(screen.getByText('stage boom')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '返回项目列表' })).toHaveAttribute('href', '/projects')

      fireEvent.click(screen.getByRole('link', { name: '切换分析阶段' }))

      expect(await screen.findByText('analysis stage recovered')).toBeInTheDocument()
      expect(screen.queryByText('项目工作流暂时不可用')).not.toBeInTheDocument()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
