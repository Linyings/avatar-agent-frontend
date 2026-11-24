import {useEffect,useRef,useState} from 'react'
import {Alert,Button,Loader,Modal,TextInput,UnstyledButton} from '@mantine/core'
import {useReducedMotion} from '@mantine/hooks'
import {IconCheck,IconSearch,IconSparkles,IconPlayerPause,IconPlayerPlay} from '@tabler/icons-react'
import {useAuth} from '@/features/auth'
import {getStyleCatalog,type MotionStyle} from './studioService'
import MotionStyleCard from './MotionStyleCard'
import {ProtectedMedia} from './StudioShell'
import styles from './MotionStylePicker.module.css'

export type MotionStyleSelection=Pick<MotionStyle,'id'|'name'>
export default function MotionStylePicker({opened,onClose,value,onSelect}:{opened:boolean;onClose:()=>void;value:MotionStyleSelection|null;onSelect:(style:MotionStyleSelection|null)=>void}){
 const {user}=useAuth()
 const [items,setItems]=useState<MotionStyle[]>([])
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 const [query,setQuery]=useState(''),[selected,setSelected]=useState('')
 const [previewOpen,setPreviewOpen]=useState(false)
 const grid=useRef<HTMLDivElement>(null),reducedMotion=useReducedMotion()
 const [playOverride,setPlayOverride]=useState<boolean|null>(null),[pageVisible,setPageVisible]=useState(document.visibilityState!=='hidden')
 const playing=playOverride??!reducedMotion
 useEffect(()=>{const update=()=>setPageVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[])
 useEffect(()=>{if(opened){setSelected(value?.id??'');setQuery('');setPreviewOpen(false)}},[opened,value?.id])
 useEffect(()=>{
  let live=true
  if(opened&&user){
   setLoading(true);setError('')
   getStyleCatalog().then(result=>{if(live)setItems(result.styles.filter(s=>s.published&&!s.legacy&&!s.archived))})
    .catch(e=>{if(live)setError((e as Error).message)})
    .finally(()=>{if(live)setLoading(false)})
  }
  return()=>{live=false}
 },[opened,user?.user_id,attempt])
 const explainerCatalog=items.some(s=>s.id.startsWith('explain-'))
 const selectedID=selected|| (explainerCatalog?items[0]?.id:'')
 const current=items.find(s=>s.id===selectedID)
 const filtered=items.filter(s=>s.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
 function apply(){onSelect(current?{id:current.id,name:current.name}:null);onClose()}
 return <><Modal opened={opened} onClose={onClose} closeOnEscape={!previewOpen} title="选择动效风格" size={980} centered padding="lg" radius="lg" classNames={{content:styles.modal,header:styles.header,title:styles.title,close:styles.close}}>
  <p className={styles.intro}>演示仅供风格参考。AI 会结合你的口播文案和人物画面重新设计动效，人物仍由参考图生成。</p>
  {!user?<p>登录后可浏览和选择动效风格。</p>:loading?<div className={styles.empty} role="status"><Loader size="sm"/>正在加载动效风格…</div>:error?<Alert color="red" role="alert">{error}<Button variant="subtle" size="xs" onClick={()=>setAttempt(v=>v+1)}>重新加载</Button></Alert>:!items.length?<p className={styles.empty}>暂时没有可用的动效风格，请稍后再试。</p>:<>
   <div className={styles.layout}>
    <div className={styles.catalog}>
     <TextInput aria-label="搜索动效风格" placeholder="搜索风格名称" value={query} onChange={e=>setQuery(e.currentTarget.value)} leftSection={<IconSearch size={16}/>} classNames={{input:styles.search}}/>
     <div className={styles.caption}><span>全部风格 <span>{items.length}</span></span><Button variant="subtle" color="gray" size="compact-xs" leftSection={playing?<IconPlayerPause size={13}/>:<IconPlayerPlay size={13}/>} onClick={()=>setPlayOverride(!playing)}>{playing?'暂停演示':'播放演示'}</Button></div>
     <div ref={grid} className={styles.grid} aria-label="可用动效风格">
      {!explainerCatalog&&!query.trim()&&<UnstyledButton className={styles.card} aria-label="使用默认动效风格" aria-pressed={!selected} onClick={()=>setSelected('')}><div className={`${styles.poster} ${styles.defaultPoster}`}><IconSparkles size={32}/><span>默认动效</span></div><div className={styles.cardLabel}><span>默认风格</span>{!selected&&<IconCheck size={15}/>}</div></UnstyledButton>}
      {opened&&filtered.map(s=><MotionStyleCard key={s.id} style={s} selected={selectedID===s.id} playing={playing&&pageVisible&&!previewOpen} root={grid} onSelect={()=>setSelected(s.id)}/>)}
     </div>
     {!filtered.length&&<p className={styles.empty}>没有找到匹配的风格，试试其他关键词。</p>}
    </div>
   </div>
   {current?.description&&<p className={styles.description}>{current.description}</p>}
   <div className={styles.footer}><span>已选：{current?.name??(selected?'该风格暂不可用':'默认风格')}</span><div>{current?.card_poster&&<Button variant="subtle" color="gray" onClick={()=>setPreviewOpen(true)}>放大预览</Button>}<Button variant="subtle" color="gray" onClick={onClose}>取消</Button><Button color="cyan" disabled={!!selected&&!current} onClick={apply}>使用此风格</Button></div></div>
  </>}
 </Modal><Modal opened={opened&&previewOpen} onClose={()=>setPreviewOpen(false)} title={current?.name??'方案预览'} size="xl" centered classNames={{content:styles.modal,header:styles.header}}>
  {opened&&previewOpen&&current&&(current.preview||current.card_poster)&&<ProtectedMedia url={(current.preview||current.card_poster)!} kind={current.preview?'video':'image'} alt={`${current.name}参考封面`}/>}
  <p className={styles.description}>{current?.description}</p>
  <p className={styles.description}>参考案例用于了解表现方式，正式制作会结合你的文案与素材重新设计。{current?.preview_kind==='reference-poster'?'此案例目前提供封面预览，完整视频见作者原帖。':''}</p>
  {current?.original_post&&<Button component="a" href={current.original_post} target="_blank" rel="noopener noreferrer" variant="subtle">查看作者原帖</Button>}
 </Modal></>
}
