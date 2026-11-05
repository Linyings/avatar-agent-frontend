import {beforeEach, describe, expect, it, vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MantineProvider} from '@mantine/core'
import {MemoryRouter} from 'react-router-dom'
import AvatarMvpPage from './AvatarLegacyPage'
import {avatarMvpService} from './avatarMvpService'

vi.mock('./avatarMvpService',()=>({avatarMvpService:{config:vi.fn(),get:vi.fn(),create:vi.fn(),retry:vi.fn(),video:vi.fn(),latestForProject:vi.fn()}}))
const api=vi.mocked(avatarMvpService)
function mount(path='/avatar-mvp'){return render(<MantineProvider><MemoryRouter initialEntries={[path]}><AvatarMvpPage/></MemoryRouter></MantineProvider>)}
beforeEach(()=>{
  vi.clearAllMocks()
  api.config.mockResolvedValue({configured:true,enabled:true,baseline_approved:false,message:''})
})
describe('avatar MVP page',()=>{
  it('shows the actual server voice after changing TTS providers',async()=>{
    api.config.mockResolvedValue({configured:true,enabled:true,baseline_approved:false,message:'',
      voice:'zh_male_shaonianzixin_uranus_bigtts',tts_model:'doubao-seed-tts-2.0'})
    mount()
    expect(await screen.findByText('zh_male_shaonianzixin_uranus_bigtts 固定音色')).toBeInTheDocument()
    expect(screen.queryByText('Cherry 固定音色')).not.toBeInTheDocument()
  })
  it('shows the configured vendor and model instead of hardcoding RunningHub',async()=>{
    api.config.mockResolvedValue({configured:true,enabled:true,baseline_approved:false,message:'',provider:'minimax',model:'MiniMax-H3'})
    mount()
    expect(await screen.findByText('视频模型：minimax / MiniMax-H3')).toBeInTheDocument()
  })
  it('restores an interrupted task from the URL and retries only that task',async()=>{
    api.get.mockResolvedValue({id:'task-1',status:'interrupted',stage:'generating',title:'测试',script:'一。二。三。',shots:[{id:'shot-1',angle:'正面',framing:'中景',status:'succeeded',clip:{duration:5}},{id:'shot-2',angle:'左前方20度',framing:'半身',status:'failed',error:'查询超时',clip:{duration:5}}],duration:15,review_required:true,stage_seconds:{}})
    api.retry.mockRejectedValue(new Error('提交状态待确认'))
    mount('/avatar-mvp?task_id=task-1')
    expect(await screen.findByText('查询超时')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('task-1',expect.any(AbortSignal))
    await userEvent.click(screen.getByRole('button',{name:'重试失败步骤'}))
    await waitFor(()=>expect(api.retry).toHaveBeenCalledWith('task-1'))
    expect(await screen.findByText('提交状态待确认')).toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })
  it('shows missing configuration and prevents a misleading generation attempt',async()=>{
    api.config.mockResolvedValue({configured:false,enabled:false,baseline_approved:false,message:'RunningHub 未配置'})
    mount()
    expect(await screen.findByText('RunningHub 未配置')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'生成口播视频'})).toBeDisabled()
  })
  it('keeps a new project empty and restores an old project record', async () => {
    api.latestForProject.mockResolvedValueOnce(null)
    const view = render(<MantineProvider><MemoryRouter><AvatarMvpPage projectId="project-new"/></MemoryRouter></MantineProvider>)
    expect(await screen.findByRole('button',{name:'生成口播视频'})).toBeDisabled()
    expect(api.get).not.toHaveBeenCalled()
    view.unmount()

    const record = {id:'task-old',status:'failed',stage:'generating',title:'旧项目',script:'第一句。第二句。第三句。',shots:[{id:'shot-1',angle:'正面',framing:'中景',status:'failed',error:'上传失败',clip:{duration:0}}],duration:0,review_required:true,stage_seconds:{}}
    api.latestForProject.mockResolvedValueOnce(record)
    api.get.mockResolvedValue(record)
    render(<MantineProvider><MemoryRouter><AvatarMvpPage projectId="project-old"/></MemoryRouter></MantineProvider>)
    expect(await screen.findByDisplayValue('第一句。第二句。第三句。')).toBeInTheDocument()
    expect(screen.getByText('这个项目已有制作记录。要换照片或口播稿，请新建一个数字人口播项目；当前项目可以继续重试这一条。')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'生成口播视频'})).not.toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })
})
