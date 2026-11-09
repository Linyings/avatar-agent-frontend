import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import ExecutionStatus from './ExecutionStatus'
import type {StudioState} from './studioService'
vi.mock('./StudioShell',()=>({ProtectedMedia:({url}:{url:string})=><audio data-testid="review-audio" src={url} controls/>}))
afterEach(cleanup)
function fixture():StudioState{
 const input={revision:1,title:'',topic:'口播',script:'第一句。第二句。',direction:'',ratio:'9:16',style:'',voice:'',use_avatar:true,assets:[]}
 return {project:{id:'test',name:'test',input},run:{id:'run',status:'awaiting_confirmation',stage:'F03',confirmation:'script',confirmation_version:'version-1',input,script:input.script,steps:[],segments:[{id:'p1',chapter:'开场',text:'第一句。',duration:0,start:0},{id:'p2',chapter:'正文',text:'第二句。',duration:0,start:0}],needs:[],materials:[],shots:[],artifacts:[],duration:0,pause_requested:false},proposal:null,packages:[],styles:[],voices:[],agent_configured:true}
}
function ui(state:StudioState,primary=vi.fn(),syncError=''){
 return <MantineProvider><ExecutionStatus state={state} busy={false} onPrimary={primary} onCurrent={()=>{}} syncError={syncError}/></MantineProvider>
}
it('keeps script review in the canvas and confirms without duplicating text in chat',()=>{
 const state=fixture(),primary=vi.fn();render(ui(state,primary))
 expect(screen.getByRole('status')).toHaveTextContent('等待你确认文案')
 expect(screen.getByRole('button',{name:'已确认，继续'})).toBeEnabled()
 expect(screen.queryByRole('region',{name:'待确认文案'})).not.toBeInTheDocument()
 expect(screen.queryByText('第一句。')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/查看文案|收起文案/})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'已确认，继续'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'取消'}))
 expect(primary).not.toHaveBeenCalled()
 expect(screen.getByText(/已取消本次确认/)).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'继续确认'}))
 fireEvent.click(screen.getByRole('button',{name:'已确认，继续'}))
 expect(primary).toHaveBeenCalledOnce()
})
it('keeps new script versions out of chat and disables offline approval',()=>{
 const state=fixture(),primary=vi.fn();const {rerender}=render(ui(state,primary))
 const next=structuredClone(state);next.run!.confirmation_version='version-2';next.run!.segments[0].text='更新后的文案。'
 rerender(ui(next,primary))
 expect(screen.getByRole('button',{name:'已确认，继续'})).toBeEnabled()
 expect(screen.queryByText('更新后的文案。')).not.toBeInTheDocument()
 rerender(ui(next,primary,'网络连接失败'))
 expect(screen.getByRole('button',{name:'已确认，继续'})).toBeDisabled()
 expect(screen.getByRole('status')).toHaveTextContent('状态同步中断')
})
it('shows every audio segment in the chat review before audio confirmation',()=>{
 const state=fixture();state.run!.confirmation='audio';state.run!.stage='F04';state.run!.segments.forEach((s,i)=>{s.audio=`audio/${i}.wav`;s.duration=2})
 render(ui(state))
 fireEvent.click(screen.getByRole('button',{name:'查看并试听配音'}))
 expect(screen.getAllByTestId('review-audio')).toHaveLength(2)
 expect(screen.getByRole('region',{name:'待确认配音'})).toHaveTextContent('第二句。')
 expect(screen.getByRole('button',{name:'已确认，继续'})).toBeEnabled()
})
it('offers direct continuation only when the entire audio batch is ready',()=>{
 const state=fixture(),primary=vi.fn();state.run!.confirmation='audio';state.run!.segments.forEach((s,i)=>{s.audio=`audio/${i}.wav`;s.duration=2})
 const {rerender}=render(ui(state,primary))
 expect(screen.getByRole('status')).toHaveTextContent('全部 2 段配音已完成')
 expect(screen.getByRole('button',{name:'查看并试听配音'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'直接继续制作'}))
 expect(primary).toHaveBeenCalledOnce()
 const partial=structuredClone(state);partial.run!.segments[1].audio=undefined
 rerender(ui(partial,primary))
 expect(screen.getByRole('button',{name:'直接继续制作'})).toBeDisabled()
})
it('does not offer approval or a retry for an unknown provider submission',()=>{
 const state=fixture();state.run!.status='submission_unknown';state.run!.stage='F04/p1';state.run!.confirmation=undefined;state.run!.script_confirmed=true
 render(ui(state))
 expect(screen.queryByRole('button',{name:/已确认|恢复当前运行|确认文案/})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'刷新订单状态'})).toBeEnabled()
 expect(screen.getByText(/文案已确认/)).toBeVisible()
})
it('does not approve incomplete audio or an unavailable review version',()=>{
 const state=fixture();state.run!.confirmation='audio'
 const {rerender}=render(ui(state));fireEvent.click(screen.getByRole('button',{name:'查看并试听配音'}))
 expect(screen.getByRole('button',{name:'已确认，继续'})).toBeDisabled()
 const next=structuredClone(state);next.run!.confirmation='script';next.run!.confirmation_version=undefined
 rerender(ui(next))
 expect(screen.getByRole('button',{name:'已确认，继续'})).toBeDisabled()
 expect(screen.getByText(/确认版本不可用/)).toBeVisible()
})
