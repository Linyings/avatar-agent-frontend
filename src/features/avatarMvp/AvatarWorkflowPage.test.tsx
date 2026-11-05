import {beforeEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MantineProvider} from '@mantine/core'
import {MemoryRouter} from 'react-router-dom'
import AvatarWorkflowPage from './AvatarWorkflowPage'
import {workflowService,type WorkflowRun} from './workflowService'
vi.mock('./workflowService',()=>({workflowService:{catalog:vi.fn(),project:vi.fn(),run:vi.fn(),stop:vi.fn(),read:vi.fn(),artifact:vi.fn(),style:vi.fn(),confirm:vi.fn(),start:vi.fn(),asset:vi.fn()}}))
const api=vi.mocked(workflowService)
const input={revision:1,title:'测试',topic:'',script:'一。',direction:'',style:'flat-vector',voice:'Cherry',ratio:'9:16',use_avatar:false,angles:[],assets:[]}
const base:WorkflowRun={id:'r1',project_id:'p1',version:'avatar-workflow/2.2',status:'running',stage:'F06/n1',input,script:'一。',segments:[],duration:6,stop_requested:false,created_at:'2026-11-04',updated_at:'2026-11-04',steps:[],events:[],needs:[],artifacts:[],descriptions:[],shots:[]}
function mount(url='/avatar-mvp?project_id=p1&run_id=r1'){return render(<MantineProvider env="test"><MemoryRouter initialEntries={[url]}><AvatarWorkflowPage/></MemoryRouter></MantineProvider>)}
beforeEach(()=>{vi.clearAllMocks();api.catalog.mockResolvedValue({version:base.version,styles:[],voices:[{id:'Cherry',name:'Cherry',model:'tts'}],ratios:['9:16','16:9','1:1'],video_understanding:false,video_provider:'runninghub',video_model:'seedance',default_voice:'Cherry'});api.project.mockResolvedValue({id:'p1',input,runs:[]});api.run.mockResolvedValue(base);api.read.mockResolvedValue({read:true});api.stop.mockResolvedValue({...base,status:'stopping',stop_requested:true})})
it('restores the URL run and acknowledges quality without stopping or confirming',async()=>{
 api.run.mockResolvedValue({...base,events:[{id:'e1',node:'F06/n1',type:'quality',message:'音频相关度较低',read:false}]})
 mount();expect(await screen.findByRole('dialog')).toHaveTextContent('此提醒不暂停后台')
 expect(api.run).toHaveBeenCalledWith('r1',expect.any(AbortSignal))
 expect(api.stop).not.toHaveBeenCalled();expect(api.confirm).not.toHaveBeenCalled()
 await userEvent.click(screen.getByRole('button',{name:'知道了'}))
 await waitFor(()=>expect(api.read).toHaveBeenCalledWith('r1','e1'))
 expect(api.stop).not.toHaveBeenCalled()
})
it('only sends a stop request after the user clicks stop',async()=>{
 mount();await screen.findByText('人物生成 · 实测配音 6.00 秒')
 await userEvent.click(screen.getByRole('button',{name:'停止任务'}))
 await waitFor(()=>expect(api.stop).toHaveBeenCalledWith('r1'))
})
it('restores the project and saved inputs from a run-only URL',async()=>{
 mount('/avatar-mvp?run_id=r1')
 await waitFor(()=>expect(api.project).toHaveBeenCalledWith('p1',expect.any(AbortSignal)))
 expect(await screen.findByLabelText('3. 文案内容')).toHaveValue('一。')
 expect(api.start).not.toHaveBeenCalled()
})
it('lets the user explicitly choose two angles without adding a third',async()=>{
 api.run.mockResolvedValue({...base,status:'succeeded'})
 mount();await screen.findByRole('heading',{name:'制作完成'});const picker=screen.getByLabelText('数字人机位（可选）',{selector:'input'})
 await userEvent.click(picker);await userEvent.click(await screen.findByRole('option',{name:'正面'}))
 await userEvent.click(await screen.findByRole('option',{name:'左前方20度'}))
 expect(screen.getByLabelText('制作要求（可选）')).toHaveValue('请使用正面、左前方20度机位拍摄上半身口播。')
 expect(screen.getByLabelText('制作要求（可选）')).not.toHaveValue(expect.stringContaining('右前方'))
 expect(api.start).not.toHaveBeenCalled()
})
it('exposes seven creation inputs and never silently generates at a confirmation gate',async()=>{
 api.run.mockResolvedValue({...base,status:'awaiting_confirmation',confirmation:'script',confirmation_version:'v1',segments:[{id:'p1',text:'一。',chapter:'开头',duration:0,start:0}]})
 mount();await screen.findByRole('button',{name:'确认文案，生成分段配音'})
 expect(screen.getByLabelText('7. 成片比例',{selector:'input'})).toHaveValue('9:16')
 expect(api.confirm).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled()
})
it('does not download uploaded video blobs until their preview is expanded',async()=>{
 api.project.mockResolvedValue({id:'p1',input:{...input,assets:[{id:'source',name:'source.mp4',kind:'video',duration:5,excluded:false}]},runs:[]})
 api.asset.mockReturnValue(new Promise(()=>{}))
 mount();const summary=await screen.findByText('预览已上传原素材')
 expect(api.asset).not.toHaveBeenCalled()
 const details=summary.closest('details')!;details.open=true;fireEvent(details,new Event('toggle'))
 await waitFor(()=>expect(api.asset).toHaveBeenCalledWith('p1','source',expect.any(AbortSignal)))
})
it('shows the content-driven recipe and offers eight layouts without starting a run',async()=>{
 Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()})
 api.run.mockResolvedValue({...base,status:'succeeded',segments:[{id:'p1',chapter:'流程',text:'一。',duration:6,start:0}],shots:[{id:'S1',segment_id:'p1',start:0,end:6,primary:'a1',layout:'full',card:'none',keyword:'',primary_in:0,overlay_in:0,recipe:'steps',intent:'用步骤图解释执行顺序'}]})
 mount();expect(await screen.findByRole('heading',{name:'镜头设计'})).toBeVisible()
 expect(screen.getByText(/用步骤图解释执行顺序/)).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'调整分镜'}))
 await userEvent.click(await screen.findByLabelText('镜头配方',{selector:'input'}))
 expect(await screen.findByRole('option',{name:'动画／素材主画面'})).toBeVisible()
 expect(screen.getByRole('option',{name:'人物＋侧边信息'})).toBeVisible()
 expect(screen.getByRole('option',{name:'总结收束'})).toBeVisible()
 expect(api.start).not.toHaveBeenCalled()
 await userEvent.keyboard('{Escape}');await userEvent.keyboard('{Escape}')
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
