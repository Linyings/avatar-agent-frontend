import {afterEach,expect,it} from 'vitest'
import {cleanup,renderHook} from '@testing-library/react'
import type {StudioState} from './studioService'
import {useChatTimeline,type ChatLine} from './useChatTimeline'

afterEach(cleanup)
const messages:ChatLine[]=[
 {id:'before',role:'user',content:'开始制作',createdAt:'2026-11-07T08:00:00Z'},
 {id:'after',role:'user',content:'后续话题',createdAt:'2026-11-07T08:02:00Z'},
]
function fixture():StudioState{
 const input={revision:1,title:'项目',topic:'主题',script:'文案',direction:'',ratio:'9:16',style:'',voice:'',use_avatar:true,assets:[]}
 return {project:{id:'project',name:'项目',input},run:{id:'run',status:'running',stage:'F12',input,script:'文案',segments:[],shots:[],needs:[],materials:[],artifacts:[],steps:[],duration:0,pause_requested:false,updated_at:'2026-11-07T08:01:00Z'},proposal:null,packages:[],styles:[],voices:[],agent_configured:true}
}
const order=(items:ReturnType<typeof useChatTimeline>)=>items.map(item=>item.kind==='notice'?'notice':item.id)
it('moves the current card only for a new workflow state, not for polling or unrelated Agent activity',()=>{
 const state=fixture()
 const {result,rerender}=renderHook(({snapshot})=>useChatTimeline(snapshot,messages,false),{initialProps:{snapshot:state}})
 expect(order(result.current)).toEqual(['before','notice','after'])
 const completed={...state,run:{...state.run!,status:'succeeded',completed_at:'2026-11-07T08:03:00Z'}}
 rerender({snapshot:completed})
 expect(order(result.current)).toEqual(['before','after','notice'])
 const id=result.current.at(-1)!.id
 rerender({snapshot:{...completed,run:{...completed.run,updated_at:'2026-11-07T08:04:00Z'},agent_activity:{status:'running',phase:'thinking',turn_id:'another',started_at:'2026-11-07T08:04:00Z',updated_at:'2026-11-07T08:04:00Z'}}})
 expect(result.current.at(-1)!.id).toBe(id)
 expect(result.current.filter(item=>item.kind==='notice')).toHaveLength(1)
})
it('inserts a pending proposal by creation time and keeps it ahead of further messages',()=>{
 const state=fixture();state.proposal={id:'proposal',revision:1,package:'edit',lines:['修改文案'],applied:false,createdAt:'2026-11-07T08:01:00Z'}
 const {result,rerender}=renderHook(({lines})=>useChatTimeline(state,lines,false),{initialProps:{lines:messages}})
 expect(order(result.current)).toEqual(['before','notice','after'])
 rerender({lines:[...messages,{id:'later',role:'assistant',content:'进一步讨论'}]})
 expect(order(result.current)).toEqual(['before','notice','after','later'])
})
it('waits for history before positioning the card and resets its anchor when switching projects',()=>{
 const state=fixture()
 const {result,rerender}=renderHook(({snapshot,lines,loading})=>useChatTimeline(snapshot,lines,loading),{initialProps:{snapshot:state,lines:[] as ChatLine[],loading:true}})
 expect(result.current).toEqual([])
 rerender({snapshot:state,lines:messages,loading:false})
 expect(order(result.current)).toEqual(['before','notice','after'])
 rerender({snapshot:{...state,project:{...state.project,id:'other'},run:null},lines:[],loading:false})
 expect(order(result.current)).toEqual(['notice'])
})
