import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {createRef} from 'react'
import MotionStyleCard from './MotionStyleCard'

const api=vi.hoisted(()=>({media:vi.fn()}))
vi.mock('./studioService',()=>({mediaBlob:api.media}))
let observer:IntersectionObserverCallback
const style={id:'sample',name:'示例',published:true,legacy:false,card_preview:'/card-preview',card_poster:'/card-poster'}
beforeEach(()=>{
 vi.clearAllMocks();api.media.mockReset().mockImplementation(async(url:string)=>'blob:'+url)
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined)
 vi.stubGlobal('IntersectionObserver',class{constructor(cb:IntersectionObserverCallback){observer=cb} observe(){} disconnect(){} unobserve(){}})
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
function visibility(visible:boolean){act(()=>observer([{isIntersecting:visible,intersectionRatio:visible?1:0} as IntersectionObserverEntry],{} as IntersectionObserver))}
it('loads only visible card media and releases video requests and URLs when scrolled away',async()=>{
 render(<MantineProvider><MotionStyleCard style={style} selected={false} playing root={createRef()} onSelect={vi.fn()}/></MantineProvider>)
 expect(api.media).not.toHaveBeenCalled()
 visibility(true)
 await screen.findByLabelText('示例效果演示')
 expect(api.media.mock.calls.map(call=>call[0])).toEqual(['/card-poster','/card-preview'])
 const signals=api.media.mock.calls.map(call=>call[1] as AbortSignal)
 visibility(false)
 await waitFor(()=>expect(screen.queryByLabelText('示例效果演示')).not.toBeInTheDocument())
 expect(signals.every(signal=>signal.aborted)).toBe(true)
 expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:/card-preview')
 expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
})
it('aborts and releases a late response after the card is removed',async()=>{
 let finish:(value:string)=>void=()=>{}
 api.media.mockImplementation((url:string)=>url==='/card-preview'?new Promise(resolve=>{finish=resolve}):Promise.resolve('blob:poster'))
 const {unmount}=render(<MantineProvider><MotionStyleCard style={style} selected={false} playing root={createRef()} onSelect={vi.fn()}/></MantineProvider>)
 visibility(true);await waitFor(()=>expect(api.media).toHaveBeenCalledTimes(2))
 const signal=api.media.mock.calls[1][1] as AbortSignal
 unmount();expect(signal.aborted).toBe(true)
 await act(async()=>finish('blob:late-video'))
 expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late-video')
})
it('can retry an unavailable demo without using the original large video',async()=>{
 api.media.mockImplementation(async(url:string)=>{if(url==='/card-preview')throw new Error('temporarily unavailable');return 'blob:poster'})
 const onSelect=vi.fn()
 render(<MantineProvider><MotionStyleCard style={{...style,preview:'/original-preview'}} selected={false} playing root={createRef()} onSelect={onSelect}/></MantineProvider>)
 visibility(true);await screen.findByText('演示加载失败，点击重试')
 api.media.mockImplementation(async(url:string)=>'blob:'+url)
 fireEvent.click(screen.getByRole('button',{name:'预览示例'}))
 await screen.findByLabelText('示例效果演示')
 expect(onSelect).toHaveBeenCalledOnce()
 expect(api.media.mock.calls.some(call=>call[0]==='/original-preview')).toBe(false)
})
