import {useCallback,useEffect,useRef,useState} from 'react'
import {Link,useParams,useSearchParams} from 'react-router-dom'
import {ActionIcon,Alert,Button,Checkbox,FileButton,Loader,Select,Textarea,TextInput,UnstyledButton} from '@mantine/core'
import {IconArrowUp,IconBox,IconChevronRight,IconDownload,IconLayoutBoard,IconPhoto,IconPlayerPlay,IconPlayerStop,IconPlus,IconRobot,IconSchema,IconSparkles,IconTimeline,IconX} from '@tabler/icons-react'
import {MarkdownLite} from '@/components/ui'
import {getHistory,sendChat,stopAgent,subscribeAgentStream,type ToolEvent} from './agentService'
import {applyPackageProposal,approveGate,artifactURL,assetURL,downloadArtifact,getStudio,invokePackage,nodeArtifacts,requestID,stateLabel,uploadStudioFile,type Artifact,type PackageInfo,type StudioInput,type StudioRun,type StudioState} from './studioService'
import {PackageLibrary,ProtectedMedia,StudioShell} from './StudioShell'
import WorkflowCanvas from './WorkflowCanvasView'
import {nodeEditPrompt,nodeRerunInput} from './nodeOperations'
import {executionSummary,workflowPackages} from './workflowProgress'
import ExecutionStatus from './ExecutionStatus'
import AgentProcess from './AgentProcess'
import ScriptEditor from './ScriptEditor'
import MaterialNodeDetail from './MaterialNodeDetail'
import NativeVideoDetail from './NativeVideoDetail'
import QualityReview from './QualityReview'
import WorkspaceNotice from './WorkspaceNotice'
import {uploadKindOf} from './HomeAttachments'
import {useChatTimeline,type ChatLine} from './useChatTimeline'
import styles from './Studio.module.css'

type Tab='canvas'|'shots'|'timeline'|'assets'|'settings'
const tabItems:[Tab,string,typeof IconSchema][]=[['canvas','AI 画布流',IconSchema],['shots','分镜故事板',IconLayoutBoard],['timeline','时间轴',IconTimeline],['assets','素材与产物',IconPhoto],['settings','制作设置',IconBox]]

export default function StudioWorkspace(){
 const {projectId=''}=useParams();const [searchParams,setSearchParams]=useSearchParams()
 const [state,setState]=useState<StudioState|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true)
 const [syncError,setSyncError]=useState('')
 const [tab,setTab]=useState<Tab>('canvas');const [selected,setSelected]=useState<string|null>(null)
 const [library,setLibrary]=useState(false);const [busy,setBusy]=useState(false);const actionLock=useRef(false)
 const [editingScript,setEditingScript]=useState<StudioRun|null>(null)
 const [messages,setMessages]=useState<ChatLine[]>([]);const [input,setInput]=useState('');const [sending,setSending]=useState(false)
 const sendLock=useRef(false);const activeTurn=useRef<string|null>(null);const [tools,setTools]=useState<Record<string,ToolEvent>>({})
 const [connection,setConnection]=useState('连接中');const end=useRef<HTMLDivElement>(null)
 const intentSent=useRef(false);const [form,setForm]=useState<StudioInput|null>(null)
 const snapshotVersion=useRef(0)
 const timeline=useChatTimeline(state,messages,loading)
 const noticeId=timeline.find(item=>item.kind==='notice')?.id
 const followChat=useRef(true)

 const refresh=useCallback(async()=>{const version=++snapshotVersion.current;try{const next=await getStudio(projectId);if(version===snapshotVersion.current){setState(next);setSyncError('')}return next}catch(e){if(version===snapshotVersion.current)setSyncError((e as Error).message);throw e}},[projectId])
 useEffect(()=>{let live=true;setLoading(true);setState(null);setMessages([]);setTools({});setSelected(null);setEditingScript(null);intentSent.current=false;followChat.current=true
  Promise.all([refresh(),getHistory(projectId)]).then(([,history])=>{if(!live)return;setMessages(history.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({id:m.id,role:m.role,content:m.content,createdAt:m.createdAt})));setError('')}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)})
  return()=>{live=false;snapshotVersion.current++}
 },[projectId,refresh])
 useEffect(()=>{let pending=false;const timer=setInterval(async()=>{if(pending||document.hidden)return;pending=true;try{await refresh()}catch{}finally{pending=false}},5000);return()=>clearInterval(timer)},[refresh])
 useEffect(()=>subscribeAgentStream(projectId,event=>{
  if(event.type==='connected'){setConnection('已连接');return}
  if(event.type==='tool'){
   setTools(old=>({...old,[`${event.turnId}:${event.callId}`]:event}))
   const id='reply-'+event.turnId
   setMessages(old=>old.some(m=>m.id===id)?old:[...old,{id,role:'assistant',content:'',createdAt:new Date().toISOString()}]);return
  }
  if(event.type==='thinking'&&event.turnId===activeTurn.current){
   const id='reply-'+event.turnId
   setMessages(old=>old.some(m=>m.id===id)?old.map(m=>m.id===id?{...m,content:m.content+event.delta}:m):[...old,{id,role:'assistant',content:event.delta,createdAt:new Date().toISOString()}])
  }
  if(event.type==='agent_activity'){setState(old=>old?{...old,agent_activity:event.activity}:old);return}
  if(event.type==='node_status'||event.type==='workflow_state')void refresh().catch(()=>{})
 },()=>setConnection('正在重连')),[projectId,refresh])
 useEffect(()=>{if(followChat.current)end.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[messages,tools,noticeId])
 useEffect(()=>{if(tab==='settings'&&state&&!form)setForm({...state.project.input})},[tab,state,form])

 async function send(explicit?:string){
  const message=(explicit??input).trim();if(!message||sendLock.current||state?.agent_activity?.status==='running')return
  followChat.current=true
  const confirmationMessage=/^(?:已确认|确认|确认文案|确认配音|确认并继续|已确认[，,]?继续)[。.!！\s]*$/.test(message)
  const continueMessage=/^(?:继续|继续执行|继续制作|继续往下做|继续往下走|继续后续制作|接着做)[。.!！\s]*$/.test(message)
  if(state?.run&&['awaiting_confirmation','submission_unknown'].includes(state.run.status)&&(confirmationMessage||(state.run.status==='awaiting_confirmation'&&continueMessage))){
   const id=`review-help-${state.run.id}-${state.run.status}-${state.run.confirmation_version}`
   const content=state.run.status==='submission_unknown'?(state.testing_mode?'当前没有待审核内容。请在对话中的状态卡片点击「重新执行并继续」，或向 Agent 发送「继续执行」，恢复上次未完成的制作。':'当前不需要确认文案或配音，任务在等待核对供应商订单。请查看对话中的状态卡片；发送「已确认」不会恢复或重新提交任务。'):state.run.confirmation==='audio'?'请在本对话中的配音卡片选择：先「查看并试听配音」，或点击「直接继续制作」。所有段落统一处理，不需要逐段确认，也无需重试配音。':'请在画布的文案节点查看或编辑，保存修改后点击「已确认，继续」；文字回复不会直接批准制作。'
   setMessages(old=>old.some(m=>m.id===id)?old:[...old,{id,role:'assistant',content,createdAt:new Date().toISOString()}]);setInput('');focusStatus();return
  }
  sendLock.current=true;setSending(true);setInput('');const turn=requestID();activeTurn.current=turn
  setMessages(old=>[...old,{id:'user-'+turn,role:'user',content:message,createdAt:new Date().toISOString()}])
  try{
   const out=await sendChat({projectId,message,requestId:turn,turnId:turn})
   if(out.reply){const id='reply-'+turn;setMessages(old=>old.some(m=>m.id===id)?old.map(m=>m.id===id?{...m,content:out.reply}:m):[...old,{id,role:'assistant',content:out.reply,createdAt:new Date().toISOString()}])}
   await refresh()
  }catch(e){setMessages(old=>[...old,{id:'error-'+turn,role:'assistant',content:'请求未完成：'+(e as Error).message,createdAt:new Date().toISOString()}])}
  finally{
   setTools(old=>Object.fromEntries(Object.entries(old).map(([id,event])=>[id,event.turnId===turn&&event.status==='running'?{...event,status:'error',detail:'本轮已结束，未收到执行结果'}:event])))
   activeTurn.current=null;sendLock.current=false;setSending(false)
  }
 }
 useEffect(()=>{
  if(loading||!state||intentSent.current)return
  const intent=searchParams.get('intent');if(!intent)return
  intentSent.current=true
  const key='studio-intent-'+projectId
  setSearchParams({}, {replace:true})
  if(sessionStorage.getItem(key)===intent)return
  sessionStorage.setItem(key,intent);void send(intent)
 },[loading,state,projectId,searchParams])

 async function action(fn:()=>Promise<unknown>){
  if(actionLock.current)return;actionLock.current=true;setBusy(true);setError('')
  try{await fn();await refresh()}catch(e){setError((e as Error).message);await refresh().catch(()=>{})}finally{actionLock.current=false;setBusy(false)}
 }
 function runPackage(p:PackageInfo){void action(()=>invokePackage(projectId,p.id))}
 function control(command:string){void action(()=>invokePackage(projectId,'avatar.control',{action:command}))}
 async function upload(file:File|null,kind:string){if(!file)return;await action(async()=>{
  if(!state?.project.input.revision)await invokePackage(projectId,'avatar.configure',{})
  await uploadStudioFile(projectId,file,kind)
  const next=await refresh(),latest=next.project.input
  setForm(old=>old?{...old,revision:latest.revision,assets:latest.assets,photo:latest.photo,...(kind==='audio'?{voice_reference:latest.voice_reference}:{})}:old)
 })}
 function openSettings(){setForm(state?{...state.project.input}:null);setTab('settings');setSelected(null)}
 const run=state?.run
 const editScript=useCallback(()=>{if(state?.run?.script)setEditingScript(structuredClone(state.run))},[state?.run])
 const nodes=state?workflowPackages(state):[]
 const selectedPackage=nodes.find(p=>p.id===selected||(p.materialId&&selected===`material:${p.materialId}`))??state?.packages.find(p=>p.id===selected)
 const proposal=state?.proposal&&!state.proposal.applied?state.proposal:null
 const active=run?.status==='running'||run?.status==='stopping'
 const agentBusy=sending||state?.agent_activity?.status==='running'
 const processTurn=activeTurn.current??(state?.agent_activity?.status==='running'?state.agent_activity.turn_id:null)
 const summary=state?executionSummary(state):null
 function focusStatus(){followChat.current=false;const target=document.querySelector<HTMLElement>('[data-execution-status],[data-pending-proposal]');target?.scrollIntoView({block:'nearest',behavior:'smooth'});target?.focus({preventScroll:true})}
 function viewCurrent(){const node=summary?.node??'F01';const p=nodes.find(p=>p.node===node);if(p){setTab('canvas');setSelected(p.id)}}
 function assistFailure(mode:'diagnose'|'adjust',needId?:string){
  const target=needId?`视频节点 ${needId}`:run?.error_step_id||run?.stage||'当前失败步骤'
  const request=mode==='diagnose'?`请只排查 ${target} 的失败原因：先用 avatar_inspect 读取最新后台错误、重试记录和失败输出，说明已尝试的修复与仍未解决的问题，并给出重试、跳过、修改提示词或调整步骤的可选方案。等待我选择后再执行，不要立即重试或启动生成。`:`请检查 ${target} 的失败记录和素材依赖，提出调整或跳过此步骤的具体方案。跳过前确认该段仍有完整可用画面，说明对镜头组装的影响；可以调整步骤或优化提示词。先提供可确认的修改方案，不要直接启动制作。`
  void send(request)
 }
 function statusAction(){
  if(!state)return
  switch(summary?.action){
   case 'confirm':if(run)void action(()=>approveGate(run));break
   case 'resume':control('resume');break
   case 'retry':control('retry');break
   case 'diagnose':assistFailure('diagnose');break
   case 'refresh':void action(refresh);break
   case 'proposal':document.querySelector('[data-pending-proposal]')?.scrollIntoView({block:'center',behavior:'smooth'});break
   case 'start':void send('请继续按照这个项目已保存的需求和上传素材制作视频。先读取当前状态，保存必要参数并实际提交制作任务；如果缺少必要信息或需要审核，请明确告诉我原因和下一步。');break
  }
 }
 function renderSettings(){
  if(!form)return <Loader size="sm"/>
  const animationEnabled=form.use_animation??(!form.use_avatar||!!run?.needs.some(n=>n.kind==='animation'))
  const change=(key:keyof StudioInput,value:unknown)=>setForm(old=>old?{...old,[key]:value}:old)
  return <><div className={styles.inspectorTitle}><h2>制作设置</h2><span className={styles.badge}>草稿 v{form.revision}</span></div>
   <div className={styles.inspectorGrid}>
    <TextInput className={styles.field} label="项目名称" value={form.title} onChange={e=>change('title',e.currentTarget.value)}/>
    <Select className={styles.field} label="画面比例" data={['9:16','16:9','1:1']} value={form.ratio} onChange={v=>change('ratio',v)}/>
    <Select className={styles.field} label="动效风格" disabled={!animationEnabled} data={state!.styles.filter(s=>s.published&&!s.legacy&&(!s.archived||s.id===form.style)).map(s=>({value:s.id,label:s.name+(s.archived?'（历史方案）':'')}))} value={form.style} onChange={v=>change('style',v)} searchable/>
   </div>
   <div className={styles.panel}><p>Seedance 2.5 直接生成口播画面和声音，字幕与动效跟随视频原声。</p><Select label="参考音色（可选）" placeholder="模型默认音色" clearable value={form.voice_reference||null} data={state!.project.input.assets.filter(a=>a.kind==='audio'&&!a.excluded).map(a=>({value:a.id,label:a.name}))} onChange={v=>change('voice_reference',v||'')}/><FileButton onChange={f=>void upload(f,'audio')}>{props=><Button {...props} mt="sm" variant="light" disabled={busy}>上传参考音色（较长录音自动截取 20 秒）</Button>}</FileButton></div>
   <Textarea className={styles.field} mt="md" label="主题与受众" value={form.topic} onChange={e=>change('topic',e.currentTarget.value)} autosize minRows={3}/>
   <Textarea className={styles.field} mt="md" label="完整口播稿（可选）" description="留空时由 Agent 根据主题创作" value={form.script} onChange={e=>change('script',e.currentTarget.value)} autosize minRows={4}/>
   <Textarea className={styles.field} mt="md" label="制作要求" value={form.direction} onChange={e=>change('direction',e.currentTarget.value)} autosize minRows={2}/>
   <Checkbox mt="md" label="使用数字人出镜" checked={form.use_avatar} onChange={e=>change('use_avatar',e.currentTarget.checked)}/>
   <Checkbox mt="md" label="加入动效画面" description="单纯人物口播可关闭，流程中不安排额外动效生成" checked={animationEnabled} onChange={e=>change('use_animation',e.currentTarget.checked)}/>
   <div className={styles.actionRow}><Button className={styles.primary} loading={busy} onClick={()=>void action(async()=>{const {revision,title,topic,script,direction,style,ratio,use_avatar,use_animation,voice_reference}=form;await invokePackage(projectId,'avatar.configure',{revision,title,topic,script,direction,style,ratio,use_avatar,use_animation,voice_reference});const next=await refresh();setForm({...next.project.input})})}>保存设置</Button>
    <FileButton onChange={file=>void upload(file,'photo')}>{props=><Button {...props} className={styles.ghost} leftSection={<IconPhoto size={14}/>} disabled={busy}>上传人物照片</Button>}</FileButton>
   </div>
  </>
 }
 function renderShots(){
  const shots=run?.shots??[]
  return <><div className={styles.inspectorTitle}><h2>分镜故事板</h2><span className={styles.subtle}>{shots.length} 个镜头</span></div>
   {!shots.length?<div className={styles.empty}><IconLayoutBoard size={36} stroke={1}/><span>素材制作完成后，Agent 会根据内容生成分镜。</span><Button variant="subtle" size="xs" onClick={()=>setInput('请检查前置步骤，规划分镜制作。')}>让 Agent 帮我规划</Button></div>:<div className={styles.mediaGrid}>{shots.map(s=><div className={styles.panel} key={s.id}>
    <span className={styles.badge}>{s.id} · {s.start.toFixed(1)}–{s.end.toFixed(1)}s</span><h3 style={{marginTop:12}}>{s.keyword||s.id}</h3><p>{s.intent||`布局：${s.layout}`}</p><p>主素材：{s.primary}</p>
    <Button size="compact-xs" variant="subtle" onClick={()=>setInput(`请修改分镜 ${s.id}，我的要求是：`)}>让 Agent 修改</Button>
   </div>)}</div>}
  </>
 }
 function renderTimeline(){
  return <><div className={styles.inspectorTitle}><h2>制作时间轴</h2><span className={styles.badge}>{(run?.duration??0).toFixed(1)} 秒</span></div>
   {!run?.segments.length?<div className={styles.empty}><IconTimeline size={36}/><span>完成配音后显示真实时间轴。</span></div>:<>
    <p className={styles.subtle}>视频 / 分镜</p><div className={styles.shotTimeline}>{run.shots.map(s=><UnstyledButton key={s.id} className={styles.timelineClip} style={{flex:Math.max(.1,s.end-s.start)}} onClick={()=>{setTab('shots')}}>{s.id}<br/>{s.keyword}</UnstyledButton>)}</div>
    <p className={styles.subtle}>配音 / 段落</p><div className={styles.shotTimeline}>{run.segments.map(s=><UnstyledButton key={s.id} className={styles.timelineClip} style={{flex:Math.max(.1,s.duration),background:'#22372e',borderColor:'#5bbda0',color:'#9bd5ba'}} onClick={()=>{setSelected('avatar.voice');setTab('canvas')}}>{s.id}<br/>{s.duration.toFixed(1)}s</UnstyledButton>)}</div>
    {run.segments.map(s=><div className={styles.panel} key={s.id}><span className={styles.badge}>{s.id} · {s.start.toFixed(1)}s</span><p>{s.text}</p></div>)}
   </>}
  </>
 }
 function renderAssets(){
  return <><div className={styles.inspectorTitle}><h2>素材与产物</h2><FileButton onChange={f=>void upload(f,f?uploadKindOf(f):'file')}>{props=><Button {...props} size="xs" className={styles.ghost} disabled={busy} leftSection={<IconPlus size={14}/>}>添加素材</Button>}</FileButton></div>
   <div className={styles.mediaGrid}>{state!.project.input.assets.map(a=><div className={styles.panel} key={a.id}><h3>{a.name}</h3>{a.kind!=='text'&&<div className={styles.mediaPreview}><ProtectedMedia url={assetURL(projectId,a.id)} kind={a.kind==='audio'?'audio':a.kind==='video'?'video':'image'} alt={a.name}/></div>}<span className={styles.subtle}>{a.kind==='audio'?'参考音色':a.kind==='photo'?'人物照片':a.kind==='video'?'参考视频':a.kind==='text'?'参考文案 · 分析结果见「参考素材分析」':'图片素材'}{a.duration>0?` · ${a.duration.toFixed(1)}s`:''}</span></div>)}</div>
   {!!state!.project.input.reference_links?.length&&<div className={styles.panel}><h3>参考网页</h3>{state!.project.input.reference_links.map(url=><p key={url}><a href={url} target="_blank" rel="noopener noreferrer" style={{color:'#8ed5ff',overflowWrap:'anywhere'}}>{url}</a></p>)}</div>}
   {!state!.project.input.assets.length&&!state!.project.input.reference_links?.length&&<div className={styles.empty}><IconPhoto size={32}/><span>上传人物照片和参考素材，供 Agent 制作使用。</span></div>}
   <h3>制作产物</h3>{renderArtifacts((run?.artifacts??[]).filter(a=>!a.id.startsWith('quality-')||a.id==='quality-review'))}
  </>
 }
 function renderArtifacts(artifacts:Artifact[]){
  return run&&artifacts.length?artifacts.map(a=><div className={styles.panel} key={a.id}><div className={styles.sectionHead}><h3>{a.name}</h3><Button size="compact-xs" variant="subtle" leftSection={<IconDownload size={13}/>} onClick={()=>void action(()=>downloadArtifact(run.id,a))}>下载</Button></div>
   {(a.media_type.startsWith('video/')||a.media_type.startsWith('image/'))&&<div className={styles.mediaPreview}><ProtectedMedia url={artifactURL(run.id,a.id)} kind={a.media_type.startsWith('video/')?'video':'image'} alt={a.name}/></div>}
   {a.media_type.startsWith('audio/')&&<ProtectedMedia url={artifactURL(run.id,a.id)} kind="audio"/>}
  </div>):<p className={styles.subtle}>产物会随制作进度自动出现在这里。</p>
 }
 function renderDetail(p:PackageInfo){
  if(p.materialId&&state?.run)return <MaterialNodeDetail key={`${state.run.id}:${p.materialId}`} state={state} needId={p.materialId} onRefresh={refresh} onClose={()=>setSelected(null)} onAssist={mode=>assistFailure(mode,p.materialId)} agentBusy={!!agentBusy}/>
  if(p.nativeSegmentId&&state?.run)return <NativeVideoDetail state={state} segmentId={p.nativeSegmentId} onClose={()=>setSelected(null)}/>
  if(p.merge&&state&&run)return <><div className={styles.inspectorTitle}><h2>素材汇总与镜头组装</h2><ActionIcon aria-label="返回画布" variant="subtle" onClick={()=>setSelected(null)}><IconX size={17}/></ActionIcon></div><p className={styles.subtle}>各个视频完成后汇入同一份素材清单，统一组装镜头，交给下一步审阅。</p><div className={styles.actionRow}><Button disabled={active||busy||!['paused','failed','interrupted'].includes(run.status)} loading={busy} onClick={()=>control(run.status==='paused'?'resume':'retry')}>{run.needs.every(n=>run.materials.some(m=>m.need_id===n.id))?'汇总素材并继续':'补齐素材并汇总'}</Button></div>{run.needs.map(n=><div className={styles.panel} key={n.id}><h3>{n.content}</h3><p>{run.materials.some(m=>m.need_id===n.id)?'视频已就绪':'视频待制作'}</p><Button size="compact-xs" variant="subtle" onClick={()=>setSelected(`material:${n.id}`)}>查看视频与提示词</Button></div>)}{renderShots()}</>
  return <><div className={styles.inspectorTitle}><div><span className={styles.badge}>{p.node} · v{p.version}</span><h2 style={{marginTop:12}}>{p.title}</h2></div><ActionIcon aria-label="返回画布" variant="subtle" onClick={()=>setSelected(null)}><IconX size={17}/></ActionIcon></div>
   <div className={styles.panel}><p>{p.description}</p><span className={styles.subtle}>产物：{p.node==='F12'?'口播成片、封面图':p.outputs.join('、')}</span>{!p.ready&&<Alert mt="md" color="yellow">{p.reason}</Alert>}</div>
   <div className={styles.actionRow}>{p.node==='F01'?<Button className={styles.primary} onClick={openSettings}>编辑制作需求</Button>:<><Button className={styles.primary} loading={busy} disabled={active||['succeeded','awaiting_confirmation'].includes(run?.status??'')||(run?.status==='submission_unknown'&&!state?.testing_mode)} onClick={()=>runPackage(p)} leftSection={<IconPlayerPlay size={14}/>}>执行到此步骤</Button>{run&&<Button className={styles.ghost} loading={busy} disabled={active||(run.status==='submission_unknown'&&!state?.testing_mode)} onClick={()=>void action(()=>invokePackage(projectId,'avatar.rerun',nodeRerunInput(p)))}>从此步骤重做</Button>}</>}<Button className={styles.ghost} onClick={()=>setInput(nodeEditPrompt(p))}>让 Agent 编辑此节点</Button></div>
   {run&&p.node!=='F01'&&<p className={styles.subtle}>重做会先生成方案，确认后重新执行此步骤及后续步骤，保留原版本。</p>}
   {['F02','F03'].includes(p.node??'')&&run?.script&&<Button size="xs" variant="light" onClick={editScript}>手动编辑文案</Button>}
   {p.node==='F01.2'&&run?.requirements&&<div className={styles.panel}><h3>{run.requirements.goal}</h3><p>受众：{run.requirements.audience}</p>{[...(run.requirements.key_points??[]),...(run.requirements.constraints??[]),...(run.requirements.assumptions??[])].map((s,i)=><p key={i}>{s}</p>)}</div>}
   {p.node==='F01.4'&&run?.references?.map(r=><div className={styles.panel} key={r.id}><h3>{r.name}</h3><p style={{whiteSpace:'pre-wrap'}}>{r.summary}</p><p className={styles.subtle}>{r.limitations}</p></div>)}
   {p.node==='F01.6'&&run?.director&&<><p>{run.director.summary}</p>{run.director.scenes.map(s=><div className={styles.panel} key={s.id}><h3>{s.purpose}</h3><p>{s.visual}</p><p>动效：{s.motion}</p><p>转场：{s.transition} · 声音：{s.sound}</p><p>{run.director?.timing==='measured'?`配音实测 ${s.start.toFixed(1)}–${s.end.toFixed(1)} 秒`:`预计 ${s.estimated_duration} 秒`}</p><p>{s.narration}</p></div>)}</>}
   {['F01.2','F01.4','F01.6'].includes(p.node??'')&&renderArtifacts((run?.artifacts??[]).filter(a=>a.id===({'F01.2':'requirements','F01.4':'references','F01.6':'director'} as Record<string,string>)[p.node!]))}
   {p.members&&p.members.length>1&&p.node==='F10'&&<><p className={styles.subtle}>各素材可单独修改或重做，融合结果在下一阶段审阅。</p>{p.members.filter(n=>['F06','F07','F08'].includes(n)).map(n=>{const sub=state?.packages.find(p=>p.node===n);return sub?<Button key={n} variant="light" size="xs" mr="xs" mb="sm" onClick={()=>setSelected(sub.id)}>查看{sub.title}</Button>:null})}{renderArtifacts((run?.artifacts??[]).filter(a=>a.id.startsWith('material-')))}</>}
   {['F06','F07','F08'].includes(p.node??'')&&renderArtifacts((run?.artifacts??[]).filter(a=>run?.needs.some(n=>n.kind===({F06:'avatar',F07:'animation',F08:'real'} as Record<string,string>)[p.node!]&&a.id==='material-'+n.id)))}
   {p.node==='F11'&&run?.version==='avatar-workflow/3.0'&&<div className={styles.actionRow}><Button size="xs" variant="light" onClick={()=>setSelected('avatar.avatar')}>单独查看人物</Button><Button size="xs" variant="light" onClick={()=>setSelected('avatar.animation')}>单独查看动效</Button></div>}
   {(p.node==='F11.1'||p.node==='F11.2')&&renderArtifacts(nodeArtifacts(run?.artifacts??[],p.node))}
   {p.node==='F02'&&run?.script&&<div className={styles.panel}><p style={{whiteSpace:'pre-wrap'}}>{run.script}</p></div>}
   {['F03','F04'].includes(p.node??'')&&run?.segments.map(s=><div className={styles.panel} key={s.id}><h3>{s.id} · {s.chapter}</h3><p>{s.text}</p>{p.node==='F04'&&s.native_video&&<ProtectedMedia kind="video" url={artifactURL(run.id,'native-'+s.id)}/>} {s.audio&&<ProtectedMedia kind="audio" url={`/api/v1/agent/runs/${run.id}/segments/${s.id}/audio`}/>}<Button variant="subtle" size="compact-xs" onClick={()=>setInput(`请修改${p.node==='F04'?(run.input.speech_mode==='native-video'?'原声人物':'配音'):'文案'}段落 ${s.id}：`)}>提出修改</Button></div>)}
   {['F05','F06','F07','F08'].includes(p.node??'')&&run?.needs.filter(n=>p.node==='F05'||n.kind===({F06:'avatar',F07:'animation',F08:'real'} as Record<string,string>)[p.node!]).map(n=><div className={styles.panel} key={n.id}><h3>{n.id} · {n.kind}</h3><p>{n.content}</p><Button variant="subtle" size="compact-xs" onClick={()=>setInput(`请读取 ${p.node}「${p.title}」中的素材 ${n.id} 并修改，修改要求：`)}>提出修改</Button></div>)}
   {p.node==='F04'&&run?.audio_quality&&<QualityReview runId={run.id} report={run.audio_quality}/>}
   {['F11','F11.1','F11.2','F12'].includes(p.node??'')&&run?.quality_review&&<QualityReview runId={run.id} report={run.quality_review} reviewed={!!run.final_confirmed}/>}
   {p.node==='F10'&&renderShots()}
   {(p.node==='F11'||p.node==='F12')&&renderArtifacts(nodeArtifacts(run?.artifacts??[],p.node))}
  </>
 }

 return <StudioShell onPackages={()=>setLibrary(true)}><main className={styles.workspace}>
  <div className={styles.workspaceHead}><div className={styles.breadcrumb}><Link to="/projects" style={{color:'inherit',textDecoration:'none'}}>项目库</Link><IconChevronRight size={12}/><strong>{state?.project.name||'项目工作台'}</strong><IconChevronRight size={12}/><span>制作画布</span></div>
   <Button size="compact-xs" variant="subtle" disabled={!state} onClick={focusStatus} aria-label="查看制作状态"><span className={styles.badge} data-status={run?.status}>{stateLabel(run?.status??'draft')}</span><span style={{marginLeft:8}}>在对话中查看 <IconChevronRight size={11}/></span></Button>
  </div>
  <WorkspaceNotice message={error} onClose={()=>setError('')}/>
  <div className={styles.workArea}><section className={styles.stage}>
   <div className={styles.stageToolbar}><div className={styles.tabs}>{tabItems.map(([key,label,Icon])=><UnstyledButton key={key} className={styles.tab} data-active={tab===key} onClick={()=>{setTab(key);setSelected(null);if(key==='settings')openSettings()}} title={label} aria-label={label}><Icon size={14}/><span>{label}</span></UnstyledButton>)}</div>
    {run&&run.version!=='avatar-workflow/3.0'&&<Button size="compact-xs" variant="light" disabled={!!active||busy} onClick={()=>void action(()=>invokePackage(projectId,'avatar.rerun',{from:'F01.2',target:'F12',changes:'保留历史版本，按新版11步流程重新分析需求、设计导演稿并制作视频。'}))}>使用新版 11 步流程</Button>}
   </div>
   {loading?<div className={styles.loading}><Loader size="sm"/></div>:!state?<div className={styles.empty}>项目暂时无法加载<Button onClick={()=>void action(refresh)} variant="subtle">重试</Button></div>:
    tab==='canvas'?<div className={styles.flowStage}>
     <WorkflowCanvas state={state} onOpen={setSelected} onEditScript={editScript}/>
     {selectedPackage&&<aside className={styles.flowDetail} aria-label="步骤详情">{renderDetail(selectedPackage)}</aside>}
    </div>:<div className={styles.inspector}>{tab==='settings'?renderSettings():tab==='shots'?renderShots():tab==='timeline'?renderTimeline():tab==='assets'?renderAssets():null}</div>}
  </section>
  <aside className={styles.chat} aria-label="Agent 对话"><div className={styles.chatHeader}><div className={styles.agentBrand}><div className={styles.agentIcon}><IconRobot size={21}/></div><div><strong>AvaSpeak Agent</strong><small>AI 视频制作助手</small></div></div><span className={styles.badge}>{connection}</span></div>
   <div className={styles.chatContext}><IconSchema size={13}/><span>已关联当前项目 · {nodes.length} 个制作节点</span></div>
   <div className={styles.chatMessages} role="log" aria-label="对话消息" onScroll={e=>{const el=e.currentTarget;followChat.current=el.scrollHeight-el.scrollTop-el.clientHeight<64}}>
    {!messages.length&&<div className={styles.message}><div className={styles.messageName}><IconSparkles size={13}/>AvaSpeak 导演助理</div><div className={styles.bubble}>你好，我可以帮你整理创意、生成口播稿、制作数字人和动效。告诉我想做什么，也可以点击画布中的节点开始。</div></div>}
    {timeline.map(item=>{
     if(item.kind==='notice')return <div key={item.id} className={styles.message} data-chat-item="notice">
      {state&&summary?.action!=='proposal'&&<ExecutionStatus state={state} busy={busy||agentBusy} onPrimary={statusAction} onCurrent={viewCurrent} onPause={()=>control('pause')} onStop={()=>control('stop')} syncError={syncError}/>}
      {proposal&&<div className={styles.proposal} data-pending-proposal><h4>修改方案 · 等待确认</h4>{proposal.lines.map((line,i)=><p key={i}>{line}</p>)}<Button size="xs" fullWidth className={styles.primary} loading={busy} onClick={()=>void action(()=>applyPackageProposal(projectId,proposal))}>应用修改并重新制作</Button><Button size="compact-xs" variant="subtle" mt={8} onClick={()=>setInput('请调整刚才的修改方案：')}>继续调整方案</Button></div>}
     </div>
     const m=item.message
     return <div key={m.id} data-chat-item="message" className={`${styles.message} ${m.role==='user'?styles.userMessage:''}`}>{m.role==='user'?<div className={styles.userBubble}>{m.content}</div>:<div><div className={styles.messageName}><IconSparkles size={13}/>AvaSpeak 导演助理</div><AgentProcess events={Object.values(tools).filter(event=>m.id==='reply-'+event.turnId)} busy={!!agentBusy&&m.id==='reply-'+processTurn} packages={state?.packages??[]}/>{m.content&&<div className={styles.bubble}><MarkdownLite content={m.content} color="#c5d1e4" mutedColor="#879bb4" borderColor="#314057" codeBg="#101620"/></div>}</div>}</div>
    })}
    {agentBusy&&!messages.some(message=>message.id==='reply-'+processTurn)&&<AgentProcess events={[]} busy packages={state?.packages??[]}/>}
    <div ref={end}/>
   </div>
   {!agentBusy&&<div className={styles.suggestions}>{['先帮我规划制作流程','查看当前制作进度','帮我优化口播文案'].map(text=><UnstyledButton className={styles.suggestion} key={text} onClick={()=>setInput(text)}>✦ {text}</UnstyledButton>)}</div>}
   <div className={styles.chatComposer}><Textarea aria-label="向 Agent 发送指令" placeholder="描述你想要的画面，或告诉我需要修改什么…" value={input} onChange={e=>setInput(e.currentTarget.value)} autosize minRows={2} maxRows={7} classNames={{input:styles.promptInput}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
    <div className={styles.composerFoot}><div className={styles.composerTools}><FileButton onChange={f=>void upload(f,f?uploadKindOf(f,true):'file')}>{props=><ActionIcon {...props} variant="subtle" aria-label="上传文件" className={styles.iconButton}><IconPhoto size={16}/></ActionIcon>}</FileButton><UnstyledButton className={styles.suggestion} onClick={()=>setLibrary(true)}><IconBox size={11}/> Skill</UnstyledButton></div>{agentBusy?<ActionIcon aria-label="停止回复" color="red" variant="light" onClick={()=>void stopAgent(projectId).then(()=>refresh()).catch(e=>setError(e.message))}><IconPlayerStop size={15}/></ActionIcon>:<ActionIcon aria-label="发送消息" className={styles.primary} disabled={!input.trim()||!state} onClick={()=>void send()}><IconArrowUp size={18}/></ActionIcon>}</div>
   </div>
  </aside></div>
 </main>{editingScript&&<ScriptEditor key={editingScript.id+editingScript.confirmation_version} projectId={projectId} run={editingScript} currentRun={state?.run??null} onSaved={refresh} onClose={()=>setEditingScript(null)}/>}<PackageLibrary opened={library} onClose={()=>setLibrary(false)} onSelect={p=>setInput(`请使用「${p.title}」处理当前项目，先检查需要的输入。`)}/></StudioShell>
}
