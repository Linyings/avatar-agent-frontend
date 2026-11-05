import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Project } from '@/features/projects'
import ProjectCard from './ProjectCard'

const baseProject: Project = {
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

const renderCard = (project: Project) => render(
  <MantineProvider>
    <MemoryRouter>
      <ProjectCard project={project} />
    </MemoryRouter>
  </MantineProvider>
)

describe('ProjectCard inference mode', () => {
  it('does not show draft as a default status badge', () => {
    renderCard(baseProject)

    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
    expect(screen.queryByText('草稿')).not.toBeInTheDocument()
  })

  it('marks legacy deep projects as retired', () => {
    renderCard({
      ...baseProject,
      metadata: {
        inference_mode: 'deep',
      },
    })

    expect(screen.getByText('已下线')).toBeInTheDocument()
  })

  it('shows the active frame inference label', () => {
    renderCard({
      ...baseProject,
      metadata: {
        inference_mode: 'frame',
      },
    })

    expect(screen.getByText('通用模式')).toBeInTheDocument()
  })
})
