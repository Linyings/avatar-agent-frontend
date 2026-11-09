import {describe,it,expect,vi,beforeEach} from 'vitest'
import {createStudio,getStudio,invokePackage,studioRequest,nodeStatus,approveGate,type StudioState,type StudioRun} from './studioService'
import {authenticatedFetch} from '@/features/auth/services/authService'
vi.mock('@/features/auth/services/authService',()=>({authenticatedFetch:vi.fn()}))
describe('studio API',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('submits only the displayed approval kind and version',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({data:{confirmed:true}})))
  await approveGate({id:'run-1',status:'awaiting_confirmation',confirmation:'script',confirmation_version:'reviewed-version'} as StudioRun)
  const [url,init]=vi.mocked(authenticatedFetch).mock.calls[0]
  expect(url).toBe('/api/v1/avatar-mvp/runs/run-1/confirm')
  expect(JSON.parse(init!.body as string)).toEqual({kind:'script',version:'reviewed-version'})
 })
 it('rejects confirmations outside an active versioned review without sending a request',async()=>{
  await expect(approveGate({id:'run-1',status:'submission_unknown',confirmation:'script',confirmation_version:'old'} as StudioRun)).rejects.toThrow('当前没有待确认内容')
  await expect(approveGate({id:'run-1',status:'awaiting_confirmation',confirmation:'audio'} as StudioRun)).rejects.toThrow('确认版本不可用')
  expect(authenticatedFetch).not.toHaveBeenCalled()
 })
 it('persists the home composer reference links with the created project',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({data:{id:'new'}})))
  await createStudio('参考素材','16:9','mg-isometric',['https://example.com/reference'])
  const [,init]=vi.mocked(authenticatedFetch).mock.calls[0]
  const input=JSON.parse(init!.body as string)
  expect(input).toMatchObject({style:'mg-isometric',use_avatar:true,use_animation:true,reference_links:['https://example.com/reference']})
  expect(input.direction).toContain('分层融合')
  expect(input.direction).toContain('参考图')
 })
 it('keeps animation enabled when the user leaves the style at its default',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({data:{id:'new'}})))
  await createStudio('口播视频')
  const input=JSON.parse(vi.mocked(authenticatedFetch).mock.calls[0][1]!.body as string)
  expect(input).toMatchObject({use_avatar:true,use_animation:true,style:''})
  expect(input).not.toHaveProperty('voice')
 })
 it('sends the chosen voice so the server validates it against the model catalog',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({data:{id:'new'}})))
  await createStudio('口播视频','9:16','',[],'Calm_Woman')
  const input=JSON.parse(vi.mocked(authenticatedFetch).mock.calls[0][1]!.body as string)
  expect(input.voice).toBe('Calm_Woman')
 })
 it('shows inherited confirmed segmentation as complete during a downstream rerun',()=>{
  const state={run:{steps:[],segments:[{id:'p1'}],script_confirmed:true}} as unknown as StudioState
  expect(nodeStatus(state,'F03')).toBe('done')
  state.run!.script_confirmed=false
  expect(nodeStatus(state,'F03')).toBe('pending')
 })
 it('passes an idempotency ID and exact package inputs',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({data:{saved:true}})))
  await invokePackage('project','avatar.configure',{topic:'测试'},'stable-id')
  const [url,init]=vi.mocked(authenticatedFetch).mock.calls[0]
  expect(url).toContain('avatar.configure/invoke')
  expect(JSON.parse(init!.body as string)).toEqual({projectId:'project',input:{topic:'测试'},requestId:'stable-id'})
 })
 it('shows server validation errors instead of reporting success',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({error:'提案已过期'}),{status:409}))
  await expect(studioRequest('/confirm')).rejects.toThrow('提案已过期')
 })
 it.each([
  [{error:'Bad Request',message:'文件无法解码或不符合图片/视频要求',success:false},'文件无法解码或不符合图片/视频要求'],
  [{error:{message:'订单需要核对'}},'订单需要核对'],
  [{message:[],error:{code:'invalid_file'}},'请求失败（400）'],
  [null,'请求失败（400）'],
 ])('extracts a useful message from an error response: %j',async(body,message)=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify(body),{status:400}))
  await expect(studioRequest('/assets')).rejects.toThrow(message as string)
 })
 it('loads a revised run whose invalidated downstream collections are null',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({data:{project:{input:{assets:null}},run:{input:{assets:null},needs:null,shots:null,steps:[],segments:[],materials:[],artifacts:[]}}})))
  const state=await getStudio('revised-project')
  expect(state.project.input.assets).toEqual([])
  expect(state.run?.needs).toEqual([])
  expect(state.run?.shots).toEqual([])
  expect(nodeStatus(state,'F01.4')).toBe('skipped')
 })
 it('does not mark a multi-segment package done while a segment is running',()=>{
  const state={run:{steps:[{id:'F04/p1',status:'succeeded'},{id:'F04/p2',status:'running'}]}} as StudioState
  expect(nodeStatus(state,'F04')).toBe('running')
 })
 it('keeps a partial batch pending between segment submissions',()=>{
  const state={run:{steps:[{id:'F04/p1',status:'succeeded'}],segments:[{id:'p1'},{id:'p2'}]}} as StudioState
  expect(nodeStatus(state,'F04')).toBe('pending')
 })
 it('requires every material root step, not only its provider chunks',()=>{
  const state={run:{steps:[{id:'F06/n1',status:'succeeded'},{id:'F06/n1-c1',status:'succeeded'}],needs:[{id:'n1',kind:'avatar'},{id:'n2',kind:'avatar'}]}} as StudioState
  expect(nodeStatus(state,'F06')).toBe('pending')
 })
 it('marks optional video analysis and unneeded footage as unnecessary',()=>{
  const state={run:{input:{assets:[]},steps:[{id:'F05',status:'succeeded'}],needs:[{id:'n1',kind:'animation'}]}} as unknown as StudioState
  expect(nodeStatus(state,'F01.4')).toBe('skipped')
  expect(nodeStatus(state,'F08')).toBe('skipped')
 })
})
