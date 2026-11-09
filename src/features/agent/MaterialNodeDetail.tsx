import {useEffect,useRef,useState} from 'react'
import {ActionIcon,Alert,Button,Textarea,TextInput} from '@mantine/core'
import {IconX} from '@tabler/icons-react'
import {artifactURL,materialAction,materialNodeID,nodeStatus,requestID,stateLabel,type MaterialDraft,type StudioState} from './studioService'
import {ProtectedMedia} from './StudioShell'
import styles from './Studio.module.css'

export default function MaterialNodeDetail({state,needId,onRefresh,onClose,onAssist,agentBusy=false}:{state:StudioState;needId:string;onRefresh:()=>Promise<unknown>|unknown;onClose:()=>void;onAssist?:(mode:'diagnose'|'adjust')=>void;agentBusy?:boolean}){
 const run=state.run!,need=run.needs.find(n=>n.id===needId)!,stored=state.material_drafts?.[needId]
 const [draft,setDraft]=useState<MaterialDraft|undefined>(stored)
 const [prompt,setPrompt]=useState(stored?.prompt??need.prompt??'')
 const [instruction,setInstruction]=useState('');const [busy,setBusy]=useState('');const lock=useRef(false)
 const [message,setMessage]=useState('');const [error,setError]=useState('')
 const [conflict,setConflict]=useState(false)
 const pending=useRef<{key:string;id:string}|undefined>(undefined)
 const node=materialNodeID(need),status=nodeStatus(state,node)
 const active=['running','stopping','submission_unknown'].includes(run.status)
 const segment=run.segments.find(s=>s.id===need.segment_id)
 const steps=run.steps.filter(s=>s.id===node||s.id.startsWith(node+'-')||s.id.startsWith(node+'/'))
 const failed=steps.some(s=>s.status==='failed'),exhausted=steps.some(s=>s.status==='failed'&&s.retry?.exhausted)
 const material=run.materials.find(m=>m.need_id===needId)
 const artifact=run.artifacts.find(a=>a.id===`material-${needId}`)
 const phaseLabel=(id:string)=>id===node?'视频制作与组装':id===node+'/plan'?'场景方案':id.startsWith(node+'/scene-')?'场景 '+id.slice((node+'/scene-').length)+' 绘图代码':'人物片段 '+id.slice(node.length+1)
 const real=need.kind==='real'
 const dirty=prompt!==(draft?.prompt??need.prompt??'')
 const seenVersion=useRef(stored?.version)
 useEffect(()=>{
  if(stored?.version===seenVersion.current)return
  seenVersion.current=stored?.version
  if(stored?.version===draft?.version)return
  if(dirty){setConflict(true);return}
  setDraft(stored);setPrompt(stored?.prompt??need.prompt??'');setConflict(false)
 },[stored,draft?.version,dirty,need.prompt])
 async function act(action:'save'|'improve'|'generate'){
  if(lock.current)return;lock.current=true;setBusy(action);setError('');setMessage('')
  const key=JSON.stringify([run.id,needId,prompt])
  if(!pending.current||pending.current.key!==key)pending.current={key,id:requestID()}
  try{
   const out=await materialAction(state.project.id,needId,{action,base_run_id:run.id,version:draft?.version??'',prompt,instruction,...(action==='generate'?{request_id:pending.current.id}:{})})
   if(out.draft){setDraft(out.draft);setPrompt(out.draft.prompt)}
   if(action==='generate'){pending.current=undefined;setMessage('已提交此视频的制作。完成后可在汇总节点继续。')}
   else setMessage(action==='save'?'提示词已保存，视频尚未重新生成。':'AI 已改写并保存草稿，检查后可重新生成此视频。')
   await onRefresh()
  }catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy('')}
 }
 return <>
  <div className={styles.inspectorTitle}><div><span className={styles.badge}>第 7 步 · {stateLabel(status)}</span><h2 style={{marginTop:12}}>{({avatar:'人物视频',animation:'专用动效',real:'实拍素材'} as Record<string,string>)[need.kind]} · {segment?.chapter||needId}</h2></div><ActionIcon aria-label="返回画布" variant="subtle" onClick={onClose}><IconX size={17}/></ActionIcon></div>
  <div className={styles.panel}><h3>制作内容</h3><p>{need.content}</p>{segment&&<><p>{segment.start.toFixed(1)}–{(segment.start+segment.duration).toFixed(1)} 秒 · {segment.text}</p>{segment.audio&&<ProtectedMedia kind="audio" url={`/api/v1/agent/runs/${run.id}/segments/${segment.id}/audio`}/>}</>}
   {need.kind==='animation'&&<p>组装顺序：本段台词与配音 → 人物画面参考（如有）→ 场景方案 → 逐场景绘图代码 → 统一组装与视频渲染 → 素材汇总。</p>}
   {need.kind==='avatar'&&<p>组装顺序：参考照片与配音 → 人物视频生成 → 段落拼接 → 素材汇总。</p>}
  </div>
  <div className={styles.panel}><h3>{material?'当前视频效果':'视频效果'}</h3>{artifact?<div className={styles.mediaPreview}><ProtectedMedia kind="video" url={artifactURL(run.id,artifact.id)} alt={need.content}/></div>:<p>{status==='running'?'正在制作，完成后自动显示可播放的视频。':'此节点的视频尚未就绪。'}</p>}
   {!!steps.length&&<ol className={styles.productionSteps}>{steps.map(s=><li key={s.id}><span>{phaseLabel(s.id)}</span><strong>{s.production_phase&&s.status==='running'?s.production_phase:stateLabel(s.status)}{s.cost_status==='reused'?' · 复用已有结果':''}</strong>{s.seconds>0&&<small>累计 {s.seconds.toFixed(1)} 秒{(s.attempt??0)>0?` · 第 ${s.attempt} 次`:''}</small>}{s.error&&<p role="status">{s.error}</p>}{s.retry&&s.status!=='succeeded'&&<><p>自动重试 {s.retry.automatic_retries}/3{s.retry.exhausted?' · 已停止自动重试':''}</p><p>修复方式：{s.retry.strategy}</p></>}{s.attempts?.some(a=>a.error)&&<details><summary>查看重试错误记录</summary>{s.attempts.filter(a=>a.error).map(a=><p key={a.number}>第 {a.number} 次：{a.error}</p>)}</details>}</li>)}</ol>}
   {failed&&!active&&<Alert mt="md" color="orange" title={exhausted?'自动重试已用完，等待你处理':'当前视频制作失败'}><p>{exhausted?'每次自动重试均已携带当次错误，三次仍未通过，等待你选择处理方式。':'可以先排查具体原因，再决定如何继续。'}可让 Agent 排查、调整或跳过步骤，也可在下方手动修改提示词或让 AI 优化。跳过前会检查素材覆盖和依赖。</p>{onAssist&&<div className={styles.actionRow}><Button size="xs" disabled={!!busy||agentBusy} onClick={()=>onAssist('diagnose')}>交给 Agent 排查</Button><Button size="xs" variant="light" disabled={!!busy||agentBusy} onClick={()=>onAssist('adjust')}>调整或跳过此步骤</Button></div>}</Alert>}
  </div>
  <div className={styles.panel}><h3>当前视频使用的提示词</h3><p style={{whiteSpace:'pre-wrap'}}>{need.prompt||'未设置额外提示词，按当前台词、导演稿及固定生成规则制作。'}</p>
   {steps.some(s=>s.generation_prompt)?<details><summary>查看实际提交的完整提示词</summary>{steps.filter(s=>s.generation_prompt).map(s=><div key={s.id}><p>{phaseLabel(s.id)}</p><pre className={styles.promptRecord}>{s.generation_prompt}</pre>{s.prompt_input!=null&&<pre className={styles.promptRecord}>{JSON.stringify(s.prompt_input,null,2)}</pre>}</div>)}</details>:<p>历史视频未记录完整提交文本时，仅展示已保存的制作提示词。</p>}
  </div>
  {real?<Alert color="blue">此节点从已上传视频选取素材，没有 AI 生成提示词。源素材：{need.source_id}，起点 {need.source_start??0} 秒。</Alert>:<>
   <Textarea className={styles.field} label="提示词草稿" description="保存和 AI 改写仅更新草稿；点击重新生成后才制作新视频。" value={prompt} onChange={e=>setPrompt(e.currentTarget.value)} minRows={6} maxRows={18} autosize maxLength={12000} disabled={!!busy}/>
   <TextInput className={styles.field} mt="md" label="给 AI 的修改要求（可选）" placeholder="例如：动作更克制，图形逐句展开" value={instruction} onChange={e=>setInstruction(e.currentTarget.value)} maxLength={2000} disabled={!!busy}/>
   {conflict&&<Alert mt="md" color="yellow">此节点有更新的草稿，当前输入已保留。<Button variant="subtle" size="xs" onClick={()=>{setDraft(stored);setPrompt(stored?.prompt??need.prompt??'');setConflict(false)}}>加载已保存草稿</Button></Alert>}
   <div className={styles.actionRow}><Button size="xs" className={styles.ghost} loading={busy==='save'} disabled={!!busy||conflict} onClick={()=>void act('save')}>保存提示词</Button><Button size="xs" className={styles.ghost} loading={busy==='improve'} disabled={!!busy||conflict} onClick={()=>void act('improve')}>让 AI 改写提示词</Button><Button size="xs" className={styles.primary} loading={busy==='generate'} disabled={!!busy||active||conflict} onClick={()=>void act('generate')}>重新生成此视频</Button></div>
   {active&&<p className={styles.subtle}>可先编辑并保存草稿；等待当前制作结束或暂停后再重新生成。</p>}
   <p className={styles.subtle}>重新生成会创建新版本并调用生成服务。完成后可微调其他节点，再统一汇总。</p>
  </>}
  {message&&<Alert mt="md" color="teal" role="status">{message}</Alert>}{error&&<Alert mt="md" color="red" role="alert">{error}</Alert>}
 </>
}

