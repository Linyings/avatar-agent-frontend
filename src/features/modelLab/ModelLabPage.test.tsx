import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {MemoryRouter} from 'react-router-dom'
import ModelLabPage from './ModelLabPage'

const api=vi.hoisted(()=>({models:vi.fn(),list:vi.fn(),create:vi.fn(),get:vi.fn(),rate:vi.fn(),setDefault:vi.fn(),media:vi.fn()}))
vi.mock('./modelLabService',()=>({getMediaModels:api.models,listLabRuns:api.list,createLabRun:api.create,getLabRun:api.get,rateLabResult:api.rate,setDefaultModel:api.setDefault,labFileURL:(id:string,f:string)=>`/files/${id}/${f}`}))
vi.mock('@/features/agent/studioService',()=>({mediaBlob:api.media}))
vi.mock('@/features/agent/StudioShell',()=>({StudioShell:({children}:{children:React.ReactNode})=><div>{children}</div>}))

const caps={first_frame:false,last_frame:false,native_audio:false,needs_lyrics:false}
const models=[
 {id:'mureka-ai/mureka-v9/generate-bgm',name:'mureka-v9/generate-bgm',kind:'music',family:'mureka',capabilities:caps},
 {id:'minimax/music-2.6/text-to-instrumental',name:'minimax/music-2.6/text-to-instrumental',kind:'music',family:'minimax-music',capabilities:caps},
 {id:'minimax/music-2.6/text-to-music',name:'minimax/music-2.6/text-to-music',kind:'music',family:'minimax-music',capabilities:{...caps,needs_lyrics:true}},
 {id:'kling-v3.0-pro/image-to-video',name:'kling-v3.0-pro-image-to-video',kind:'i2v',family:'kling',capabilities:{...caps,first_frame:true,last_frame:true,durations:[3,5,10]}},
]
beforeEach(()=>{
 vi.clearAllMocks()
 api.models.mockResolvedValue({models,defaults:{music:'mureka-ai/mureka-v9/generate-bgm'}})
 api.list.mockResolvedValue({runs:[],summary:[]})
 api.media.mockResolvedValue('blob:x')
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
})
afterEach(cleanup)
const open=()=>render(<MantineProvider><MemoryRouter><ModelLabPage/></MemoryRouter></MantineProvider>)

it('lists every model of the chosen kind grouped by family and marks the default',async()=>{
 open()
 const list=await screen.findByRole('group',{name:'可选模型'})
 expect(within(list).getAllByRole('checkbox')).toHaveLength(3)
 expect(within(list).getByText('mureka')).toBeVisible()
 expect(within(list).getByText('默认')).toBeVisible()
 fireEvent.click(screen.getByRole('radio',{name:'图生视频'}))
 await waitFor(()=>expect(within(screen.getByRole('group',{name:'可选模型'})).getAllByRole('checkbox')).toHaveLength(1))
})

it('requires an explicit paid-order confirmation and sends the exact count',async()=>{
 api.create.mockResolvedValue({id:'lab-1',kind:'music',status:'running',results:[]})
 api.get.mockResolvedValue({id:'lab-1',kind:'music',status:'done',results:[]})
 open()
 const list=await screen.findByRole('group',{name:'可选模型'})
 fireEvent.click(within(list).getByRole('checkbox',{name:/mureka-v9/}))
 fireEvent.click(within(list).getByRole('checkbox',{name:/text-to-instrumental/}))
 fireEvent.change(screen.getByRole('textbox',{name:'提示词'}),{target:{value:'轻快科技感'}})
 fireEvent.click(screen.getByRole('button',{name:'开始对比'}))
 expect(api.create).not.toHaveBeenCalled()
 const dialog=await screen.findByRole('dialog')
 expect(dialog).toHaveTextContent('2 个付费订单')
 fireEvent.click(within(dialog).getByRole('button',{name:'确认提交'}))
 await waitFor(()=>expect(api.create).toHaveBeenCalledWith(expect.objectContaining({kind:'music',prompt:'轻快科技感',models:['mureka-ai/mureka-v9/generate-bgm','minimax/music-2.6/text-to-instrumental'],confirm:2})))
})

it('compares talking avatars from a portrait and a driving voice',async()=>{
 api.models.mockResolvedValue({models:[...models,{id:'kling-v2-ai-avatar-standard/image-audio-to-video',name:'kling-avatar-std',kind:'avatar',family:'kling-avatar',capabilities:caps}],defaults:{}})
 api.create.mockResolvedValue({id:'lab-3',kind:'avatar',status:'running',results:[]})
 open()
 fireEvent.click(await screen.findByRole('radio',{name:'数字人口型'}))
 fireEvent.click(await within(screen.getByRole('group',{name:'可选模型'})).findByRole('checkbox',{name:/kling-avatar-std/}))
 fireEvent.change(screen.getByRole('textbox',{name:/参考图片地址/}),{target:{value:'https://x/face.png'}})
 fireEvent.change(screen.getByRole('textbox',{name:'驱动音频地址'}),{target:{value:'https://x/voice.wav'}})
 fireEvent.click(screen.getByRole('button',{name:'开始对比'}))
 fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:'确认提交'}))
 await waitFor(()=>expect(api.create).toHaveBeenCalledWith(expect.objectContaining({kind:'avatar',images:['https://x/face.png'],audio:'https://x/voice.wav',confirm:1})))
})

it('caps the selection at eight models and asks for lyrics when a song model is chosen',async()=>{
 open()
 const list=await screen.findByRole('group',{name:'可选模型'})
 fireEvent.click(within(list).getByRole('checkbox',{name:/text-to-music/}))
 expect(screen.getByRole('textbox',{name:'歌词'})).toBeVisible()
})

it('shows results side by side with cost and lets an admin rate and set the default',async()=>{
 const run={id:'lab-2',kind:'music',status:'done',created_at:'2026-11-09T10:00:00Z',request:{prompt:'p'},results:[
  {model:'mureka-ai/mureka-v9/generate-bgm',name:'mureka-v9/generate-bgm',family:'mureka',status:'succeeded',file:'00-mureka.mp3',media:'audio',seconds:42.3,cost:'0.05',sent:{prompt:'p',n:1}},
  {model:'minimax/music-2.6/text-to-instrumental',name:'minimax',family:'minimax-music',status:'failed',error:'模型返回失败',seconds:3,sent:{}},
 ]}
 api.list.mockResolvedValue({runs:[run],summary:[]})
 api.get.mockResolvedValue(run)
 api.rate.mockResolvedValue({saved:true});api.setDefault.mockResolvedValue({defaults:{music:'mureka-ai/mureka-v9/generate-bgm'}})
 open()
 fireEvent.click(await screen.findByRole('button',{name:/查看 lab-2/}))
 const grid=await screen.findByRole('region',{name:'对比结果'})
 const ok=within(grid).getByRole('article',{name:'mureka-v9/generate-bgm'})
 expect(ok).toHaveTextContent('0.05');expect(ok).toHaveTextContent('42.3')
 expect(within(grid).getByRole('article',{name:'minimax'})).toHaveTextContent('模型返回失败')
 fireEvent.click(within(ok).getByRole('radio',{name:'4 分'}))
 await waitFor(()=>expect(api.rate).toHaveBeenCalledWith('lab-2','mureka-ai/mureka-v9/generate-bgm',4,''))
 fireEvent.click(within(ok).getByRole('button',{name:'设为默认'}))
 await waitFor(()=>expect(api.setDefault).toHaveBeenCalledWith('music','mureka-ai/mureka-v9/generate-bgm'))
})
