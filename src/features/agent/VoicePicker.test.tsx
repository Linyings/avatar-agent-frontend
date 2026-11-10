import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import VoicePicker,{type VoiceSelection} from './VoicePicker'

const api=vi.hoisted(()=>({catalog:vi.fn(),media:vi.fn()}))
vi.mock('./studioService',()=>({getVoiceCatalog:api.catalog,mediaBlob:api.media}))
vi.mock('@/features/auth',()=>({useAuth:()=>({user:{user_id:'voice-user'}})}))

const play=vi.fn(()=>Promise.resolve()),pause=vi.fn()
const minimax={id:'minimax/speech-2.8-hd',name:'MiniMax Speech 2.8 HD',default_voice:'Wise_Woman',supports_speed:true,voices:[
 {id:'Wise_Woman',name:'睿智女声 · Wise Woman',sample:'/api/v1/avatar-mvp/catalog/voices/Wise_Woman/sample'},
 {id:'Calm_Woman',name:'沉稳女声 · Calm Woman',sample:'/api/v1/avatar-mvp/catalog/voices/Calm_Woman/sample'},
 {id:'Elegant_Man',name:'优雅男声 · Elegant Man'},
]}
const qwen={id:'alibaba/qwen3-tts-flash',name:'千问 Qwen3-TTS Flash',default_voice:'Cherry',supports_speed:false,voices:[
 {id:'Cherry',name:'芊悦 · 阳光亲切女声',sample:'/api/v1/avatar-mvp/catalog/voices/Cherry/sample?model=alibaba%2Fqwen3-tts-flash'},
 {id:'Neil',name:'阿闻 · 新闻主播男声'},
]}
beforeEach(()=>{
 vi.clearAllMocks()
 api.catalog.mockResolvedValue({default_voice:'Wise_Woman',default_voice_model:minimax.id,voices:minimax.voices,voice_models:[minimax,qwen]})
 api.media.mockResolvedValue('blob:voice-sample')
 Object.defineProperty(window.HTMLMediaElement.prototype,'play',{configurable:true,value:play})
 Object.defineProperty(window.HTMLMediaElement.prototype,'pause',{configurable:true,value:pause})
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
})
afterEach(cleanup)

function renderPicker(value:VoiceSelection|null=null,onChange=vi.fn()){
 render(<MantineProvider><VoicePicker value={value} onChange={onChange}/></MantineProvider>)
 return onChange
}

it('shows the server default voice before the user chooses one',async()=>{
 renderPicker()
 expect(await screen.findByRole('button',{name:'配音音色：睿智女声 · Wise Woman'})).toBeVisible()
})

it('lists every catalog voice and selects one together with its model',async()=>{
 const onChange=renderPicker()
 fireEvent.click(await screen.findByRole('button',{name:/配音音色/}))
 const list=await screen.findByRole('listbox',{name:'可选音色'})
 expect(within(list).getAllByRole('option')).toHaveLength(3)
 fireEvent.click(within(list).getByRole('option',{name:/沉稳女声/}))
 expect(onChange).toHaveBeenCalledWith({id:'Calm_Woman',name:'沉稳女声 · Calm Woman',model:'minimax/speech-2.8-hd'})
})

it('switching the model shows only that model voices and selects within it',async()=>{
 const onChange=renderPicker()
 fireEvent.click(await screen.findByRole('button',{name:/配音音色/}))
 fireEvent.click(await screen.findByRole('tab',{name:'千问 Qwen3-TTS Flash'}))
 const list=screen.getByRole('listbox',{name:'可选音色'})
 expect(within(list).getAllByRole('option').map(o=>o.textContent)).toEqual(['芊悦 · 阳光亲切女声','阿闻 · 新闻主播男声'])
 expect(screen.getByText('该模型不支持调整语速')).toBeVisible()
 fireEvent.click(within(list).getByRole('option',{name:/阿闻/}))
 expect(onChange).toHaveBeenCalledWith({id:'Neil',name:'阿闻 · 新闻主播男声',model:'alibaba/qwen3-tts-flash'})
})

it('opens on the selected voice model',async()=>{
 renderPicker({id:'Cherry',name:'芊悦 · 阳光亲切女声',model:'alibaba/qwen3-tts-flash'})
 expect(await screen.findByRole('button',{name:'配音音色：千问 Qwen3-TTS Flash · 芊悦 · 阳光亲切女声'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:/配音音色/}))
 expect(await screen.findByRole('tab',{name:'千问 Qwen3-TTS Flash'})).toHaveAttribute('aria-selected','true')
})

it('previews a voice through the authenticated media loader without selecting it',async()=>{
 const onChange=renderPicker()
 fireEvent.click(await screen.findByRole('button',{name:/配音音色/}))
 fireEvent.click(await screen.findByRole('tab',{name:'千问 Qwen3-TTS Flash'}))
 fireEvent.click(await screen.findByRole('button',{name:'试听芊悦 · 阳光亲切女声'}))
 await waitFor(()=>expect(api.media).toHaveBeenCalledWith('/api/v1/avatar-mvp/catalog/voices/Cherry/sample?model=alibaba%2Fqwen3-tts-flash',expect.anything()))
 await waitFor(()=>expect(play).toHaveBeenCalled())
 expect(onChange).not.toHaveBeenCalled()
 expect(screen.getByRole('button',{name:'停止试听芊悦 · 阳光亲切女声'})).toBeVisible()
})

it('marks voices without a cached sample as unavailable for preview',async()=>{
 renderPicker()
 fireEvent.click(await screen.findByRole('button',{name:/配音音色/}))
 expect(await screen.findByRole('button',{name:'优雅男声 · Elegant Man暂无试听'})).toBeDisabled()
})

it('shows a preview failure without losing the selection list',async()=>{
 api.media.mockRejectedValueOnce(new Error('媒体加载失败（404）'))
 renderPicker()
 fireEvent.click(await screen.findByRole('button',{name:/配音音色/}))
 fireEvent.click(await screen.findByRole('button',{name:'试听睿智女声 · Wise Woman'}))
 expect(await screen.findByText('试听加载失败，请稍后再试')).toBeVisible()
 expect(screen.getByRole('listbox',{name:'可选音色'})).toBeVisible()
})
