import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import ResourcesPage from './ResourcesPage'

function renderResourcesRoute(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppMantineProvider>
        <Routes>
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/resources/:slug" element={<ResourcesPage />} />
        </Routes>
      </AppMantineProvider>
    </MemoryRouter>,
  )
}

describe('ResourcesPage SEO and hero layout', () => {
  it('renders a product workflow visual on SEO landing pages', async () => {
    renderResourcesRoute('/resources/ai-video-commentary-generator')

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'AI Video Commentary Generator for Creator Workflows',
    )
    expect(screen.getByText('Production workspace')).toBeInTheDocument()
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    expect(screen.getByText('workflow steps')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('resource pages')).toBeInTheDocument()
  })

  it('marks article resources with article social metadata', async () => {
    renderResourcesRoute('/resources/best-opusclip-alternatives')

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Best OpusClip Alternatives for AI Video Clipping in 2026',
    )

    await waitFor(() => {
      expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute('content', 'article')
    })
  })
})
