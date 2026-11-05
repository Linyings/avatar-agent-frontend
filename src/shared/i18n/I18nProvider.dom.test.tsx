import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from './I18nProvider'

const waitForTranslationPass = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  })
}

function ControlledReadonlyInput() {
  const [value, setValue] = useState('No background music')

  return (
    <>
      <input aria-label="background music" readOnly value={value} />
      <span>{value}</span>
      <button type="button" onClick={() => setValue('Electronic beat')}>Choose music</button>
    </>
  )
}

function ControlledTranslatedInput() {
  const [value, setValue] = useState('\u65e0\u80cc\u666f\u97f3\u4e50')

  return (
    <>
      <input aria-label="translated background music" readOnly value={value} />
      <span>{value}</span>
      <button type="button" onClick={() => setValue('\u80cc\u666f\u97f3\u4e50')}>
        Change translated value
      </button>
    </>
  )
}

describe('I18nProvider controlled input translation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('keeps a new React-controlled readonly input value after a later translation pass', async () => {
    render(
      <MemoryRouter>
        <I18nProvider initialLocale="zh-CN">
          <ControlledReadonlyInput />
        </I18nProvider>
      </MemoryRouter>,
    )
    await waitForTranslationPass()

    fireEvent.click(screen.getByRole('button', { name: 'Choose music' }))
    await waitForTranslationPass()

    expect(screen.getByRole('textbox', { name: 'background music' })).toHaveValue('Electronic beat')
  })

  it('distinguishes a translated value from a later React-controlled source', async () => {
    render(
      <MemoryRouter>
        <I18nProvider initialLocale="en">
          <ControlledTranslatedInput />
        </I18nProvider>
      </MemoryRouter>,
    )
    await waitForTranslationPass()
    expect(screen.getByRole('textbox', { name: 'translated background music' }))
      .toHaveValue('No background music')

    fireEvent.click(screen.getByRole('button', { name: 'Change translated value' }))
    await waitForTranslationPass()

    expect(screen.getByRole('textbox', { name: 'translated background music' }))
      .toHaveValue('Background music')
  })
})
