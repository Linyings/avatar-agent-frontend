import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import Footer from './Footer'

vi.mock('@/shared/utils/version', () => ({ getVersion: () => 'v1.4.4' }))

describe('Footer', () => {
  it('does not show the previous site contact or filing details', () => {
    render(
      <MemoryRouter>
        <AppMantineProvider>
          <Footer />
        </AppMantineProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByText('support@narratoai.co')).not.toBeInTheDocument()
    expect(screen.queryByText('蜀ICP备2024085955号-5')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '抖音号二维码' })).not.toBeInTheDocument()
    expect(screen.getByText(/数字人口播/)).toBeInTheDocument()
  })
})
