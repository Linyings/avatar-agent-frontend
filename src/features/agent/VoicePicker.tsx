import {useEffect,useRef,useState} from 'react'
import {ActionIcon,Button,Loader,Popover,UnstyledButton} from '@mantine/core'
import {IconCheck,IconMicrophone,IconPlayerPlay,IconPlayerStop,IconVolumeOff} from '@tabler/icons-react'
import {useAuth} from '@/features/auth'
import {getVoiceCatalog,mediaBlob,type VoiceOption} from './studioService'
import styles from './Studio.module.css'

export type VoiceSelection=Pick<VoiceOption,'id'|'name'>
export default function VoicePicker({value,onChange,disabled}:{value:VoiceSelection|null;onChange:(voice:VoiceSelection)=>void;disabled?:boolean}){
 const {user}=useAuth()
 const [opened,setOpened]=useState(false)
 const [voices,setVoices]=useState<VoiceOption[]>([]),[fallback,setFallback]=useState('')
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 const [playing,setPlaying]=useState(''),[pending,setPending]=useState(''),[previewError,setPreviewError]=useState('')
 const audio=useRef<HTMLAudioElement|null>(null),preview=useRef<{url:string;abort:AbortController}|null>(null)
 useEffect(()=>{
  let live=true
  if(user){
   setLoading(true);setError('')
   getVoiceCatalog().then(r=>{if(live){setVoices(r.voices??[]);setFallback(r.default_voice??'')}})
    .catch(e=>{if(live)setError((e as Error).message)})
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
 useEffect(()=>{if(!opened)stop()},[opened])
 async function toggle(voice:VoiceOption){
  const same=playing===voice.id||pending===voice.id
  stop();setPreviewError('')
  if(same||!voice.sample)return
  const abort=new AbortController();preview.current={url:'',abort};setPending(voice.id)
  try{
   const url=await mediaBlob(voice.sample,abort.signal)
   if(abort.signal.aborted){URL.revokeObjectURL(url);return}
   preview.current={url,abort}
   const player=audio.current??new Audio();audio.current=player
   player.onended=()=>{if(preview.current?.url===url)stop()}
   player.src=url
   await player.play()
   setPending('');setPlaying(voice.id)
  }catch{
   if(abort.signal.aborted)return
   stop();setPreviewError('试听加载失败，请稍后再试')
  }
 }
 const current=value??voices.find(v=>v.id===fallback)??null
 const label=current?.name??(loading?'加载中':'默认音色')
 return <Popover opened={opened} onChange={setOpened} position="bottom-start" width={320} shadow="md" zIndex={400} keepMounted hideDetached={false}>
  <Popover.Target>
   <Button variant="default" size="compact-xs" leftSection={<IconMicrophone size={14}/>} className={styles.motionStyleButton} aria-label={`配音音色：${label}`} aria-haspopup="listbox" aria-expanded={opened} disabled={disabled} onClick={()=>setOpened(o=>!o)}>音色 · {label.split(' · ')[0]}</Button>
  </Popover.Target>
  <Popover.Dropdown className={styles.voiceDropdown}>
   {!user?<p className={styles.voiceNote}>登录后可选择和试听音色。</p>
   :loading?<div className={styles.voiceNote} role="status"><Loader size="xs"/>正在加载音色…</div>
   :error?<div className={styles.voiceNote} role="alert">{error}<Button variant="subtle" size="compact-xs" onClick={()=>setAttempt(v=>v+1)}>重新加载</Button></div>
   :!voices.length?<p className={styles.voiceNote}>暂时没有可用音色。</p>
   :<>
    <div className={styles.voiceList} role="listbox" aria-label="可选音色">
     {voices.map(v=>{
      const selected=current?.id===v.id,active=playing===v.id,waiting=pending===v.id
      return <div key={v.id} className={`${styles.voiceRow} ${selected?styles.voiceRowSelected:''}`}>
       <UnstyledButton role="option" aria-selected={selected} className={styles.voiceOption} onClick={()=>{onChange({id:v.id,name:v.name});setOpened(false)}}>
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
