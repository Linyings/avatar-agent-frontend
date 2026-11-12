// Upload failure recovery keeps successful files and the existing draft.
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {MemoryRouter,useLocation} from 'react-router-dom'
import type {ReactNode} from 'react'
import StudioHome from './StudioHome'

const api=vi.hoisted(()=>({create:vi.fn(),upload:vi.fn(),catalog:vi.fn(),voices:vi.fn()}))
vi.mock('./Studio.module.css',()=>({default:{}}))
vi.mock('@/features/auth',()=>({useAuth:()=>({user:{user_id:'review-user'}})}))
vi.mock('@/features/projects',()=>({ProjectService:{getProjects:async()=>({projects:[]})}}))
vi.mock('./studioService',()=>({createStudio:api.create,uploadStudioFile:api.upload,getStyleCatalog:api.catalog,getVoiceCatalog:api.voices,mediaBlob:vi.fn(),requestID:()=>crypto.randomUUID()}))
vi.mock('./StudioShell',()=>({
 StudioShell:({children}:{children:ReactNode})=><>{children}</>,
 PackageLibrary:()=>null,
 ProjectArtwork:()=>null,
 MoreLink:()=>null,
 ProtectedMedia:({url,kind,alt}:{url:string;kind?:string;alt?:string})=>kind==='video'?<video aria-label="风格动态预览" src={url}/>:<img src={url} alt={alt}/>,
}))
beforeEach(()=>{
 vi.clearAllMocks()
 sessionStorage.clear()
 api.catalog.mockReset().mockResolvedValue({styles:[{id:'mg-isometric',name:'等轴 2.5D',published:true,legacy:false,preview:'/catalog/isometric/preview'}]})
 api.voices.mockReset().mockResolvedValue({default_voice:'Wise_Woman',default_voice_model:'minimax/speech-2.8-hd',voices:[],voice_models:[{id:'minimax/speech-2.8-hd',name:'MiniMax Speech 2.8 HD',default_voice:'Wise_Woman',supports_speed:true,voices:[{id:'Wise_Woman',name:'睿智女声 · Wise Woman'},{id:'Calm_Woman',name:'沉稳女声 · Calm Woman'}]},{id:'kling-lip-sync/tts',name:'可灵 Kling TTS',default_voice:'genshin_vindi2',supports_speed:true,voices:[{id:'dongbeilaotie_speech02',name:'东北老铁'}]}]})
 Object.defineProperty(document,'fonts',{configurable:true,value:{addEventListener:vi.fn(),removeEventListener:vi.fn()}})
 api.create.mockResolvedValue({id:'isolated-draft'});api.upload.mockRejectedValue(new Error('文件无法解码或不符合图片/视频要求'))
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:isolated-preview')})
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
})

function Location(){return <output data-testid="route">{useLocation().pathname}</output>}
it('restores the saved style and ratio after sign-in',async()=>{
 sessionStorage.setItem('studio-prompt','登录前的口播主题')
 sessionStorage.setItem('studio-options',JSON.stringify({ratio:'16:9',motionStyle:{id:'mg-isometric',name:'等轴 2.5D'}}))
 render(<MantineProvider><MemoryRouter><StudioHome/><Location/></MemoryRouter></MantineProvider>)
 expect(screen.getByRole('button',{name:'动效风格：等轴 2.5D'})).toBeVisible()
 expect(screen.getByRole('textbox',{name:'描述视频创意'})).toHaveValue('登录前的口播主题')
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(api.create).toHaveBeenCalledWith('登录前的口播主题','16:9','mg-isometric',[]))
 expect(sessionStorage.getItem('studio-options')).toBeNull()
})

it('hides the retained TTS picker and ignores a previously selected TTS voice',async()=>{
 sessionStorage.setItem('studio-options',JSON.stringify({ratio:'9:16',voice:{id:'Calm_Woman',name:'沉稳女声',model:'minimax/speech-2.8-hd'}}))
 render(<MantineProvider><MemoryRouter><StudioHome/></MemoryRouter></MantineProvider>)
 expect(screen.queryByRole('button',{name:/配音音色/})).not.toBeInTheDocument()
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'原声口播'}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(api.create).toHaveBeenCalledWith('原声口播','9:16','',[]))
 expect(api.voices).not.toHaveBeenCalled()
})
it('replaces only the failed file and keeps earlier uploads without creating another project',async()=>{
 api.upload.mockReset().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('上传中断')).mockResolvedValueOnce({})
 const {container}=render(<MantineProvider><MemoryRouter><StudioHome/><Location/></MemoryRouter></MantineProvider>)
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'附件重试'}})
 const input=container.querySelector('input[type="file"]')!
 const good=new File(['good'],'good.png',{type:'image/png'})
 const bad=new File(['bad'],'bad.png',{type:'image/png'})
 fireEvent.change(input,{target:{files:[good,bad]}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await screen.findByText('上传中断')
 expect(screen.getByRole('button',{name:'移除good.png'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'移除bad.png'}))
 const replacement=new File(['replacement'],'replacement.png',{type:'image/png'})
 fireEvent.change(input,{target:{files:[replacement]}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/workspace/isolated-draft'))
 expect(api.create).toHaveBeenCalledTimes(1)
 expect(api.upload.mock.calls.map(call=>[call[0],call[1].name,call[2]])).toEqual([
  ['isolated-draft','good.png','photo'],['isolated-draft','bad.png','image'],['isolated-draft','replacement.png','image'],
 ])
})
afterEach(cleanup)

it('allows removing an invalid attachment after project creation succeeds but upload fails',async()=>{
 const {container}=render(<MantineProvider><MemoryRouter><StudioHome/></MemoryRouter></MantineProvider>)
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'讲解科学知识'}})
 const input=container.querySelector('input[type="file"]')!
 fireEvent.change(input,{target:{files:[new File(['invalid-image'],'bad.png',{type:'image/png'})]}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(api.upload).toHaveBeenCalledTimes(1))
 await screen.findByText('文件无法解码或不符合图片/视频要求')
 // Retry must permit correcting a permanently invalid file, without a reload.
 expect(screen.getByRole('button',{name:'移除bad.png'})).toBeEnabled()
})

it('accepts any format but rejects files over the size cap or empty before saving them',async()=>{
 render(<MantineProvider><MemoryRouter><StudioHome/></MemoryRouter></MantineProvider>)
 const add=screen.getByRole('button',{name:'添加参考素材'})
 const svg=new File(['svg'],'diagram.svg',{type:'image/svg+xml'})
 fireEvent.drop(add,{dataTransfer:{files:[svg]}})
 expect(screen.getByRole('button',{name:'移除diagram.svg'})).toBeInTheDocument()
 const largeVideo=new File(['video'],'large.mp4',{type:'video/mp4'})
 Object.defineProperty(largeVideo,'size',{value:256*1024*1024+1})
 fireEvent.drop(add,{dataTransfer:{files:[largeVideo]}})
 expect(await screen.findByRole('alert')).toHaveTextContent('单个文件不能超过 256 MB')
 fireEvent.drop(add,{dataTransfer:{files:[new File([],'empty.pdf',{type:'application/pdf'})]}})
 expect(await screen.findByRole('alert')).toHaveTextContent('不能上传空文件')
 expect(screen.queryByRole('button',{name:'移除large.mp4'})).not.toBeInTheDocument()
 expect(api.create).not.toHaveBeenCalled()
 expect(api.upload).not.toHaveBeenCalled()
})

it('adds multiple reference links and rejects unsafe URLs before creating a project',async()=>{
 render(<MantineProvider><MemoryRouter><StudioHome/><Location/></MemoryRouter></MantineProvider>)
 fireEvent.click(screen.getByRole('button',{name:'添加参考素材'}))
 fireEvent.click(await screen.findByRole('menuitem',{name:'添加网页链接'}))
 const links=await screen.findByRole('textbox',{name:'网页链接'})
 fireEvent.change(links,{target:{value:'javascript:alert(1)'}})
 fireEvent.click(screen.getByRole('button',{name:'添加链接'}))
 expect(await screen.findByText('请输入完整的 http:// 或 https:// 网页链接')).toBeVisible()
 expect(api.create).not.toHaveBeenCalled()
 fireEvent.change(links,{target:{value:'https://example.com/a\nhttps://example.com/b\nhttps://example.com/a'}})
 fireEvent.click(screen.getByRole('button',{name:'添加链接'}))
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
 expect(screen.getByRole('button',{name:'移除https://example.com/a'})).toBeEnabled()
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'参考这些页面制作视频'}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/workspace/isolated-draft'))
 expect(api.create).toHaveBeenCalledWith('参考这些页面制作视频','9:16','',['https://example.com/a','https://example.com/b'])
})

it('creates a portrait project with the selected motion style and keeps it on upload retry',async()=>{
 api.upload.mockReset().mockRejectedValueOnce(new Error('上传中断')).mockResolvedValue({})
 render(<MantineProvider><MemoryRouter initialEntries={['/?mode=animation']}><StudioHome/><Location/></MemoryRouter></MantineProvider>)
 expect(screen.queryByRole('textbox',{name:'制作类型'})).not.toBeInTheDocument()
 fireEvent.click(await screen.findByRole('button',{name:'预览等轴 2.5D'}))
 fireEvent.click(screen.getByRole('button',{name:'使用此风格'}))
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
 expect(screen.getByRole('button',{name:'动效风格：等轴 2.5D'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'知识科普口播'}))
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'只在主题里写口播也保留动效'}})
 fireEvent.drop(screen.getByRole('button',{name:'添加参考素材'}),{dataTransfer:{files:[new File(['portrait'],'portrait.png',{type:'image/png'})]}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await screen.findByText('上传中断')
 expect(screen.getByRole('button',{name:'动效风格：等轴 2.5D'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/workspace/isolated-draft'))
 expect(api.create).toHaveBeenCalledTimes(1)
 expect(api.create).toHaveBeenCalledWith('只在主题里写口播也保留动效','9:16','mg-isometric',[])
 expect(api.upload.mock.calls.map(call=>call[2])).toEqual(['photo','photo'])
})

it('accepts any file type and routes each to the right upload kind',async()=>{
 api.upload.mockReset().mockResolvedValue({})
 render(<MantineProvider><MemoryRouter><StudioHome/><Location/></MemoryRouter></MantineProvider>)
 const add=screen.getByRole('button',{name:'添加参考素材'})
 const files=[
  new File(['p'],'portrait.webp',{type:'image/webp'}),
  new File(['v'],'clip.mov',{type:'video/quicktime'}),
  new File(['a'],'voice.m4a',{type:'audio/mp4'}),
  new File(['t'],'notes.md',{type:'text/markdown'}),
  new File(['d'],'brief.pdf',{type:'application/pdf'}),
  new File(['z'],'bundle.zip',{type:'application/zip'}),
 ]
 fireEvent.drop(add,{dataTransfer:{files}})
 expect(screen.queryByText(/支持 PNG/)).toBeNull()
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'任意文件'}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/workspace/isolated-draft'))
 expect(api.upload.mock.calls.map(call=>[call[1].name,call[2]])).toEqual([['portrait.webp','photo'],['clip.mov','video'],['voice.m4a','audio'],['notes.md','text'],['brief.pdf','file'],['bundle.zip','file']])
})

it('file pickers do not restrict file types',()=>{
 const {container}=render(<MantineProvider><MemoryRouter><StudioHome/></MemoryRouter></MantineProvider>)
 const inputs=[...container.querySelectorAll('input[type="file"]')]
 expect(inputs.length).toBeGreaterThan(0)
 for(const input of inputs)expect(input.getAttribute('accept')??'').toBe('')
})

it('accepts a mixed multi-file drop, keeps one chosen portrait, and avoids duplicate selection',async()=>{
 api.upload.mockReset().mockResolvedValue({})
 render(<MantineProvider><MemoryRouter><StudioHome/><Location/></MemoryRouter></MantineProvider>)
 const first=new File(['first'],'first.png',{type:'image/png'})
 const portrait=new File(['portrait'],'portrait.png',{type:'image/png'})
 const video=new File(['video'],'reference.mp4',{type:'video/mp4'})
 const add=screen.getByRole('button',{name:'添加参考素材'})
 fireEvent.drop(add,{dataTransfer:{files:[first,portrait,video]}})
 fireEvent.drop(add,{dataTransfer:{files:[first]}})
 expect(screen.getAllByRole('button',{name:'移除first.png'})).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'设为主人物portrait.png'}))
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'上传多个素材'}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/workspace/isolated-draft'))
 expect(api.upload.mock.calls.map(call=>[call[1].name,call[2]])).toEqual([['first.png','image'],['portrait.png','photo'],['reference.mp4','video']])
})

it('assigns a replacement portrait after the chosen portrait fails without reuploading reference images',async()=>{
 api.upload.mockReset().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('人物图片无效')).mockResolvedValueOnce({})
 render(<MantineProvider><MemoryRouter><StudioHome/><Location/></MemoryRouter></MantineProvider>)
 const add=screen.getByRole('button',{name:'添加参考素材'})
 fireEvent.drop(add,{dataTransfer:{files:[new File(['ref'],'ref.png',{type:'image/png'}),new File(['bad'],'portrait.png',{type:'image/png'})]}})
 fireEvent.click(screen.getByRole('button',{name:'设为主人物portrait.png'}))
 fireEvent.change(screen.getByRole('textbox',{name:'描述视频创意'}),{target:{value:'人物替换测试'}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await screen.findByText('人物图片无效')
 fireEvent.click(screen.getByRole('button',{name:'移除portrait.png'}))
 fireEvent.drop(add,{dataTransfer:{files:[new File(['replacement'],'replacement.png',{type:'image/png'})]}})
 fireEvent.click(screen.getByRole('button',{name:'发送创意'}))
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/workspace/isolated-draft'))
 expect(api.create).toHaveBeenCalledTimes(1)
 expect(api.upload.mock.calls.map(call=>[call[1].name,call[2]])).toEqual([['ref.png','image'],['portrait.png','photo'],['replacement.png','photo']])
})
