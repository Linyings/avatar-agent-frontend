import {useEffect,useState,type ReactNode} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {ActionIcon,Avatar,Button,Modal,UnstyledButton} from '@mantine/core'
import {IconArrowUpRight,IconBox,IconChevronRight,IconFolder,IconHome,IconMovie,IconSettings,IconSparkles,IconUser,IconBook2} from '@tabler/icons-react'
import {useAuth} from '@/features/auth'
import {getPackages,mediaBlob,type PackageInfo} from './studioService'
import styles from './Studio.module.css'

export function StudioShell({children,onPackages}:{children:ReactNode;onPackages?:()=>void}){
 const {user}=useAuth();const location=useLocation();const [open,setOpen]=useState(false)
 const [help,setHelp]=useState(false)
 return <div className={styles.shell}>
  <aside className={styles.sidebar}>
   <Link to="/" className={styles.brand} aria-label="AvaSpeak.ai 首页"><span className={styles.brandScript}>Ava</span>Speak<em>.ai</em><i className={styles.brandDot}/></Link>
   <nav className={styles.nav} aria-label="主导航">
    <Link to="/" className={styles.navItem} data-active={location.pathname==='/'}><IconHome size={18}/><span>首页</span></Link>
    <Link to="/projects" className={styles.navItem} data-active={location.pathname!=='/'}><IconFolder size={18}/><span>项目</span></Link>
    <UnstyledButton className={styles.navItem} onClick={()=>onPackages?onPackages():setOpen(true)}><IconBox size={18}/><span>Skill 插件</span></UnstyledButton>
   </nav>
   <div className={styles.navCaption}>CREATE WITH YOUR AGENT</div>
   <nav className={styles.nav}>
    <Link to="/" className={styles.navItem}><IconUser size={18}/><span>口播创作</span></Link>
    <Link to="/?panel=styles" className={styles.navItem}><IconSparkles size={18}/><span>动效风格</span></Link>
    <UnstyledButton className={styles.navItem} onClick={()=>setHelp(true)}><IconBook2 size={18}/><span>制作指南</span></UnstyledButton>
   </nav>
   <div className={styles.sidebarBottom}>
    <Link to={user?'/profile':'/login'} className={styles.navItem}><IconSettings size={18}/><span>{user?'账户设置':'登录账户'}</span></Link>
    <div className={styles.localInfo}>LOCAL WORKSPACE<br/><span style={{lineHeight:2}}>让想法，成为作品。</span></div>
   </div>
  </aside>
  <div className={styles.body}><header className={styles.topbar}>
   <div className={styles.topLabel}><i className={styles.dot}/><span>AvaSpeak Studio</span><span>/</span><span>你的创意工作空间</span></div>
   <div className={styles.headerActions}><span className={styles.subtle}>数字人口播 · 动效制作</span>
    {user?<Link to="/profile" aria-label="账户"><Avatar size={30} color="cyan" radius="xl"><IconUser size={16}/></Avatar></Link>:<Button component={Link} to="/login" size="compact-sm" className={styles.primary}>登录 / 注册</Button>}
   </div>
  </header>{children}</div>
  <PackageLibrary opened={open} onClose={()=>setOpen(false)}/>
  <Modal opened={help} onClose={()=>setHelp(false)} title="从想法到成片" centered styles={{content:{background:'#171e2a',color:'#dce6f4'},header:{background:'#171e2a',color:'#dce6f4'}}}>
   <p>1. 在首页描述主题，选择动效风格和画幅，添加人物参考图。</p><p>2. 进入工作台，与 Agent 确认文案和制作要求。</p><p>3. 审核文案及配音后，AI 根据参考图生成人物口播，并制作动效、安排分层融合。</p><p>4. 预览逐帧渲染的成片，向 Agent 提出修改意见，确认后导出成片和封面。</p>
  </Modal>
 </div>
}
export function PackageLibrary({opened,onClose,onSelect}:{opened:boolean;onClose:()=>void;onSelect?:(p:PackageInfo)=>void}){
 const {user}=useAuth();const [items,setItems]=useState<PackageInfo[]>([]);const [error,setError]=useState('')
 useEffect(()=>{let active=true;if(opened&&user){getPackages().then(r=>{if(active)setItems(r.packages)}).catch(e=>{if(active)setError(e.message)})}return()=>{active=false}},[opened,user])
 return <Modal opened={opened} onClose={onClose} title="Skill / 制作插件" size="xl" centered styles={{content:{background:'#121924',color:'#dce6f4'},header:{background:'#121924',color:'#dce6f4'}}}>
  {!user?<p>登录后查看当前服务的插件和配置状态。</p>:error?<p role="alert">{error}</p>:<div className={styles.packageGrid}>{items.map(p=><div key={p.id} className={styles.packageCard}>
   <span className={styles.badge}>{p.node||'工具'} · v{p.version}</span><h3>{p.title}</h3><p>{p.description}</p>
   <p>{p.ready?'已接入':p.reason}</p><span className={styles.subtle}>产物：{p.outputs.join('、')}</span>
   {onSelect&&<Button size="compact-xs" variant="subtle" rightSection={<IconArrowUpRight size={12}/>} onClick={()=>{onSelect(p);onClose()}}>在对话中使用</Button>}
  </div>)}</div>}
 </Modal>
}
export function ProtectedMedia({url,kind='image',alt='项目素材'}:{url:string;kind?:'image'|'video'|'audio';alt?:string}){
 const [src,setSrc]=useState('');const [error,setError]=useState('')
 useEffect(()=>{let live=true,objectURL='';setSrc('');setError('');mediaBlob(url).then(value=>{objectURL=value;if(live)setSrc(value);else URL.revokeObjectURL(value)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false;if(objectURL)URL.revokeObjectURL(objectURL)}},[url])
 if(error)return <span className={styles.mediaError}>{error}</span>
 if(!src)return <span className={styles.subtle}>加载素材…</span>
 if(kind==='video')return <video className={styles.protectedMedia} style={{objectFit:'contain'}} src={src} controls preload="metadata"/>
 if(kind==='audio')return <audio src={src} controls style={{width:'100%'}}/>
 return <img className={styles.protectedMedia} src={src} alt={alt}/>
}
export function ProjectArtwork({name}:{name?:string}){
 return <div className={styles.coverSymbol}><IconMovie size={42} stroke={.8}/>{name&&<span style={{display:'block',fontSize:10,letterSpacing:2,marginTop:12}}>{name.slice(0,14)}</span>}</div>
}
export function MoreLink({to,children}:{to:string;children:ReactNode}){return <Button component={Link} to={to} variant="subtle" size="compact-xs" color="gray" rightSection={<IconChevronRight size={12}/>}>{children}</Button>}
export function SmallIcon({label,onClick,children}:{label:string;onClick:()=>void;children:ReactNode}){return <ActionIcon aria-label={label} title={label} onClick={onClick} className={styles.iconButton} variant="subtle">{children}</ActionIcon>}
