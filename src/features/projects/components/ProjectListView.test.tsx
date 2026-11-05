import { useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ProjectListView } from './ProjectListView'
import type { Project } from '../types/project'

const project: Project = {
  id: 'project-1',
  owner_id: 'owner-1',
  name: '示例项目',
  status: 'draft',
  created_at: '2026-04-22T10:00:00.000Z',
  updated_at: '2026-04-23T10:00:00.000Z',
  workflow: {
    mode: 'frame',
    status: 'draft',
    current_step: 'step_0_created',
    current_step_id: null,
    current_step_index: 0,
    revision: 1,
    steps: {},
    stages: {},
  },
  artifacts: {},
  metadata: {},
}

const props = {
  projects: [] as Project[],
  isLoading: false,
  isCreatingProject: false,
  deletingId: null,
  error: null,
  searchQuery: '',
  selectedMode: 'all' as const,
  sortBy: 'updated_at',
  viewMode: 'card' as const,
  onSearchQueryChange: vi.fn(),
  onSelectedModeChange: vi.fn(),
  onSortByChange: vi.fn(),
  onViewModeChange: vi.fn(),
  onCreateProject: vi.fn(),
  onDeleteProject: vi.fn(),
  onClearError: vi.fn(),
}

function ControlledProjectListView() {
  const [searchQuery, setSearchQuery] = useState(props.searchQuery)

  return (
    <ProjectListView
      {...props}
      projects={[project]}
      searchQuery={searchQuery}
      onSearchQueryChange={(value) => {
        setSearchQuery(value)
        props.onSearchQueryChange(value)
      }}
    />
  )
}

function renderProjectListView() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <ControlledProjectListView />
      </MemoryRouter>
    </MantineProvider>,
  )
}

function renderWithProps(overrides: Partial<React.ComponentProps<typeof ProjectListView>>) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <ProjectListView {...props} projects={[project]} {...overrides} />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('ProjectListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the canonical project controls without owning project I/O', async () => {
    const user = userEvent.setup()

    renderProjectListView()

    expect(screen.getByRole('button', { name: '新建项目' })).toBeInTheDocument()
    expect(screen.getByText('示例项目')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('搜索项目...'), '示例')

    expect(props.onSearchQueryChange).toHaveBeenLastCalledWith('示例')
  })

  it('delegates create and confirmed delete actions to its callbacks', async () => {
    const user = userEvent.setup()

    renderProjectListView()

    await user.click(screen.getByRole('button', { name: '新建项目' }))
    await user.click(screen.getByRole('button', { name: '新建通用模式项目' }))
    expect(props.onCreateProject).toHaveBeenCalledWith('frame')

    await user.click(screen.getByRole('button', { name: '删除项目 示例项目' }))
    await screen.findByText('确定要删除这个项目吗？此操作无法撤销。')
    await user.click(screen.getByRole('button', { name: '删除' }))

    expect(props.onDeleteProject).toHaveBeenCalledWith('project-1')
  })

  it('uses an optional project status presentation resolver', () => {
    renderWithProps({
      resolveStatusPresentation: () => ({ label: 'Waiting locally', visible: true }),
    })

    expect(screen.getByText('Waiting locally')).toBeInTheDocument()
  })

  it('supports controlled delete confirmation state', async () => {
    const user = userEvent.setup()
    const onDeleteConfirmIdChange = vi.fn()
    const view = renderWithProps({
      deleteConfirmId: null,
      onDeleteConfirmIdChange,
    })

    await user.click(screen.getByRole('button', { name: new RegExp(project.name) }))

    expect(onDeleteConfirmIdChange).toHaveBeenCalledWith('project-1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    view.rerender(
      <MantineProvider>
        <MemoryRouter>
          <ProjectListView
            {...props}
            projects={[project]}
            deleteConfirmId="project-1"
            onDeleteConfirmIdChange={onDeleteConfirmIdChange}
          />
        </MemoryRouter>
      </MantineProvider>,
    )

    const dialogButtons = within(await screen.findByRole('dialog')).getAllByRole('button')
    await user.click(dialogButtons.at(-1)!)
    expect(props.onDeleteProject).toHaveBeenCalledWith('project-1')
    expect(onDeleteConfirmIdChange).toHaveBeenLastCalledWith(null)
  })

  it('renders controlled pagination only when pagination props are supplied', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const view = renderWithProps({ projects: [] })

    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument()

    view.rerender(
      <MantineProvider>
        <MemoryRouter>
          <ProjectListView
            {...props}
            projects={[project]}
            pagination={{ currentPage: 1, pageSize: 1, total: 3, onPageChange }}
          />
        </MemoryRouter>
      </MantineProvider>,
    )

    await user.click(screen.getByRole('button', { name: '2' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
