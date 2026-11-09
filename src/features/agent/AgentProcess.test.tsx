import {afterEach,expect,it} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import AgentProcess from './AgentProcess'
import type {ToolEvent} from './agentService'

afterEach(cleanup)
it('collapses completed tool details into one line while keeping errors available to inspect',()=>{
 const event:ToolEvent={type:'tool',turnId:'turn',callId:'plan',tool:'plan_project',status:'running'}
 const ui=(events:ToolEvent[],busy:boolean)=><MantineProvider><AgentProcess events={events} busy={busy} packages={[]}/></MantineProvider>
 const {rerender}=render(ui([event],true))
 const process=screen.getByRole('group',{name:'Agent 执行过程'}) as HTMLDetailsElement
 expect(process).not.toHaveAttribute('open')
 expect(process.querySelector('summary')).toHaveTextContent('正在规划制作流程…')
 process.open=true
 rerender(ui([{...event,status:'error',detail:'素材暂不可用'}],false))
 expect(process).not.toHaveAttribute('open')
 expect(process.querySelector('summary')).toHaveTextContent('执行过程 · 1 项 · 1 项未完成')
 expect(screen.getByText(/素材暂不可用/)).not.toBeVisible()
 process.open=true
 expect(screen.getByText(/素材暂不可用/)).toBeVisible()
})
