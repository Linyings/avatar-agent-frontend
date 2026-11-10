import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import StudioWorkspace from './StudioWorkspace'
import type {StudioState} from './studioService'
import type {AgentStreamEvent} from './agentService'

const api=vi.hoisted(()=>({get:vi.fn(),history:vi.fn(),invoke:vi.fn(),approve:vi.fn(),chat:vi.fn(),subscribe:vi.fn()}))
vi.mock('./studioService',async()=>({...await vi.importActual('./studioService'),getStudio:api.get,invokePackage:api.invoke,approveGate:api.approve}))
vi.mock('./agentService',()=>({getHistory:api.history,sendChat:api.chat,stopAgent:vi.fn(),subscribeAgentStream:api.subscribe}))
vi.mock('./StudioShell',()=>({StudioShell:({children}:{children:React.ReactNode})=><div>{children}</div>,PackageLibrary:()=>null,ProtectedMedia:({kind,alt}:{kind:string;alt?:string})=><div data-testid={`media-${kind}`}>{alt}</div>}))
vi.mock('./WorkflowCanvasView',()=>({default:({onOpen}:{onOpen:(id:string)=>void})=> <div data-testid="canvas">画布<button onClick={()=>onOpen('delivery')}>打开交付详情</button><button onClick={()=>onOpen('preview')}>打开预览详情</button></div>}))
vi.mock('@/components/ui',()=>({MarkdownLite:({content}:{content:string})=><p>{content}</p>}))
function fixture():StudioState{
 const input={revision:1,title:'测试项目',topic:'口播',script:'需要审核的稿件。',direction:'',ratio:'9:16',style:'',voice:'',use_avatar:true,assets:[]}
 return {project:{id:'test',name:'测试项目',input},run:{id:'run',status:'awaiting_confirmation',stage:'F03',confirmation:'script',confirmation_version:'v1',input,script:input.script,steps:[],segments:[{id:'p1',text:input.script,chapter:'开场',start:0,duration:0}],needs:[],materials:[],shots:[],artifacts:[],duration:0,pause_requested:false},packages:[],proposal:null,styles:[],voices:[],agent_configured:true}
}
function open(){return render(<MantineProvider><MemoryRouter initialEntries={['/workspace/test']}><Routes><Route path="/workspace/:projectId" element={<StudioWorkspace/>}/></Routes></MemoryRouter></MantineProvider>)}
beforeEach(()=>{vi.resetAllMocks();HTMLElement.prototype.scrollIntoView=vi.fn();Object.defineProperty(document,'fonts',{configurable:true,value:{addEventListener:vi.fn(),removeEventListener:vi.fn()}});api.history.mockResolvedValue({messages:[]});api.get.mockResolvedValue(fixture())})
afterEach(cleanup)
it('hands exhausted retries to Agent diagnosis without submitting another production attempt',async()=>{
 const state=fixture();state.run!.status='failed';state.run!.confirmation=undefined;state.run!.stage='F07/m1';state.run!.error_step_id='F07/m1/scene-2';state.run!.error='场景2关键内容未完整展示';
 state.run!.steps=[{id:'F07/m1/scene-2',status:'failed',seconds:3,error:state.run!.error,retry:{last_error:state.run!.error,strategy:'调整入场时间',automatic_retries:3,exhausted:true}}];
 api.get.mockResolvedValue(state);api.chat.mockResolvedValue({reply:'已读取失败记录，等待你选择处理方式。'});
 open();const status=await screen.findByRole('region',{name:'制作状态'});
 expect(status).toHaveTextContent('等待你处理');expect(status).toHaveTextContent('3 次');
 expect(within(status).queryByRole('button',{name:'根据报错修复并重试'})).not.toBeInTheDocument();
 expect(api.chat).not.toHaveBeenCalled();expect(api.invoke).not.toHaveBeenCalled();
 fireEvent.click(within(status).getByRole('button',{name:'交给 Agent 排查'}));
 await waitFor(()=>expect(api.chat).toHaveBeenCalledOnce());
 expect(api.chat.mock.calls[0][0].message).toContain('F07/m1/scene-2');
 expect(api.chat.mock.calls[0][0].message).toContain('只排查');
 expect(api.chat.mock.calls[0][0].message).toContain('跳过');
 expect(api.invoke).not.toHaveBeenCalled();expect(api.approve).not.toHaveBeenCalled();
});
it('saves global and segment voice speed without starting generation',async()=>{
 api.invoke.mockResolvedValue({})
 open();fireEvent.click(await screen.findByRole('button',{name:'制作设置'}))
 fireEvent.change(await screen.findByRole('textbox',{name:'全片配音语速'}),{target:{value:'1.1'}})
 fireEvent.click(screen.getByText('单段语速微调'))
 fireEvent.change(screen.getByRole('textbox',{name:'p1 · 开场语速'}),{target:{value:'1.15'}})
 expect(api.invoke).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'保存设置'}))
 await waitFor(()=>expect(api.invoke).toHaveBeenCalledWith('test','avatar.configure',expect.objectContaining({voice_speed:1.1,segment_voice_speeds:{p1:1.15}})))
 expect(api.chat).not.toHaveBeenCalled();expect(api.approve).not.toHaveBeenCalled()
})
it('switches the voice model in settings and saves the model with its default voice',async()=>{
 const state=fixture();state.project.input.voice='Wise_Woman';state.project.input.voice_speed=1.1
 state.voice_models=[
  {id:'minimax/speech-2.8-hd',name:'MiniMax Speech 2.8 HD',default_voice:'Wise_Woman',supports_speed:true,voices:[{id:'Wise_Woman',name:'睿智女声'}]},
  {id:'alibaba/qwen3-tts-flash',name:'千问 Qwen3-TTS Flash',default_voice:'Cherry',supports_speed:false,voices:[{id:'Cherry',name:'芊悦'},{id:'Neil',name:'阿闻'}]},
 ]
 api.get.mockResolvedValue(state);api.invoke.mockResolvedValue({})
 open();fireEvent.click(await screen.findByRole('button',{name:'制作设置'}))
 fireEvent.click(await screen.findByRole('combobox',{name:'配音模型'}))
 fireEvent.click(await screen.findByRole('option',{name:'千问 Qwen3-TTS Flash'}))
 await waitFor(()=>expect(screen.getByRole('combobox',{name:'配音音色'})).toHaveValue('芊悦'))
 expect(screen.getByRole('textbox',{name:'全片配音语速'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'保存设置'}))
 await waitFor(()=>expect(api.invoke).toHaveBeenCalledWith('test','avatar.configure',expect.objectContaining({voice_model:'alibaba/qwen3-tts-flash',voice:'Cherry',voice_speed:1})))
 expect(api.chat).not.toHaveBeenCalled()
})
it('offers explicit continuation for an old duration failure without automatically starting work',async()=>{
 const state=fixture();state.run!.status='failed';state.run!.stage='F04/p7';state.run!.confirmation=undefined
 state.audio_timing={total:7,completed:7,seconds:93.537249,longest_seconds:19.50025,resume_available:true}
 api.get.mockResolvedValue(state);open()
 const status=await screen.findByRole('region',{name:'制作状态'})
 expect(status).toHaveTextContent('时长限制已取消，可以继续制作')
 expect(status).toHaveTextContent('累计 93.54 秒')
 expect(within(status).queryByRole('button',{name:'编辑文案'})).not.toBeInTheDocument()
 expect(api.invoke).not.toHaveBeenCalled();expect(api.chat).not.toHaveBeenCalled();expect(api.approve).not.toHaveBeenCalled()
 fireEvent.click(within(status).getByRole('button',{name:'继续制作'}))
 await waitFor(()=>expect(api.invoke).toHaveBeenCalledWith('test','avatar.control',{action:'retry'}))
 expect(api.chat).not.toHaveBeenCalled();expect(api.approve).not.toHaveBeenCalled()
})
it('keeps the completion card before later conversation messages after sending and reloading history',async()=>{
 const state=fixture();state.run!.status='succeeded';state.run!.stage='F12';state.run!.confirmation=undefined
 state.run!.completed_at='2026-11-07T08:00:00Z';state.run!.updated_at='2026-11-07T08:05:00Z';api.get.mockResolvedValue(state)
 api.history.mockResolvedValue({messages:[
  {id:'before',role:'user',content:'请制作视频',createdAt:'2026-11-07T07:59:00Z'},
  {id:'after',role:'user',content:'聊聊下一期选题',createdAt:'2026-11-07T08:01:00Z'},
 ]});api.chat.mockResolvedValue({reply:'可以聊聊下一期的方向。'})
 const view=open();const status=await screen.findByRole('region',{name:'制作状态'})
 expect(status).toHaveTextContent('视频制作已完成')
 expect(screen.getByText('请制作视频').compareDocumentPosition(status)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 expect(status.compareDocumentPosition(screen.getByText('聊聊下一期选题'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.change(screen.getByRole('textbox',{name:'向 Agent 发送指令'}),{target:{value:'先聊聊拍摄风格'}})
 fireEvent.click(screen.getByRole('button',{name:'发送消息'}))
 await screen.findByText('可以聊聊下一期的方向。')
 await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(2))
 expect(status.compareDocumentPosition(screen.getByText('先聊聊拍摄风格'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 expect(screen.getAllByRole('region',{name:'制作状态'})).toHaveLength(1)
 view.unmount();open()
 const restored=await screen.findByRole('region',{name:'制作状态'})
 expect(restored.compareDocumentPosition(screen.getByText('聊聊下一期选题'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
it('anchors a status with no timestamp once instead of moving it after every new reply',async()=>{
 const state=fixture();state.run!.status='succeeded';state.run!.confirmation=undefined;api.get.mockResolvedValue(state)
 api.chat.mockResolvedValue({reply:'新的回复'})
 open();const status=await screen.findByRole('region',{name:'制作状态'})
 fireEvent.change(screen.getByRole('textbox',{name:'向 Agent 发送指令'}),{target:{value:'新的话题'}})
 fireEvent.click(screen.getByRole('button',{name:'发送消息'}))
 await screen.findByText('新的回复')
 expect(status.compareDocumentPosition(screen.getByText('新的话题'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
it('limits delivery details to final video and cover, with previews in their own node',async()=>{
 const state=fixture();state.packages=['F11','F12'].map(node=>({id:node==='F12'?'delivery':'preview',node,title:node==='F12'?'成片交付':'有声预览',version:'1',tool:node,entrypoint:node,description:'说明',dependencies:[],outputs:[],ready:true,reason:''}))
 state.run!.artifacts=[{id:'video',name:'口播成片.mp4',media_type:'video/mp4'},{id:'cover',name:'封面.jpg',media_type:'image/jpeg'},{id:'preview-s1',name:'片段有声预览.mp4',media_type:'video/mp4'},{id:'project',name:'制作工程.zip',media_type:'application/zip'}];api.get.mockResolvedValue(state)
 open();fireEvent.click(await screen.findByRole('button',{name:'打开交付详情'}))
 let detail=within(screen.getByRole('complementary',{name:'步骤详情'}))
 expect(detail.getByRole('heading',{name:'口播成片.mp4'})).toBeVisible()
 expect(detail.getByRole('heading',{name:'封面.jpg'})).toBeVisible()
 expect(detail.getByTestId('media-image')).toBeInTheDocument()
 expect(detail.getAllByRole('button',{name:'下载'})).toHaveLength(2)
 expect(detail.queryByText('片段有声预览.mp4')).not.toBeInTheDocument()
 expect(detail.queryByText('制作工程.zip')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'打开预览详情'}));detail=within(screen.getByRole('complementary',{name:'步骤详情'}))
 expect(detail.getByRole('heading',{name:'片段有声预览.mp4'})).toBeVisible()
 expect(detail.queryByRole('heading',{name:'口播成片.mp4'})).not.toBeInTheDocument()
})
it('keeps one review card in Agent chat and typed confirmation never approves or starts chat work',async()=>{
 open();const chat=screen.getByRole('complementary',{name:'Agent 对话'})
 await within(chat).findByRole('region',{name:'制作状态'})
 expect(screen.getAllByRole('button',{name:'已确认，继续'})).toHaveLength(1)
 fireEvent.change(screen.getByRole('textbox',{name:'向 Agent 发送指令'}),{target:{value:'已确认'}})
 fireEvent.click(screen.getByRole('button',{name:'发送消息'}))
 expect(api.approve).not.toHaveBeenCalled();expect(api.chat).not.toHaveBeenCalled()
 expect(within(chat).getByText(/文字回复不会直接批准/)).toBeVisible()
 expect(within(chat).queryByRole('region',{name:'待确认文案'})).not.toBeInTheDocument()
 expect(within(chat).getByRole('button',{name:'已确认，继续'})).toBeEnabled()
 fireEvent.click(within(chat).getByRole('button',{name:'已确认，继续'}))
 await waitFor(()=>expect(api.approve).toHaveBeenCalledOnce())
 expect(api.approve.mock.calls[0][0]).toMatchObject({id:'run',confirmation_version:'v1'})
})
it('groups tool updates into a collapsed process inside the associated reply and retains it before later messages',async()=>{
 const state=fixture();state.run=null;api.get.mockResolvedValue(state)
 let receive:(event:AgentStreamEvent)=>void=()=>{}
 api.subscribe.mockImplementation((_id:string,callback:typeof receive)=>{receive=callback;return()=>{}})
 let finish:(value:unknown)=>void=()=>{}
 api.chat.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 open();await screen.findByRole('region',{name:'制作状态'})
 fireEvent.change(screen.getByRole('textbox',{name:'向 Agent 发送指令'}),{target:{value:'请检查并规划'}})
 fireEvent.click(screen.getByRole('button',{name:'发送消息'}))
 const turn=api.chat.mock.calls[0][0].turnId
 act(()=>{
  receive({type:'tool',turnId:turn,callId:'check',tool:'get_project_state',status:'done'})
  receive({type:'tool',turnId:turn,callId:'plan',tool:'plan_project',status:'running'})
 })
 const process=screen.getByRole('group',{name:'Agent 执行过程'})
 expect(process).not.toHaveAttribute('open')
 expect(process).toHaveTextContent('规划制作流程')
 expect(screen.getAllByRole('group',{name:'Agent 执行过程'})).toHaveLength(1)
 act(()=>receive({type:'tool',turnId:turn,callId:'plan',tool:'plan_project',status:'done'}))
 await act(async()=>finish({reply:'已检查，等待你决定。'}))
 expect(process).toHaveTextContent('执行过程 · 2 项')
 const reply=await screen.findByText('已检查，等待你决定。')
 expect(reply.closest('[data-chat-item="message"]')).toContainElement(process)
 expect(process.compareDocumentPosition(reply)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.change(screen.getByRole('textbox',{name:'向 Agent 发送指令'}),{target:{value:'先讨论风格'}})
 fireEvent.click(screen.getByRole('button',{name:'发送消息'}))
 expect(process.compareDocumentPosition(screen.getByText('先讨论风格'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
it('places API failures outside the workspace as a dismissible notice',async()=>{
 const state=fixture();state.run!.status='failed';state.run!.confirmation=undefined;api.get.mockResolvedValue(state);api.invoke.mockRejectedValue(new Error('验收：服务暂不可用'))
 open();fireEvent.click(await screen.findByRole('button',{name:'根据报错修复并重试'}))
 const alert=await screen.findByRole('alert')
 expect(alert).toHaveTextContent('验收：服务暂不可用')
 expect(screen.getByRole('main')).not.toContainElement(alert)
 fireEvent.click(screen.getByRole('button',{name:'关闭提示'}));expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('refreshes unknown orders without invoking generation or retry tools',async()=>{
 const state=fixture();state.run!.status='submission_unknown';state.run!.confirmation=undefined;api.get.mockResolvedValue(state)
 open();fireEvent.click(await screen.findByRole('button',{name:'刷新订单状态'}))
 await waitFor(()=>expect(api.get.mock.calls.length).toBeGreaterThan(1))
 expect(api.invoke).not.toHaveBeenCalled();expect(api.approve).not.toHaveBeenCalled()
 expect(screen.queryByRole('button',{name:/恢复当前运行|恢复运行|已确认/})).not.toBeInTheDocument()
 fireEvent.change(screen.getByRole('textbox',{name:'向 Agent 发送指令'}),{target:{value:'已确认'}});fireEvent.click(screen.getByRole('button',{name:'发送消息'}))
 expect(api.chat).not.toHaveBeenCalled()
})
it('offers one explicit recovery action for unknown requests in testing mode',async()=>{
 const state=fixture();state.testing_mode=true;state.run!.status='submission_unknown';state.run!.confirmation=undefined;api.get.mockResolvedValue(state)
 api.invoke.mockImplementation(()=>new Promise(()=>{}))
 open();const button=await screen.findByRole('button',{name:'重新执行并继续'})
 expect(screen.queryByRole('button',{name:'刷新订单状态'})).not.toBeInTheDocument()
 expect(api.invoke).not.toHaveBeenCalled()
 fireEvent.click(button);fireEvent.click(button)
 await waitFor(()=>expect(api.invoke).toHaveBeenCalledOnce())
 expect(api.invoke).toHaveBeenCalledWith('test','avatar.control',{action:'retry'})
 expect(api.approve).not.toHaveBeenCalled()
})
it('guides continue messages to the batch choice and submits direct continuation once',async()=>{
 const state=fixture();state.run!.confirmation='audio';state.run!.stage='F04/p1';state.run!.segments[0].audio='p1/audio.wav';state.run!.segments[0].duration=2;api.get.mockResolvedValue(state)
 api.approve.mockImplementation(()=>new Promise(()=>{}))
 open();const button=await screen.findByRole('button',{name:'直接继续制作'})
 fireEvent.change(screen.getByRole('textbox',{name:'向 Agent 发送指令'}),{target:{value:'继续'}})
 fireEvent.click(screen.getByRole('button',{name:'发送消息'}))
 expect(api.chat).not.toHaveBeenCalled();expect(api.invoke).not.toHaveBeenCalled();expect(api.approve).not.toHaveBeenCalled()
 fireEvent.click(button);fireEvent.click(button)
 await waitFor(()=>expect(api.approve).toHaveBeenCalledOnce())
 expect(api.approve.mock.calls[0][0]).toMatchObject({id:'run',confirmation:'audio',confirmation_version:'v1'})
})
