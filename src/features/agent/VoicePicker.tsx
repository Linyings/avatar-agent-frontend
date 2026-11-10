import {useEffect,useRef,useState} from 'react'
import {ActionIcon,Button,Loader,Popover,UnstyledButton} from '@mantine/core'
import {IconCheck,IconMicrophone,IconPlayerPlay,IconPlayerStop,IconVolumeOff} from '@tabler/icons-react'
import {useAuth} from '@/features/auth'
import {getVoiceCatalog,mediaBlob,type VoiceModelOption,type VoiceOption} from './studioService'
import styles from './Studio.module.css'

// model is empty only for catalogs from an older server without voice_models.
export type VoiceSelection=Pick<VoiceOption,'id'|'name'>&{model?:string}
export default function VoicePicker({value,onChange,disabled}:{value:VoiceSelection|null;onChange:(voice:VoiceSelection)=>void;disabled?:boolean}){
 const {user}=useAuth()
 const [opened,setOpened]=useState(false)
 const [models,setModels]=useState<VoiceModelOption[]>([]),[defaultModel,setDefaultModel]=useState('')
 const [tab,setTab]=useState('')
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 const [playing,setPlaying]=useState(''),[pending,setPending]=useState(''),[previewError,setPreviewError]=useState('')
 const audio=useRef<HTMLAudioElement|null>(null),preview=useRef<{url:string;abort:AbortController}|null>(null)
 useEffect(()=>{
  let live=true
  if(user){
   setLoading(true);setError('')
   getVoiceCatalog().then(r=>{
    if(!live)return
    const list=r.voice_models?.length?r.voice_models:[{id:'',name:'',default_voice:r.default_voice??'',supports_speed:true,voices:r.voices??[]}]
    setModels(list);setDefaultModel(r.default_voice_model??list[0].id)
   }).catch(e=>{if(live)setError((e as Error).message)})
    .finally(()=>{if(live)setLoading(false)})
  }
  return()=>{live=false}
 },[user?.user_id,attempt])
 function stop(){
  preview.current?.abort.abort()
  audio.current?.pause()
  if(preview.current?.url)URL.revokeObjectURL(preview.current.url)
  preview.current=null;setPlaying('');setPending('')
 }
 useEffect(()=>stop,[])
 const selectedModel=value?.model||defaultModel
 useEffect(()=>{if(opened)setTab(selectedModel);else stop()},[opened,selectedModel])
 async function toggle(voice:VoiceOption){
  const key=tab+'/'+voice.id,same=playing===key||pending===key
  stop();setPreviewError('')
  if(same||!voice.sample)return
  const abort=new AbortController();preview.current={url:'',abort};setPending(key)
  try{
   const url=await mediaBlob(voice.sample,abort.signal)
   if(abort.signal.aborted){URL.revokeObjectURL(url);return}
   preview.current={url,abort}
   const player=audio.current??new Audio();audio.current=player
   player.onended=()=>{if(preview.current?.url===url)stop()}
   player.src=url
   await player.play()
   setPending('');setPlaying(key)
  }catch{
   if(abort.signal.aborted)return
   stop();setPreviewError('试听加载失败，请稍后再试')
  }
 }
 const activeModel=models.find(m=>m.id===selectedModel)??models[0]
 const current=value??(activeModel?{id:activeModel.default_voice,name:activeModel.voices.find(v=>v.id===activeModel.default_voice)?.name??activeModel.default_voice,model:activeModel.id}:null)
 const currentModel=models.find(m=>m.id===(current?.model||defaultModel))
 const showModel=!!currentModel&&currentModel.id!==defaultModel
 const label=current?(showModel?`${currentModel!.name} · ${current.name}`:current.name):(loading?'加载中':'默认音色')
 const shown=models.find(m=>m.id===tab)??activeModel
 return <Popover opened={opened} onChange={setOpened} position="bottom-start" width={380} shadow="md" withinPortal={false} keepMounted hideDetached={false}>
  <Popover.Target>
   <Button variant="default" size="compact-xs" leftSection={<IconMicrophone size={14}/>} className={styles.motionStyleButton} aria-label={`配音音色：${label}`} aria-haspopup="listbox" aria-expanded={opened} disabled={disabled} onClick={()=>setOpened(o=>!o)}>音色 · {current?.name.split(' · ')[0]??label}</Button>
  </Popover.Target>
  <Popover.Dropdown className={styles.voiceDropdown}>
   {!user?<p className={styles.voiceNote}>登录后可选择和试听音色。</p>
   :loading?<div className={styles.voiceNote} role="status"><Loader size="xs"/>正在加载音色…</div>
   :error?<div className={styles.voiceNote} role="alert">{error}<Button variant="subtle" size="compact-xs" onClick={()=>setAttempt(v=>v+1)}>重新加载</Button></div>
   :!shown?.voices.length?<p className={styles.voiceNote}>暂时没有可用音色。</p>
   :<>
    {models.length>1&&<div className={styles.voiceModels} role="tablist" aria-label="配音模型">
     {models.map(m=><UnstyledButton key={m.id} role="tab" aria-selected={m.id===shown.id} className={`${styles.voiceModelTab} ${m.id===shown.id?styles.voiceModelTabActive:''}`} onClick={()=>{stop();setPreviewError('');setTab(m.id)}}>{m.name}</UnstyledButton>)}
    </div>}
    {models.length>1&&!shown.supports_speed&&<p className={styles.voiceHint}>该模型不支持调整语速</p>}
    <div className={styles.voiceList} role="listbox" aria-label="可选音色">
     {shown.voices.map(v=>{
      const selected=current?.id===v.id&&(current?.model||defaultModel)===shown.id,key=shown.id+'/'+v.id,active=playing===key,waiting=pending===key
      return <div key={v.id} className={`${styles.voiceRow} ${selected?styles.voiceRowSelected:''}`}>
       <UnstyledButton role="option" aria-selected={selected} className={styles.voiceOption} onClick={()=>{onChange({id:v.id,name:v.name,model:shown.id||undefined});setOpened(false)}}>
        <span>{v.name}</span>{selected&&<IconCheck size={14}/>}
       </UnstyledButton>
       {v.sample
        ?<ActionIcon variant="subtle" size="sm" className={styles.voicePreview} aria-label={`${active||waiting?'停止试听':'试听'}${v.name}`} onClick={()=>void toggle(v)}>{waiting?<Loader size={12}/>:active?<IconPlayerStop size={14}/>:<IconPlayerPlay size={14}/>}</ActionIcon>
        :<ActionIcon variant="subtle" size="sm" className={styles.voicePreview} aria-label={`${v.name}暂无试听`} disabled><IconVolumeOff size={14}/></ActionIcon>}
      </div>
     })}
    </div>
    {previewError&&<p className={styles.voiceError} role="alert">{previewError}</p>}
   </>}
  </Popover.Dropdown>
 </Popover>
}
