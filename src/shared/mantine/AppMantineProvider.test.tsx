import { useMantineColorScheme } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeToggle from '@/shared/components/ui/ThemeToggle'
import { APP_COLOR_SCHEME_KEY, AppMantineProvider } from './AppMantineProvider'

function ColorSchemeProbe() {
  const { colorScheme } = useMantineColorScheme()

  return <div>当前主题:{colorScheme}</div>
}

describe('AppMantineProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-mantine-color-scheme')
  })

  it('读取持久化主题并在切换后同步到本地存储', async () => {
    localStorage.setItem(APP_COLOR_SCHEME_KEY, 'light')

    const user = userEvent.setup()

    render(
      <AppMantineProvider>
        <ColorSchemeProbe />
        <ThemeToggle />
      </AppMantineProvider>,
    )

    expect(screen.getByText('当前主题:light')).toBeInTheDocument()

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'light')
    })

    await user.click(screen.getByRole('button', { name: '切换到深色主题' }))

    expect(screen.getByText('当前主题:dark')).toBeInTheDocument()
    expect(localStorage.getItem(APP_COLOR_SCHEME_KEY)).toBe('dark')

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark')
    })
  })
})
