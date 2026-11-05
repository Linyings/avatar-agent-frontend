import {beforeEach,expect,it,vi} from 'vitest'
import {act,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MantineProvider} from '@mantine/core'
import StyleGallery from './StyleGallery'
import {workflowService,type WorkflowStyle} from './workflowService'
vi.mock('./workflowService',()=>({workflowService:{style:vi.fn(),stylePoster:vi.fn(),styleResource:vi.fn()}}))
const api=vi.mocked(workflowService)
const style:WorkflowStyle={id:'mg-flat-vector',name:'扁平矢量 · 原生动效',version:'mg-native/1',published:true,signature:'城市搭建与图形转场',description:'原生源码参数适配',source:'01-flat-vector',ratios:['9:16','16:9','1:1']}
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:preview')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});api.style.mockResolvedValue(new Blob());api.stylePoster.mockResolvedValue(new Blob());api.styleResource.mockResolvedValue(Object.assign(new Blob(),{text:async()=> '原提示词'}))})
it('selects the source-backed style and loads original references only on explicit request',async()=>{
 const change=vi.fn();render(<MantineProvider env="test"><StyleGallery styles={[style]} value="" disabled={false} onChange={change}/></MantineProvider>)
 await userEvent.click(await screen.findByRole('button',{name:'选择扁平矢量 · 原生动效'}));expect(change).toHaveBeenCalledWith('mg-flat-vector')
 expect(api.styleResource).not.toHaveBeenCalled();await waitFor(()=>expect(screen.getByRole('button',{name:'案例与源码'})).toBeEnabled())
 await userEvent.click(screen.getByRole('button',{name:'案例与源码'}));expect(await screen.findByText('原版模板演示')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'查看原提示词'}));expect(await screen.findByText('原提示词')).toBeVisible()
 expect(api.styleResource).toHaveBeenCalledWith(style.id,'prompt')
 await userEvent.click(screen.getByRole('button',{name:'查看参考原片'}));expect(api.styleResource).toHaveBeenCalledWith(style.id,'reference')
 expect(await screen.findByText('参考原片（用于对照，不是本次项目产物）')).toBeVisible()
 await userEvent.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
it('cannot change style while production is active',async()=>{
 render(<MantineProvider env="test"><StyleGallery styles={[style]} value={style.id} disabled onChange={vi.fn()}/></MantineProvider>)
 expect(screen.getByRole('button',{name:'选择扁平矢量 · 原生动效'})).toBeDisabled()
 await waitFor(()=>expect(screen.getByRole('button',{name:'案例与源码'})).toBeEnabled())
})
it('shows all fifteen original templates and explains the actual 3D production method',async()=>{
 const styles=Array.from({length:15},(_,i)=>({...style,id:`mg-example-${i}`,name:`原模板${i}`,preview_kind:'upstream-original',production_mode:i===14?'original-video':'native-source'}))
 render(<MantineProvider env="test"><StyleGallery styles={styles} value={style.id} disabled={false} onChange={vi.fn()}/></MantineProvider>)
 await waitFor(()=>expect(api.stylePoster).toHaveBeenCalledTimes(15))
 await act(async()=>{})
 expect(screen.getAllByText('原版演示')).toHaveLength(15)
 expect(screen.getAllByRole('button',{name:/选择原模板/})).toHaveLength(15)
 expect(screen.getByText('原片素材复用')).toBeVisible()
})
it('does not download large video previews until the card is visible',async()=>{
 let show:IntersectionObserverCallback=()=>{}
 vi.stubGlobal('IntersectionObserver',class{constructor(cb:IntersectionObserverCallback){show=cb}observe(){}disconnect(){}})
 render(<MantineProvider env="test"><StyleGallery styles={[style]} value={style.id} disabled={false} onChange={vi.fn()}/></MantineProvider>)
 expect(api.style).not.toHaveBeenCalled()
 await act(async()=>show([{isIntersecting:true} as IntersectionObserverEntry],{} as IntersectionObserver))
 await waitFor(()=>expect(screen.getByRole('button',{name:'案例与源码'})).toBeEnabled())
 await waitFor(()=>expect(api.style).toHaveBeenCalledTimes(1))
 vi.unstubAllGlobals()
})
