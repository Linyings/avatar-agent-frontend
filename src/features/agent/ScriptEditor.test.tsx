import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import ScriptEditor from './ScriptEditor'
import type {StudioRun} from './studioService'
const api=vi.hoisted(()=>({save:vi.fn(),invoke:vi.fn()}))
vi.mock('./studioService',async()=>({...await vi.importActual('./studioService'),saveScriptReview:api.save,invokePackage:api.invoke}))
const run={id:'run',status:'awaiting_confirmation',confirmation:'script',confirmation_version:'v1',script:'原始稿件。',segments:[{id:'p1',chapter:'开场',text:'原始稿件。',start:0,duration:0}],input:{revision:1}} as StudioRun
beforeEach(()=>{vi.resetAllMocks();api.save.mockResolvedValue({})})
afterEach(cleanup)
it('saves manual edits without confirming or starting production',async()=>{
 const saved=vi.fn(),close=vi.fn()
 render(<MantineProvider><ScriptEditor projectId="project" run={run} currentRun={run} onSaved={saved} onClose={close}/></MantineProvider>)
 fireEvent.change(screen.getByRole('textbox',{name:'第 1 段文案'}),{target:{value:'手动改写的内容。'}})
 fireEvent.click(screen.getByRole('button',{name:'保存文案'}))
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
 expect(api.save).toHaveBeenCalledWith(run,[{id:'p1',chapter:'开场',text:'手动改写的内容。'}])
 expect(api.invoke).not.toHaveBeenCalled()
 expect(close).toHaveBeenCalledOnce()
})
it('preserves edits on failure and blocks saving over a changed version',async()=>{
 api.save.mockRejectedValue(new Error('网络中断'))
 const props={projectId:'project',run,currentRun:run,onSaved:vi.fn(),onClose:vi.fn()}
 const {rerender}=render(<MantineProvider><ScriptEditor {...props}/></MantineProvider>)
 const input=screen.getByRole('textbox',{name:'第 1 段文案'})
 fireEvent.change(input,{target:{value:'不能丢失的修改。'}})
 fireEvent.click(screen.getByRole('button',{name:'保存文案'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('网络中断')
 expect(input).toHaveValue('不能丢失的修改。')
 rerender(<MantineProvider><ScriptEditor {...props} currentRun={{...run,confirmation_version:'v2'}}/></MantineProvider>)
 expect(input).toHaveValue('不能丢失的修改。')
 expect(screen.getByRole('button',{name:'保存文案'})).toBeDisabled()
 expect(screen.getByText(/文案版本已更新/)).toBeVisible()
})
it('creates an explicit revision proposal after production instead of overwriting existing outputs',async()=>{
 const completed={...run,status:'succeeded',confirmation:undefined}
 render(<MantineProvider><ScriptEditor projectId="project" run={completed} currentRun={completed} onSaved={vi.fn()} onClose={vi.fn()}/></MantineProvider>)
 fireEvent.change(screen.getByRole('textbox',{name:'第 1 段文案'}),{target:{value:'下一版本稿件。'}})
 fireEvent.click(screen.getByRole('button',{name:'提交修改方案'}))
 await waitFor(()=>expect(api.invoke).toHaveBeenCalledWith('project','avatar.edit-script',{segments:[{id:'p1',text:'下一版本稿件。'}]}))
 expect(api.save).not.toHaveBeenCalled()
})
