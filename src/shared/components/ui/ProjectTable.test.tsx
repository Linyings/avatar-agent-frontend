import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProjectTable from './ProjectTable'
import type { Project } from '@/features/projects'

function renderProjectTable(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </MantineProvider>
  )
}

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

describe('ProjectTable', () => {
  it('对未完成项目展示编辑动作，并渲染删除入口', () => {
    const onDeleteProject = vi.fn().mockResolvedValue(undefined)

    renderProjectTable(
      <ProjectTable
        projects={[project]}
        onDeleteProject={onDeleteProject}
      />
    )

    expect(screen.getByText('示例项目')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByTitle('Delete project')).toBeInTheDocument()
  })

  it('对已完成项目展示查看动作', () => {
    renderProjectTable(
      <ProjectTable
        projects={[{ ...project, id: 'project-2', status: 'completed' }]}
      />
    )

    expect(screen.getByText('View')).toBeInTheDocument()
  })
})
