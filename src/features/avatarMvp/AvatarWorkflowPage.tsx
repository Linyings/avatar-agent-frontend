import {useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {Alert,Badge,Button,Card,Checkbox,Container,FileInput,Grid,Group,Modal,MultiSelect,NumberInput,Select,Stack,Table,Text,Textarea,TextInput,Title} from '@mantine/core'
import {ShotRecipeEditor,shotRecipes} from './ShotRecipeEditor'
import {workflowService,type WorkflowCatalog,type WorkflowEdits,type WorkflowInput,type WorkflowProject,type WorkflowRun,type WorkflowSegment} from './workflowService'
import AvatarLegacyPage from './AvatarLegacyPage'
import {createAvatarRequestId} from './requestId'
import StyleGallery from './StyleGallery'

const empty:WorkflowInput={revision:1,title:'',topic:'',script:'',direction:'',style:'flat-vector',voice:'',ratio:'9:16',use_avatar:true,angles:[],assets:[]}
const statusLabel:Record<string,string>={running:'执行中',awaiting_confirmation:'等待内容确认',stopping:'停止中',stopped:'用户已停止',failed:'执行失败',interrupted:'执行中断',submission_unknown:'提交状态待确认',succeeded:'制作完成'}
const nodeLabel:Record<string,string>={'F01.4':'视频理解',F02:'写稿',F03:'内容拆解',F04:'分段配音',F05:'素材需求',F06:'人物生成',F07:'动画生产',F08:'真实素材',F09:'素材接入',F10:'分镜',F11:'有声预览',F12:'渲染交付'}
function BlobPlayer({run,id,kind='video'}:{run:string;id:string;kind?:string}){
 const [url,setUrl]=useState('');const [error,setError]=useState('')
 useEffect(()=>{const ctrl=new AbortController();let objectUrl='';workflowService.artifact(run,id,ctrl.signal).then(blob=>{if(!ctrl.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}}).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)});return()=>{ctrl.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[run,id])
 if(error)return <Text c="red">{error}</Text>
 return kind==='audio'?<audio aria-label={id} src={url} controls/>:<video aria-label={id} src={url} controls playsInline style={{width:'100%',maxHeight:560}}/>
}
function InputPreview({project,id,kind}:{project:string;id:string;kind:string}){
 const [url,setUrl]=useState('')
 useEffect(()=>{const ctrl=new AbortController();let objectUrl='';workflowService.asset(project,id,ctrl.signal).then(b=>{if(!ctrl.signal.aborted){objectUrl=URL.createObjectURL(b);setUrl(objectUrl)}}).catch(()=>{});return()=>{ctrl.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[project,id])
 return !url?null:kind==='video'?<video src={url} controls playsInline style={{maxHeight:160,maxWidth:'100%'}}/>:<img src={url} alt="已保存的人物参考" style={{maxHeight:160,maxWidth:'100%',objectFit:'contain'}}/>
}
function VoiceSample({id}:{id:string}){
 const [url,setUrl]=useState('')
 useEffect(()=>{const ctrl=new AbortController();let objectUrl='';workflowService.voice(id,ctrl.signal).then(b=>{if(!ctrl.signal.aborted){objectUrl=URL.createObjectURL(b);setUrl(objectUrl)}}).catch(()=>{});return()=>{ctrl.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[id])
 return url?<audio controls src={url} aria-label="音色示例"/>:null
}
export default function AvatarWorkflowPage({projectId}:{projectId?:string}){
 const [search,setSearch]=useSearchParams();const pid=projectId||search.get('project_id')||'';const rid=search.get('run_id')||''
 const [input,setInput]=useState<WorkflowInput>(empty);const [catalog,setCatalog]=useState<WorkflowCatalog|null>(null);const [project,setProject]=useState<WorkflowProject|null>(null);const [run,setRun]=useState<WorkflowRun|null>(null)
 const [segments,setSegments]=useState<WorkflowSegment[]>([]);const [photo,setPhoto]=useState<File|null>(null);const [videos,setVideos]=useState<File[]>([])
 const [sourcePreview,setSourcePreview]=useState(false)
 const [editKind,setEditKind]=useState('');const [editSegments,setEditSegments]=useState<WorkflowSegment[]>([]);const [editNeeds,setEditNeeds]=useState<WorkflowRun['needs']>([]);const [editShots,setEditShots]=useState<WorkflowRun['shots']>([]);const [editDescriptions,setEditDescriptions]=useState<WorkflowRun['descriptions']>([])
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [legacy,setLegacy]=useState(false);const [tick,setTick]=useState(0);const [notice,setNotice]=useState<WorkflowRun['events'][number]|null>(null);const [showReport,setShowReport]=useState(false)
 const loadedRun=useRef('');const noticeQueue=useRef<WorkflowRun['events']>([]);const noticeActive=useRef(false);const seen=useRef(new Set<string>());const request=useRef(createAvatarRequestId())
 const active=run?.status==='running'||run?.status==='stopping'
 useEffect(()=>{if(!pid&&run?.id===rid&&run.project_id)setSearch({project_id:run.project_id,run_id:rid},{replace:true})},[pid,rid,run,setSearch])
 useEffect(()=>{const ctrl=new AbortController();workflowService.catalog(ctrl.signal).then(c=>{setCatalog(c);setInput(v=>({...v,voice:v.voice||c.default_voice,...(!pid&&!rid?{style:c.styles.find(s=>s.published&&!s.legacy)?.id||v.style}:{})}))}).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)});return()=>ctrl.abort()},[])
 useEffect(()=>{if(!pid)return;const ctrl=new AbortController();workflowService.project(pid,ctrl.signal).then(p=>{if(ctrl.signal.aborted)return;setProject(p);setInput(p.input);if(!rid&&p.runs?.length)setSearch({project_id:pid,run_id:p.runs[0].id},{replace:true})}).catch(e=>{if(ctrl.signal.aborted)return;if(projectId&&e.status===404)setLegacy(true);else setError(e.message)});return()=>ctrl.abort()},[pid,rid,projectId,setSearch])
 useEffect(()=>{
  if(!rid){setRun(null);return};const ctrl=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
  const poll=async()=>{try{const r=await workflowService.run(rid,ctrl.signal);if(ctrl.signal.aborted)return;setRun(r);if(loadedRun.current!==r.id){loadedRun.current=r.id;setSegments(r.segments||[])}else setSegments(old=>old.length&&r.status==='awaiting_confirmation'&&r.confirmation==='script'?old:r.segments||[])
   const unseen=(r.events||[]).filter(e=>!e.read&&!seen.current.has(e.id));for(const e of unseen){seen.current.add(e.id);noticeQueue.current.push(e)};if(!noticeActive.current&&noticeQueue.current.length){noticeActive.current=true;setNotice(noticeQueue.current.shift()!)}
   if(r.status==='running'||r.status==='stopping')timer=setTimeout(poll,2000)
  }catch(e){if(!ctrl.signal.aborted)setError((e as Error).message)}};void poll();return()=>{ctrl.abort();if(timer)clearTimeout(timer)}
 },[rid,tick])
 const change=<K extends keyof WorkflowInput>(key:K,value:WorkflowInput[K])=>{setInput(v=>({...v,[key]:value}));request.current=createAvatarRequestId()}
 const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const save=async()=>{
  let p=project;if(!p){p=await workflowService.create(input)}else{p=await workflowService.save(p.id,input)}
  if(photo)await workflowService.upload(p.id,photo,'photo')
  for(const file of videos)await workflowService.upload(p.id,file,file.type.startsWith('image/')?'image':'video')
  p=await workflowService.project(p.id);setProject(p);setInput(p.input);setPhoto(null);setVideos([]);setSearch({project_id:p.id,...(rid?{run_id:rid}:{})},{replace:true});return p
 }
 const start=()=>action(async()=>{const p=await save();const r=await workflowService.start(p.id,p.input.revision,request.current);setRun(r);setSegments([]);setSearch({project_id:p.id,run_id:r.id});request.current=createAvatarRequestId();setTick(v=>v+1)})
 const confirm=()=>action(async()=>{if(!run)return;const r=await workflowService.confirm(run.id,run.confirmation!,run.confirmation_version!,run.confirmation==='script'?segments:undefined);setRun(r);setTick(v=>v+1)})
 const stop=()=>action(async()=>{if(!run)return;setRun(await workflowService.stop(run.id));noticeActive.current=false;noticeQueue.current=[];setNotice(null);setTick(v=>v+1)})
 const closeNotice=()=>{if(run&&notice)void workflowService.read(run.id,notice.id).catch(()=>{});const next=noticeQueue.current.shift()||null;noticeActive.current=Boolean(next);setNotice(next)}
 const download=async(id:string,name:string)=>{if(!run)return;const blob=await workflowService.artifact(run.id,id);const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 const revise=(edits:Omit<WorkflowEdits,'base_run_id'>)=>action(async()=>{if(!run||!project)return;const p=await save();const r=await workflowService.start(p.id,p.input.revision,createAvatarRequestId(),{base_run_id:run.id,...edits});setEditKind('');setSegments([]);setRun(r);setSearch({project_id:p.id,run_id:r.id});setTick(v=>v+1)})
 const split=(index:number)=>{const seg=segments[index];const matches=[...seg.text.matchAll(/[。！？；]/g)];const cut=matches[Math.floor(matches.length/2)]?.index;if(cut===undefined||cut+1>=seg.text.length){setError('请先在段落中间加入句末标点，再拆段');return};setSegments(v=>v.flatMap((p,i)=>i===index?[{...p,text:p.text.slice(0,cut+1)},{...p,id:'p-'+createAvatarRequestId().slice(0,24),text:p.text.slice(cut+1)}]:[p]))}
 const openEdit=(kind:string)=>{if(!run)return;setEditSegments(run.segments.map(s=>({...s})));setEditNeeds(run.needs.map(s=>({...s})));setEditShots(run.shots.map(s=>({...s})));setEditDescriptions(run.descriptions.map(s=>({...s})));setEditKind(kind)}
 if(legacy)return <AvatarLegacyPage projectId={projectId}/>
 const video=run?.artifacts?.find(a=>a.id==='video');const previews=run?.artifacts?.filter(a=>a.id.startsWith('preview-'))||[]
 return <Container size="xl" py="xl" data-i18n-skip><Stack gap="lg">
  <Group justify="space-between"><div><Badge>数字人口播工作流</Badge><Title order={1} mt="sm">从内容到完整视频</Title><Text c="dimmed">先确认文案与声音，再按实际时长准备素材并完成分镜。</Text></div><Button variant="light" onClick={()=>{setSearch({});setProject(null);setRun(null);setInput({...empty,voice:catalog?.default_voice||''});setSegments([]);request.current=createAvatarRequestId()}}>新建项目</Button></Group>
  {error&&<Alert color="red" withCloseButton onClose={()=>setError('')}>{error}<Button size="xs" variant="subtle" onClick={()=>setTick(v=>v+1)}>刷新状态</Button></Alert>}
  <Grid><Grid.Col span={{base:12,md:5}}><Card withBorder><Stack>
   <Title order={3}>项目输入</Title>
   <Checkbox label="使用数字人" checked={input.use_avatar} disabled={active} onChange={e=>change('use_avatar',e.currentTarget.checked)}/>
   <FileInput label="1. 数字人照片" description={input.photo?'已保存人物照片，可选择替换':'JPG / PNG，最大8MB'} accept="image/png,image/jpeg" value={photo} onChange={setPhoto} disabled={active}/>
   {project&&input.photo&&<InputPreview project={project.id} id={input.photo} kind="photo"/>}
   <Textarea label="2. 视频主题" value={input.topic} onChange={e=>change('topic',e.currentTarget.value)} disabled={active} placeholder="输入主题，或直接填写下方文案"/>
   <Textarea label="3. 文案内容" minRows={5} value={input.script} onChange={e=>change('script',e.currentTarget.value)} disabled={active} description="有原稿时默认保留原意；只有主题时由模型写稿"/>
   <TextInput label="视频标题（可选）" value={input.title} onChange={e=>change('title',e.currentTarget.value)} disabled={active}/>
   <Select label="4. 动效风格" value={input.style} onChange={v=>change('style',v||'flat-vector')} disabled={active} data={catalog?.styles.map(s=>({value:s.id,label:s.name,disabled:!s.published}))||[]}/>
   <StyleGallery styles={catalog?.styles||[]} value={input.style} disabled={!!active} onChange={v=>change('style',v)}/>
   <Select label="5. 人物音色" value={input.voice||null} onChange={v=>change('voice',v||'')} disabled={active} data={catalog?.voices.map(v=>({value:v.id,label:v.name}))||[]}/>
   {catalog?.voices.find(v=>v.id===input.voice)?.sample&&<VoiceSample id={input.voice}/>}
   <FileInput label="6. 原视频素材（可选）" multiple accept="video/*,image/*" value={videos} onChange={setVideos} disabled={active} description="上传视频会先做视频理解，再写最终解说稿；静音素材也会分析画面"/>
   {input.assets.filter(a=>a.kind!=='photo').map(a=><Checkbox key={a.id} label={`${a.name} · ${a.duration.toFixed(1)} 秒`} checked={!a.excluded} disabled={active} onChange={e=>{const excluded=!e.currentTarget.checked;change('assets',input.assets.map(s=>s.id===a.id?{...s,excluded}:s))}}/>)}
   {project&&input.assets.some(a=>a.kind==='video')&&<details onToggle={e=>setSourcePreview(e.currentTarget.open)}><summary>预览已上传原素材</summary>{sourcePreview&&input.assets.filter(a=>a.kind==='video').map(a=><InputPreview key={a.id} project={project.id} id={a.id} kind="video"/>)}</details>}
   <Select label="7. 成片比例" value={input.ratio} onChange={v=>change('ratio',v||'9:16')} disabled={active} data={catalog?.ratios||['9:16','16:9','1:1']}/>
   <Textarea label="制作要求（可选）" placeholder="默认单角度上半身；若需多角度，请在此明确指定" value={input.direction} onChange={e=>change('direction',e.currentTarget.value)} disabled={active}/>
   <MultiSelect label="数字人机位（可选）" placeholder="默认正面；可明确选择多个机位" description="不选默认正面；明确选择的额外机位会增加生成请求。" data={['正面','左前方20度','右前方20度']} value={input.angles} disabled={active} clearable onChange={angles=>{const describe=(a:string[])=>a.length?`请使用${a.join('、')}机位拍摄上半身口播。`:'';setInput(v=>({...v,angles,direction:!v.direction||v.direction===describe(v.angles)?describe(angles):v.direction}));request.current=createAvatarRequestId()}}/>
   <Select label="字幕颜色" value={input.subtitle_color||'#FFC62B'} onChange={v=>change('subtitle_color',v||'#FFC62B')} data={[{value:'#FFC62B',label:'黄色重点'},{value:'#2EE6A8',label:'青绿色'},{value:'#FFFFFF',label:'白色'}]} disabled={active}/>
   <NumberInput label="字幕字号缩放" value={input.subtitle_scale||1} min={.75} max={1.5} step={.1} disabled={active} onChange={v=>change('subtitle_scale',Number(v)||1)}/>
   <Select label="人物小窗位置" value={input.avatar_position||'right'} data={[{value:'right',label:'右侧'},{value:'left',label:'左侧'}]} disabled={active} onChange={v=>change('avatar_position',v||'right')}/>
   {run?.segments.length? <details><summary>只更正字幕（保留原声音）</summary><Text size="xs">用于同字数的错别字及标点修正；更改朗读内容请使用局部文案修改。</Text>{run.segments.map(seg=><Textarea key={seg.id} label={`${seg.id} 字幕`} value={input.subtitle_edits?.[seg.id]??seg.text} disabled={active} onChange={e=>change('subtitle_edits',{...input.subtitle_edits,[seg.id]:e.currentTarget.value})}/>)}</details>:null}
   <Group><Button variant="light" loading={busy} disabled={active} onClick={()=>void action(async()=>{await save()})}>保存草稿</Button><Button loading={busy} disabled={active||(!input.topic.trim()&&!input.script.trim())} onClick={()=>void start()}>{run?'按当前输入新建运行':'开始制作'}</Button></Group>
   <Text size="xs" c="dimmed">模型调用会产生供应商费用；默认单角度，当前首版成片上限90秒。</Text>
  </Stack></Card></Grid.Col><Grid.Col span={{base:12,md:7}}><Stack>
   {run?<Card withBorder><Stack><Group justify="space-between"><Title order={3}>{statusLabel[run.status]||run.status}</Title><Group><Button variant="subtle" size="xs" onClick={()=>setTick(v=>v+1)}>刷新</Button>{!['succeeded','stopped'].includes(run.status)&&<Button color="red" variant="light" size="xs" disabled={busy} onClick={()=>void stop()}>停止任务</Button>}</Group></Group>
    <Text>{nodeLabel[run.stage.split('/')[0]]||run.stage} · 实测配音 {run.duration.toFixed(2)} 秒</Text>
    {run.error&&<Alert color="red" title={run.error_type==='provider'?'模型或网络调用问题':'处理未完成'}>{run.error}</Alert>}
    {run.status==='stopping'&&<Alert color="orange">已停止后续调度。已提交的供应商订单可能仍在执行，实际费用和订单记录保留。</Alert>}
    {['failed','interrupted','submission_unknown'].includes(run.status)&&<Button variant="light" disabled={busy||run.status==='submission_unknown'} onClick={()=>void action(async()=>{setRun(await workflowService.retry(run.id));setTick(v=>v+1)})}>查原订单并恢复失败步骤</Button>}
    {run.confirmation==='script'&&run.status==='awaiting_confirmation'&&<><Title order={4}>确认稿件与内容拆解</Title>{segments.map((s,i)=><Textarea key={s.id} label={`${s.chapter||'内容段'} ${i+1}`} value={s.text} onChange={e=>{const text=e.currentTarget.value;setSegments(v=>v.map(p=>p.id===s.id?{...p,text}:p))}} minRows={2}/>)}<Group>{segments.map((s,i)=><Group key={s.id}><Button size="xs" variant="subtle" onClick={()=>split(i)}>拆分第{i+1}段</Button>{i<segments.length-1&&<Button size="xs" variant="subtle" onClick={()=>setSegments(v=>v.flatMap((p,j)=>j===i?[{...p,text:p.text+v[i+1].text}]:j===i+1?[]:[p]))}>与下一段合并</Button>}</Group>)}</Group><Button loading={busy} onClick={()=>void confirm()}>确认文案，生成分段配音</Button></>}
    {run.confirmation==='audio'&&run.status==='awaiting_confirmation'&&<><Title order={4}>试听并锁定实际时长</Title>{run.segments.map(s=><Stack gap="xs" key={s.id}><Text size="sm">{s.text} · {s.duration.toFixed(2)} 秒</Text><BlobPlayer run={run.id} id={'audio-'+s.id} kind="audio"/><Button size="xs" variant="light" disabled={busy} onClick={()=>void revise({regenerate_segments:[s.id]})}>重新生成本段配音</Button></Stack>)}<Button loading={busy} onClick={()=>void confirm()}>确认配音，继续制作</Button></>}
    {run.descriptions?.length>0&&<details><summary>原视频片段文案</summary>{run.descriptions.map(d=><Text size="sm" key={d.id}>{d.start.toFixed(1)}–{d.end.toFixed(1)} 秒：{d.text}（{d.coverage}）</Text>)}</details>}
    {run.needs?.length>0&&<details><summary>素材需求清单</summary>{run.needs.map(n=><Text key={n.id} size="sm">{n.segment_id} · {n.kind} · {n.duration.toFixed(2)}秒 · {n.content}{n.description_id&&` · 源片段：${run.descriptions.find(d=>d.id===n.description_id)?.text||n.description_id} · 源区间 ${n.source_start||0}–${((n.source_start||0)+n.duration).toFixed(2)}秒`}</Text>)}</details>}
    <Table.ScrollContainer minWidth={450}><Table><Table.Thead><Table.Tr><Table.Th>步骤</Table.Th><Table.Th>状态</Table.Th><Table.Th>耗时</Table.Th><Table.Th>用量 / 费用</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{run.steps?.map(s=><Table.Tr key={s.id}><Table.Td>{nodeLabel[s.id.split('/')[0]]||s.id}<Text size="xs" c="dimmed">{s.id}</Text></Table.Td><Table.Td>{statusLabel[s.status]||s.status}{s.error&&<Text c="red" size="xs">{s.error}</Text>}</Table.Td><Table.Td>{(s.seconds+(s.status==='running'&&s.started_at?Math.max(0,(Date.now()-Date.parse(s.started_at))/1000):0)).toFixed(2)}秒</Table.Td><Table.Td><Text size="xs">{s.cost_status==='reused'?'复用，无新增调用':s.cost_status==='local_compute'?'本地计算':s.cost_status==='reported'?'供应商已报告（保留原单位）':'费用待供应商核实'}</Text>{s.usage&&<Text size="xs">{JSON.stringify(s.usage)}</Text>}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
    {run.events?.length>0&&<Alert color="yellow" title={`${run.events.length} 项提醒；质检提醒不阻塞制作`}><Stack gap="xs">{run.events.map(e=><Text size="xs" key={e.id}>{e.node}：{e.message}</Text>)}</Stack></Alert>}
    {!active&&run.status!=='submission_unknown'&&run.segments.length>0&&<Group><Button size="xs" variant="light" onClick={()=>openEdit('segments')}>修改局部文案</Button><Button size="xs" variant="light" onClick={()=>openEdit('needs')}>调整素材需求</Button><Button size="xs" variant="light" onClick={()=>openEdit('shots')}>调整分镜</Button>{run.descriptions.length>0&&<Button size="xs" variant="light" onClick={()=>openEdit('descriptions')}>修订素材描述</Button>}</Group>}
    <Button variant="subtle" onClick={()=>setShowReport(v=>!v)}>查看调用耗时与用量明细</Button>{showReport&&<pre style={{whiteSpace:'pre-wrap',fontSize:11}}>{JSON.stringify(run.operations,null,2)}</pre>}
   </Stack></Card>:<Alert color="blue">开始后先确认文案，再试听分段声音。关闭浏览器不会停止后台制作。</Alert>}
   {video&&run&&<Card withBorder><Title order={3} mb="md">成片预览</Title><BlobPlayer run={run.id} id="video"/><Group mt="md">{run.artifacts.filter(a=>['video','subtitles','cover','project','report','mapping','shotbook'].includes(a.id)).map(a=><Button key={a.id} size="xs" variant="light" onClick={()=>void action(()=>download(a.id,a.name))}>下载 {a.name}</Button>)}</Group></Card>}
   {run&&run.shots.length>0&&<Card withBorder><Title order={4}>镜头设计</Title><Stack gap="xs" mt="sm">{run.shots.map(s=><Text key={s.id} size="sm"><b>{s.id} · {s.start.toFixed(1)}–{s.end.toFixed(1)} 秒 · {shotRecipes.find(r=>r.value===s.recipe)?.label||'历史布局'}</b>{s.intent&&<>：{s.intent}</>}</Text>)}</Stack><Text size="xs" c="dimmed" mt="sm">构图重复或画面质量提醒不会自动停止制作；可在预览后调整分镜。</Text></Card>}
   {run&&previews.length>0&&<Card withBorder><Title order={4}>分镜有声预览</Title>{previews.map(p=><Stack key={p.id} mt="md"><Text size="sm">{p.name}</Text><BlobPlayer run={run.id} id={p.id}/></Stack>)}</Card>}
   {project&&project.runs?.length>0&&<Select label="历史运行" value={rid||null} data={project.runs.map(r=>({value:r.id,label:`${new Date(r.created_at).toLocaleString()} · ${statusLabel[r.status]||r.status}`}))} onChange={id=>{if(id){setSegments([]);setSearch({project_id:project.id,run_id:id})}}}/>}
  </Stack></Grid.Col></Grid>
  <Modal opened={Boolean(editKind)} onClose={()=>setEditKind('')} title="局部修改：保留旧版，创建新版本" size="lg"><Stack>
   <Text size="sm" c="dimmed">修改后复用依赖未变的配音与素材；必要的新模型调用会记录费用。内容和配音仍需要确认。</Text>
   {editKind==='segments'&&editSegments.map((s,i)=><Textarea key={s.id} label={`第${i+1}段`} value={s.text} onChange={e=>{const text=e.currentTarget.value;setEditSegments(v=>v.map(p=>p.id===s.id?{...p,text}:p))}}/>)}
   {editKind==='needs'&&editNeeds.map((n,i)=><Card key={n.id} withBorder><Text size="sm">{n.segment_id} · {n.kind}</Text><Textarea label="素材内容" value={n.content} onChange={e=>{const content=e.currentTarget.value;setEditNeeds(v=>v.map((p,j)=>j===i?{...p,content}:p))}}/><Textarea label="生成提示词" value={n.prompt||''} onChange={e=>{const prompt=e.currentTarget.value;setEditNeeds(v=>v.map((p,j)=>j===i?{...p,prompt}:p))}}/><NumberInput label="素材秒数" value={n.duration} min={.1} onChange={duration=>setEditNeeds(v=>v.map((p,j)=>j===i?{...p,duration:Number(duration)}:p))}/>{n.kind==='real'&&<><Select label="源片段文案" value={n.description_id||null} data={editDescriptions.map(d=>({value:d.id,label:`${d.start}–${d.end}秒 · ${d.text}`}))} onChange={id=>{const d=editDescriptions.find(d=>d.id===id);if(d)setEditNeeds(v=>v.map((p,j)=>j===i?{...p,description_id:d.id,source_id:d.asset_id,source_start:d.start}:p))}}/><NumberInput label="源入点（秒）" value={n.source_start||0} min={0} onChange={value=>setEditNeeds(v=>v.map((p,j)=>j===i?{...p,source_start:Number(value)}:p))}/></>}{n.kind==='animation'&&<Select label="动画模板" value={n.template} data={['steps','compare','relationship','highlight','summary','data']} onChange={template=>setEditNeeds(v=>v.map((p,j)=>j===i?{...p,template:template||'steps'}:p))}/>}</Card>)}
   {editKind==='shots'&&editShots.map((s,i)=><Card key={s.id} withBorder><Text>{s.id} · {s.start.toFixed(2)}–{s.end.toFixed(2)}秒</Text><Select label="主画面素材" value={s.primary} data={run?.needs.filter(n=>n.segment_id===s.segment_id).map(n=>({value:n.id,label:n.kind+' · '+n.content}))||[]} onChange={primary=>setEditShots(v=>v.map((p,j)=>j===i?{...p,primary:primary||p.primary}:p))}/><Select label="叠加素材" clearable value={s.overlay||null} data={run?.needs.filter(n=>n.segment_id===s.segment_id&&n.id!==s.primary).map(n=>({value:n.id,label:n.kind+' · '+n.content}))||[]} onChange={overlay=>setEditShots(v=>v.map((p,j)=>j===i?{...p,overlay:overlay||''}:p))}/><NumberInput label="主素材源入点" value={s.primary_in||0} min={0} onChange={value=>setEditShots(v=>v.map((p,j)=>j===i?{...p,primary_in:Number(value)}:p))}/><NumberInput label="叠加素材源入点" value={s.overlay_in||0} min={0} onChange={value=>setEditShots(v=>v.map((p,j)=>j===i?{...p,overlay_in:Number(value)}:p))}/><TextInput label="强调词" value={s.keyword||''} onChange={e=>{const keyword=e.currentTarget.value;setEditShots(v=>v.map((p,j)=>j===i?{...p,keyword}:p))}}/><ShotRecipeEditor value={s.recipe} onChange={recipe=>setEditShots(v=>v.map((p,j)=>j===i?{...p,recipe}:p))}/><Select label="强调组件" value={s.card} data={['none','keyword','definition','steps','compare','data','summary','impact-open-title','highlighter-sweep','chapter-title-card']} onChange={card=>setEditShots(v=>v.map((p,j)=>j===i?{...p,card:card||p.card}:p))}/><Select label="布局" value={s.layout} data={['full','pip','split']} onChange={layout=>setEditShots(v=>v.map((p,j)=>j===i?{...p,layout:layout||'full'}:p))}/></Card>)}
   {editKind==='descriptions'&&editDescriptions.map((d,i)=><Textarea key={d.id} label={`${d.start.toFixed(1)}–${d.end.toFixed(1)}秒`} value={d.text} onChange={e=>{const text=e.currentTarget.value;setEditDescriptions(v=>v.map((p,j)=>j===i?{...p,text}:p))}}/>)}
   <Button loading={busy} onClick={()=>void revise(editKind==='segments'?{segments:editSegments}:editKind==='needs'?{needs:editNeeds}:editKind==='shots'?{shots:editShots}:{descriptions:editDescriptions})}>保存新版本并执行必要步骤</Button>
  </Stack></Modal>
  <Modal opened={Boolean(notice)} onClose={closeNotice} title="制作提醒" centered><Stack><Text>{notice?.message}</Text><Text size="sm" c="dimmed">此提醒不暂停后台；无需操作也会继续执行。</Text><Group><Button onClick={closeNotice}>知道了</Button><Button color="red" variant="light" onClick={()=>void stop()}>停止任务</Button></Group></Stack></Modal>
 </Stack></Container>
}
