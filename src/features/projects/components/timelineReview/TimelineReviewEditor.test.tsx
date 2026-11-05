import '@testing-library/jest-dom/vitest'
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Editor from './TimelineReviewEditor'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('renders the timeline, warns about short text, and permits human approval and TTS', async () => {
  const valid = vi.fn()
  const change = vi.fn()
  render(<MantineProvider><Editor taskId="test" sourceFile={new File([''], 'test.mp4')} sourceDuration={60}
    items={[{ _id: 1, text: '字'.repeat(53), org: '', start: 10, end: 25 }]}
    t={s => s} onChange={change} onValidationChange={valid} onRegenerateVoice={vi.fn()} /></MantineProvider>)
  expect(screen.getByTestId('final-timeline-clip-1')).toHaveAttribute('data-invalid', 'true')
  expect(screen.getByRole('button', { name: '重新生成本段配音' })).toBeEnabled()
  await waitFor(() => expect(valid).toHaveBeenLastCalledWith({ valid: true, issues: [] }))
  fireEvent.change(screen.getByRole('textbox', { name: '解说文案' }), { target: { value: '新的文案' } })
  expect(change).toHaveBeenCalledWith([expect.objectContaining({ text: '新的文案', start: 10, end: 25 })])
})
