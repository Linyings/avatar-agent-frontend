import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {ActionIcon,Alert,Button,Checkbox,Menu,Modal,Select,TextInput,UnstyledButton,Loader} from '@mantine/core'
import {IconArchive,IconDotsVertical,IconEdit,IconGridDots,IconList,IconPlus,IconSearch,IconTrash,IconArrowUpRight} from '@tabler/icons-react'
import {ProjectService} from '@/features/projects'
import type {Project} from '@/features/projects/types/project'
import {StudioShell,ProjectArtwork} from './StudioShell'
import {stateLabel} from './studioService'
import styles from './Studio.module.css'

export default function StudioProjects(){
 const navigate=useNavigate();const [projects,setProjects]=useState<Project[]>([])
 const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [query,setQuery]=useState('')
 const [status,setStatus]=useState('all');const [sort,setSort]=useState('updated');const [list,setList]=useState(false)
 const [edit,setEdit]=useState<Project|null>(null);const [name,setName]=useState('');const [deleting,setDeleting]=useState<Project|null>(null)
 const [busy,setBusy]=useState(false);const [manage,setManage]=useState(false);const [selected,setSelected]=useState<string[]>([])
 const [hasMore,setHasMore]=useState(false)
 async function load(more=false){setLoading(true);setError('');try{const r=await ProjectService.getProjects({limit:50,offset:more?projects.length:0,sort_by:'updated_at',sort_order:'desc'});setProjects(p=>more?[...p,...r.projects]:r.projects);setHasMore(r.projects.length===50)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[])
 const filtered=useMemo(()=>projects.filter(p=>(status==='all'?p.status!=='archived':p.status===status)&&(`${p.name} ${p.description??''}`).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):new Date(sort==='created'?b.created_at:b.updated_at).getTime()-new Date(sort==='created'?a.created_at:a.updated_at).getTime()),[projects,status,query,sort])
 async function update(p:Project,changes:{name?:string;status?:'archived'|'draft'}){setBusy(true);setError('');try{await ProjectService.updateProject(p.id,changes);setProjects(old=>old.map(x=>x.id===p.id?{...x,...changes}:x));setEdit(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function remove(){if(!deleting)return;setBusy(true);try{await ProjectService.deleteProject(deleting.id);setProjects(p=>p.filter(x=>x.id!==deleting.id));setDeleting(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function archiveSelected(){setBusy(true);setError('');try{for(const id of selected){await ProjectService.updateProject(id,{status:'archived'});setProjects(p=>p.map(x=>x.id===id?{...x,status:'archived'}:x))}setSelected([]);setManage(false)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <StudioShell><main className={styles.page}>
  <div className={styles.sectionHead}><div className={styles.pageTitle}><h1>我的项目</h1><span className={styles.subtle}>Projects Hub</span><span className={styles.badge}>{projects.length} 个项目{hasMore?' · 继续加载':''}</span></div><Button className={styles.primary} leftSection={<IconPlus size={17}/>} onClick={()=>navigate('/')}>新建项目</Button></div>
  <div className={styles.toolbar}>
   <TextInput className={styles.search} classNames={{input:styles.searchInput}} leftSection={<IconSearch size={16}/>} aria-label="搜索项目" placeholder="搜索项目名称、创意或描述…" value={query} onChange={e=>setQuery(e.currentTarget.value)}/>
   <div className={styles.filters}>{[['all','全部项目'],['draft','草稿'],['processing','制作中'],['completed','已完成'],['archived','已归档']].map(([v,l])=><UnstyledButton key={v} className={styles.filter} data-active={status===v} onClick={()=>setStatus(v)}>{l}</UnstyledButton>)}</div>
   <Select aria-label="项目排序" value={sort} onChange={v=>setSort(v??'updated')} data={[{value:'updated',label:'最近编辑'},{value:'created',label:'创建时间'},{value:'name',label:'项目名称'}]} allowDeselect={false} w={115} size="xs" classNames={{input:styles.selectInput}}/>
   <ActionIcon title={list?'网格视图':'列表视图'} aria-label="切换项目视图" onClick={()=>setList(!list)} className={styles.iconButton} variant="subtle">{list?<IconGridDots size={18}/>:<IconList size={18}/>}</ActionIcon>
  </div>
  {error&&<Alert color="red" mb="md" role="alert">{error}<Button variant="subtle" size="xs" onClick={()=>void load()}>重新加载</Button></Alert>}
  {loading&&!projects.length?<div className={styles.loading}><Loader size="sm"/></div>:<div className={`${styles.projectGrid} ${list?styles.list:''}`}>
   <UnstyledButton className={styles.createCard} onClick={()=>navigate('/')}><div className={styles.plusTile}><IconPlus size={27}/></div><strong>新建空白项目</strong><span className={styles.subtle}>描述创意，让 Agent 帮你完成制作</span><span className={styles.badge}>人物口播 ＋ 动效融合</span></UnstyledButton>
   {filtered.map(p=><article className={styles.projectCard} key={p.id} data-testid="studio-project">
    <UnstyledButton className={`${styles.projectCover} ${styles.cover}`} aria-label={'打开项目 '+p.name} onClick={()=>navigate(`/workspace/${p.id}`)}>
     <div className={styles.coverBadges}><span className={styles.badge}>AI 视频项目</span><span className={styles.badge} data-status={p.status}>{stateLabel(p.status)}</span></div><ProjectArtwork name={p.name}/>
    </UnstyledButton>
    <div className={styles.projectInfo}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><h3>{p.name}</h3>
     {manage?<Checkbox aria-label={'选择 '+p.name} checked={selected.includes(p.id)} onChange={e=>setSelected(old=>e.currentTarget.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>:<Menu position="bottom-end"><Menu.Target><ActionIcon variant="subtle" aria-label={'管理 '+p.name} className={styles.iconButton} size="sm"><IconDotsVertical size={16}/></ActionIcon></Menu.Target><Menu.Dropdown>
      <Menu.Item leftSection={<IconEdit size={14}/>} onClick={()=>{setEdit(p);setName(p.name)}}>重命名</Menu.Item>
      <Menu.Item leftSection={<IconArchive size={14}/>} onClick={()=>void update(p,{status:p.status==='archived'?'draft':'archived'})}>{p.status==='archived'?'取消归档':'归档项目'}</Menu.Item>
      <Menu.Item color="red" leftSection={<IconTrash size={14}/>} onClick={()=>setDeleting(p)}>删除项目</Menu.Item>
     </Menu.Dropdown></Menu>}
    </div><p className={styles.projectDescription}>{p.description||'打开工作台，继续完善创意与制作内容。'}</p></div>
    <div className={styles.projectFooter}><span className={styles.subtle}>{new Date(p.updated_at).toLocaleDateString('zh-CN')} 更新</span><Button variant="subtle" size="compact-xs" color="cyan" rightSection={<IconArrowUpRight size={12}/>} onClick={()=>navigate(`/workspace/${p.id}`)}>继续编辑</Button></div>
   </article>)}
  </div>}
  {!loading&&filtered.length===0&&projects.length>0&&<div className={styles.empty}>没有符合条件的项目</div>}
  <div className={styles.sectionHead} style={{marginTop:25}}><Button variant="subtle" color="gray" size="xs" onClick={()=>{setManage(!manage);setSelected([])}}>{manage?'完成管理':'批量管理'}</Button>
   {manage&&<Button variant="light" size="xs" disabled={!selected.length} loading={busy} onClick={()=>void archiveSelected()}>归档所选（{selected.length}）</Button>}
   {hasMore&&<Button variant="subtle" size="xs" loading={loading} onClick={()=>void load(true)}>加载更多项目</Button>}
  </div>
 </main>
 <Modal opened={!!edit} onClose={()=>setEdit(null)} title="重命名项目" centered><TextInput label="项目名称" value={name} onChange={e=>setName(e.currentTarget.value)} maxLength={100}/><Button mt="md" disabled={!name.trim()} loading={busy} onClick={()=>edit&&void update(edit,{name:name.trim()})}>保存</Button></Modal>
 <Modal opened={!!deleting} onClose={()=>setDeleting(null)} title="删除项目" centered><p>确定删除「{deleting?.name}」？服务器上的原始素材、制作过程文件、成片以及浏览器缓存都会一起删除，无法恢复。正在制作的项目需先停止。</p><Button color="red" loading={busy} onClick={()=>void remove()}>确认删除</Button></Modal>
 </StudioShell>
}
