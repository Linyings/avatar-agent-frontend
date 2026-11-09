import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider, useI18n, translateText } from './I18nProvider'

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

function LiveAgentStatus() {
  const [done,setDone] = useState(false)
  const {setLocale} = useI18n()
  return <>
    <span data-testid="live-tool">{done?'已返回':'调用中'}</span>
    <span data-testid="live-count">{done?13:0}</span>
    <span data-testid="live-label" title={done?'注册':'登录'} aria-label={done?'注册':'登录'}>{done?'注册':'登录'}</span>
    <button onClick={()=>setDone(true)}>Complete tool</button>
    <button onClick={()=>setLocale('zh-CN')}>Switch Chinese</button>
  </>
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

  it('preserves new tool statuses, project counts, and accessible labels after React updates',async()=>{
    render(<MemoryRouter><I18nProvider initialLocale="zh-CN"><LiveAgentStatus/></I18nProvider></MemoryRouter>)
    await waitForTranslationPass()
    fireEvent.click(screen.getByRole('button',{name:'Complete tool'}))
    await waitForTranslationPass()
    expect(screen.getByTestId('live-tool')).toHaveTextContent('已返回')
    expect(screen.getByTestId('live-count')).toHaveTextContent('13')
    expect(screen.getByTestId('live-label')).toHaveAttribute('aria-label','注册')
    expect(screen.getByTestId('live-label')).toHaveAttribute('title','注册')
  })

  it('translates an updated source and restores that source when switching language',async()=>{
    render(<MemoryRouter><I18nProvider initialLocale="en"><LiveAgentStatus/></I18nProvider></MemoryRouter>)
    await waitForTranslationPass()
    fireEvent.click(screen.getByRole('button',{name:'Complete tool'}))
    await waitForTranslationPass()
    expect(screen.getByTestId('live-label')).toHaveTextContent(translateText('注册','en'))
    expect(screen.getByTestId('live-label')).toHaveAttribute('title',translateText('注册','en'))
    fireEvent.click(screen.getByRole('button',{name:'Switch Chinese'}))
    await waitForTranslationPass()
    expect(screen.getByTestId('live-label')).toHaveTextContent('注册')
    expect(screen.getByTestId('live-label')).toHaveAttribute('aria-label','注册')
  })
})
