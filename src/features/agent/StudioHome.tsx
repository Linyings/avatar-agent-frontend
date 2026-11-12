import {useEffect,useRef,useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {ActionIcon,Alert,Button,Select,Textarea,UnstyledButton} from '@mantine/core'
import {IconArrowUp,IconBox,IconMovie,IconPlus,IconSparkles,IconUser,IconFile} from '@tabler/icons-react'
import {useAuth} from '@/features/auth'
import {ProjectService} from '@/features/projects'
import type {Project} from '@/features/projects/types/project'
import {createStudio,requestID,uploadStudioFile} from './studioService'
import {StudioShell,PackageLibrary,ProjectArtwork,MoreLink} from './StudioShell'
import HomeAttachments,{fileIdentity,isSupportedImage,uploadKindOf,type HomeFile} from './HomeAttachments'
import MotionStylePicker,{type MotionStyleSelection} from './MotionStylePicker'
import styles from './Studio.module.css'

const starters=[
 {title:'人物口播创作',prompt:'帮我制作人物口播与动效融合的视频，主题是：',icon:IconUser},
 {title:'知识科普口播',prompt:'帮我制作知识科普口播，配合动效清晰解释：',icon:IconSparkles},
 {title:'产品介绍视频',prompt:'帮我制作产品介绍口播，目标用户和核心卖点是：',icon:IconBox},
 {title:'口播稿优化',prompt:'请先帮我优化口播稿，暂不生成视频。原稿是：',icon:IconFile},
 {title:'从素材开始',prompt:'根据我提供的素材，先帮我规划一个短视频方案：',icon:IconMovie},
]
export default function StudioHome(){
 const {user}=useAuth();const navigate=useNavigate();const [params,setParams]=useSearchParams()
 const [text,setText]=useState('');const [ratio,setRatio]=useState('9:16')
 const [motionStyle,setMotionStyle]=useState<MotionStyleSelection|null>(null);const [styleOpen,setStyleOpen]=useState(false)
 const [files,setFiles]=useState<HomeFile[]>([]);const [projects,setProjects]=useState<Project[]>([])
 const [links,setLinks]=useState<string[]>([]);const [pickerOpen,setPickerOpen]=useState(false)
 const [portraitId,setPortraitId]=useState<string|null>(null);const [uploadingId,setUploadingId]=useState<string|null>(null)
 const primaryId=files.find(f=>f.uploaded&&f.kind==='photo')?.id??files.find(f=>f.id===portraitId&&!f.uploaded&&isSupportedImage(f.file))?.id??files.find(f=>!f.uploaded&&isSupportedImage(f.file))?.id
 const [busy,setBusy]=useState(false);const busyRef=useRef(false);const [error,setError]=useState('');const [library,setLibrary]=useState(false)
 const [draft,setDraft]=useState<{id:string}|null>(null)
 const textarea=useRef<HTMLTextAreaElement>(null)
 function closeStyles(){
  setStyleOpen(false)
  const next=new URLSearchParams(params)
  if(next.get('panel')==='styles')next.delete('panel')
  if(next.get('mode')==='animation')next.delete('mode')
  if(next.toString()!==params.toString())setParams(next,{replace:true})
 }
 function addFiles(next:File[]){
  if(busyRef.current)return
  // Any format is accepted; only the server's single-file size cap applies.
  if(next.some(f=>f.size>256*1024*1024)){setError('单个文件不能超过 256 MB');return}
  if(next.some(f=>f.size===0)){setError('不能上传空文件');return}
  setError('');setFiles(old=>{const seen=new Set(old.map(f=>fileIdentity(f.file)));return [...old,...next.filter(file=>{const id=fileIdentity(file);if(seen.has(id))return false;seen.add(id);return true}).map(file=>({id:requestID(),file,uploaded:false}))]})
 }
 useEffect(()=>{if(!draft&&(params.get('panel')==='styles'||params.get('mode')==='animation'))setStyleOpen(true)},[params,draft])
 useEffect(()=>{if(params.get('panel')==='packages')setLibrary(true)},[params])
 useEffect(()=>{let live=true;if(user)ProjectService.getProjects({limit:4,offset:0,sort_by:'updated_at',sort_order:'desc'}).then(r=>{if(live)setProjects(r.projects??[])}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[user])
 async function start(){
  if(!text.trim()||busyRef.current)return
  if(!user){sessionStorage.setItem('studio-prompt',text);sessionStorage.setItem('studio-options',JSON.stringify({ratio,motionStyle}));navigate('/login');return}
  busyRef.current=true;setBusy(true);setError('')
  let current=draft
  try{
   if(!current){const p=await createStudio(text.trim(),ratio,motionStyle?.id??'',links);current={id:p.id};setDraft(current)}
   for(const item of files){
    if(item.uploaded)continue
    const f=item.file;const kind=uploadKindOf(f,item.id===primaryId)
    setUploadingId(item.id);setFiles(old=>old.map(saved=>saved.id===item.id?{...saved,error:false}:saved))
    try{await uploadStudioFile(current.id,f,kind)}catch(e){setFiles(old=>old.map(saved=>saved.id===item.id?{...saved,error:true}:saved));throw e}
    setFiles(old=>old.map(saved=>saved.id===item.id?{...saved,uploaded:true,kind,error:false}:saved))
   }
   navigate(`/workspace/${current.id}?intent=${encodeURIComponent(text.trim())}`)
  }catch(e){setError((e as Error).message)}finally{busyRef.current=false;setBusy(false);setUploadingId(null)}
 }
 useEffect(()=>{
  if(!user)return
  const saved=sessionStorage.getItem('studio-prompt');if(saved)setText(saved)
  try{const options=JSON.parse(sessionStorage.getItem('studio-options')??'null');if(options){if(['9:16','16:9','1:1'].includes(options.ratio))setRatio(options.ratio);if(typeof options.motionStyle?.id==='string'&&typeof options.motionStyle?.name==='string')setMotionStyle(options.motionStyle)}}catch{/* Ignore incomplete saved composer options. */}
  sessionStorage.removeItem('studio-prompt');sessionStorage.removeItem('studio-options')
 },[user])
 return <StudioShell onPackages={()=>setLibrary(true)}><main className={styles.home}>
  <section className={styles.hero}>
   <div className={styles.eyebrow}>IDEAS INTO MOTION</div>
   <h1 className={styles.heroTitle} aria-label="AvaSpeak.ai 你的专属AI视频Agent"><span className={styles.heroBrand}><span className={styles.brandScript}>Ava</span>Speak<em>.ai</em></span>你的专属AI视频Agent</h1>
   <p className={styles.heroSubtitle}>AI 人物口播 × 风格动效，让创意融合成片</p>
   <div className={styles.composer}>
    <HomeAttachments files={files} links={links} primaryId={primaryId} uploadingId={uploadingId} busy={busy} locked={!!draft} avatar opened={pickerOpen} onOpened={setPickerOpen} onFiles={addFiles} onLinks={setLinks} onRemove={id=>setFiles(old=>old.filter(f=>f.id!==id))} onPrimary={setPortraitId}>
     <Textarea ref={textarea} aria-label="描述视频创意" placeholder="描述你想制作的视频，也可以添加人物图片、参考视频、音频、文档或网页链接…" value={text} onChange={e=>setText(e.currentTarget.value)} disabled={busy||!!draft} minRows={7} maxRows={10} autosize classNames={{input:styles.promptInput}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void start()}}}/>
    </HomeAttachments>
    <div className={styles.composerFoot}>
     <div className={styles.composerTools}>
      <ActionIcon variant="subtle" className={styles.iconButton} aria-label="添加照片或视频" disabled={busy} onClick={()=>setPickerOpen(true)}><IconPlus size={19}/></ActionIcon>
      <ActionIcon variant="subtle" className={styles.iconButton} aria-label="选择插件" onClick={()=>setLibrary(true)}><IconBox size={18}/></ActionIcon>
      <Button variant="default" size="compact-xs" leftSection={<IconSparkles size={14}/>} className={styles.motionStyleButton} aria-label={`动效风格：${motionStyle?.name??'默认风格'}`} aria-haspopup="dialog" aria-expanded={styleOpen} disabled={busy||!!draft} onClick={()=>setStyleOpen(true)}>风格 · {motionStyle?.name??'默认'}</Button>
      <Select aria-label="画幅" value={ratio} onChange={v=>setRatio(v??'9:16')} data={['9:16','16:9','1:1']} allowDeselect={false} w={78} size="xs" classNames={{input:styles.selectInput}} disabled={busy||!!draft}/>
     </div>
     <ActionIcon radius="xl" size={32} className={styles.primary} aria-label="发送创意" disabled={!text.trim()} loading={busy} onClick={()=>void start()}><IconArrowUp size={19}/></ActionIcon>
    </div>
   </div>
   <div className={styles.hint}>Enter 发送 · Shift + Enter 换行 · 支持任意格式的多个文件和网页链接</div>
   {error&&<Alert color="red" mt="md" role="alert">{error}{draft&&<><div>已上传素材会保留。可移除失败文件、添加替换文件后重新发送。</div><Button variant="subtle" size="xs" onClick={()=>navigate(`/workspace/${draft.id}`)}>打开已创建的项目</Button></>}</Alert>}
   <div className={styles.categories}><span>人物口播 ＋ 动效融合</span><span>|</span><UnstyledButton disabled={busy||!!draft} onClick={()=>setStyleOpen(true)}>浏览动效风格</UnstyledButton><span>|</span><UnstyledButton onClick={()=>setLibrary(true)}>全部插件 ›</UnstyledButton></div>
   <div className={styles.skills}>{starters.map(s=><UnstyledButton key={s.title} disabled={busy||!!draft} className={styles.skill} onClick={()=>{setText(s.prompt);textarea.current?.focus()}}><span className={styles.skillIcon}><s.icon size={16}/></span>{s.title}</UnstyledButton>)}</div>
  </section>
  <section className={styles.recent}><div className={styles.sectionHead}><h2>最近项目</h2><MoreLink to="/projects">查看全部</MoreLink></div>
   <div className={styles.recentGrid}>
    <UnstyledButton className={styles.recentCard} onClick={()=>{textarea.current?.focus();window.scrollTo({top:0,behavior:'smooth'})}}><div className={`${styles.recentCover} ${styles.newRecent}`}><IconPlus size={25}/><span>创建新项目</span></div><div className={styles.recentTitle}>开启新的创作</div><div className={styles.subtle}>从一个想法开始</div></UnstyledButton>
    {projects.map(p=><UnstyledButton key={p.id} className={styles.recentCard} onClick={()=>navigate(`/workspace/${p.id}`)}><div className={`${styles.recentCover} ${styles.cover}`}><ProjectArtwork/></div><div className={styles.recentTitle}>{p.name}</div><div className={styles.subtle}>{new Date(p.updated_at).toLocaleDateString('zh-CN')} 更新</div></UnstyledButton>)}
    {!projects.length&&<div className={styles.empty} style={{gridColumn:'span 2',padding:20}}>你的作品会出现在这里</div>}
   </div>
  </section>
 </main><MotionStylePicker opened={styleOpen} onClose={closeStyles} value={motionStyle} onSelect={setMotionStyle}/><PackageLibrary opened={library} onClose={()=>setLibrary(false)} onSelect={p=>{if(draft){navigate(`/workspace/${draft.id}`);return}setText(`请帮我使用「${p.title}」：`);textarea.current?.focus()}}/></StudioShell>
}
