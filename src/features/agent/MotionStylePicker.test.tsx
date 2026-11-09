import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import MotionStylePicker from './MotionStylePicker'

const api=vi.hoisted(()=>({catalog:vi.fn(),media:vi.fn()}))
vi.mock('@/features/auth',()=>({useAuth:()=>({user:{user_id:'test'}})}))
vi.mock('./studioService',()=>({getStyleCatalog:api.catalog,mediaBlob:api.media}))
vi.mock('./StudioShell',()=>({ProtectedMedia:({url,kind,alt}:{url:string;kind?:string;alt?:string})=>kind==='video'?<video aria-label="动态预览" src={url}/>:<img src={url} alt={alt}/>}))
const catalog=[
 {id:'mg-flat-vector',name:'扁平矢量',published:true,legacy:false,preview:'/catalog/flat/preview',card_preview:'/catalog/flat/card-preview',card_poster:'/catalog/flat/card-poster'},
 {id:'mg-isometric',name:'等轴 2.5D',published:true,legacy:false,preview:'/catalog/iso/preview',card_preview:'/catalog/iso/card-preview',card_poster:'/catalog/iso/card-poster'},
 {id:'old',name:'旧版',published:true,legacy:true},
 {id:'missing',name:'未发布',published:false,legacy:false},
]
beforeEach(()=>{
 vi.clearAllMocks();api.catalog.mockReset().mockResolvedValue({styles:catalog});api.media.mockReset().mockImplementation(async(url:string)=>'blob:'+url)
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined)
 vi.stubGlobal('IntersectionObserver',class{callback:IntersectionObserverCallback;constructor(callback:IntersectionObserverCallback){this.callback=callback} observe(target:Element){this.callback([{target,isIntersecting:true,intersectionRatio:1} as IntersectionObserverEntry],this as unknown as IntersectionObserver)} disconnect(){} unobserve(){}})
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('filters published styles, previews the selected video and applies only on confirmation',async()=>{
 const onSelect=vi.fn(),onClose=vi.fn()
 render(<MantineProvider><MotionStylePicker opened onClose={onClose} value={null} onSelect={onSelect}/></MantineProvider>)
 const card=await screen.findByRole('button',{name:'预览等轴 2.5D'})
 expect(screen.queryByText('旧版')).not.toBeInTheDocument()
 expect(screen.queryByText('未发布')).not.toBeInTheDocument()
 fireEvent.change(screen.getByRole('textbox',{name:'搜索动效风格'}),{target:{value:'等轴'}})
 expect(screen.queryByRole('button',{name:'预览扁平矢量'})).not.toBeInTheDocument()
 fireEvent.click(card)
 expect(card).toHaveAttribute('aria-pressed','true')
 expect(screen.queryByRole('complementary',{name:'风格预览'})).not.toBeInTheDocument()
 const video=await within(card).findByLabelText('等轴 2.5D效果演示')
 expect(video).toHaveAttribute('src','blob:/catalog/iso/card-preview')
 expect(video).toHaveAttribute('autoplay')
 expect(video).toHaveAttribute('loop')
 expect((video as HTMLVideoElement).muted).toBe(true)
 expect(api.media.mock.calls.some(([url])=>url.endsWith('/preview'))).toBe(false)
 expect(onSelect).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'使用此风格'}))
 expect(onSelect).toHaveBeenCalledWith({id:'mg-isometric',name:'等轴 2.5D'})
 expect(onClose).toHaveBeenCalledOnce()
})
it('pauses card demonstrations without changing the selected style',async()=>{
 const onSelect=vi.fn()
 render(<MantineProvider><MotionStylePicker opened onClose={vi.fn()} value={null} onSelect={onSelect}/></MantineProvider>)
 const card=await screen.findByRole('button',{name:'预览等轴 2.5D'})
 fireEvent.click(card)
 await within(card).findByLabelText('等轴 2.5D效果演示')
 fireEvent.click(screen.getByRole('button',{name:'暂停演示'}))
 await waitFor(()=>expect(within(card).queryByLabelText('等轴 2.5D效果演示')).not.toBeInTheDocument())
 expect(card).toHaveAttribute('aria-pressed','true')
 expect(onSelect).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'播放演示'}))
 await within(card).findByLabelText('等轴 2.5D效果演示')
})
it('discards a preview selection on cancel and restores the saved choice on reopening',async()=>{
 const onSelect=vi.fn(),onClose=vi.fn(),value={id:'mg-flat-vector',name:'扁平矢量'}
 const props={onSelect,onClose,value}
 const {rerender}=render(<MantineProvider><MotionStylePicker opened {...props}/></MantineProvider>)
 fireEvent.click(await screen.findByRole('button',{name:'预览等轴 2.5D'}))
 fireEvent.click(screen.getByRole('button',{name:'取消'}))
 expect(onSelect).not.toHaveBeenCalled()
 rerender(<MantineProvider><MotionStylePicker opened={false} {...props}/></MantineProvider>)
 rerender(<MantineProvider><MotionStylePicker opened {...props}/></MantineProvider>)
 await waitFor(()=>expect(screen.getByRole('button',{name:'预览扁平矢量'})).toHaveAttribute('aria-pressed','true'))
})
it('offers a retry after catalog failure and an explicit empty search state',async()=>{
 api.catalog.mockRejectedValueOnce(new Error('风格暂时无法加载'))
 render(<MantineProvider><MotionStylePicker opened onSelect={vi.fn()} onClose={vi.fn()} value={null}/></MantineProvider>)
 expect(await screen.findByRole('alert')).toHaveTextContent('风格暂时无法加载')
 fireEvent.click(screen.getByRole('button',{name:'重新加载'}))
 await screen.findByRole('button',{name:'预览等轴 2.5D'})
 fireEvent.change(screen.getByRole('textbox',{name:'搜索动效风格'}),{target:{value:'没有这个风格'}})
 expect(screen.getByText('没有找到匹配的风格，试试其他关键词。')).toBeVisible()
})
