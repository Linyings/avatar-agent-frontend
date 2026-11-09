import {nodeStatus,confirmationNode,stageNode,materialNodeID,type PackageInfo,type StudioState} from './studioService'

// API plans are authoritative. The fallback keeps cached/older snapshots usable.
function plannedNodes(state:StudioState):Set<string>{
 if(state.workflow_plan)return new Set(state.workflow_plan.nodes)
 const run=state.run,input=run?.input??state.project.input
 const video=input.assets.some(a=>a.kind==='video'&&!a.excluded)
 const planned=run?.steps.some(s=>s.id==='F05'&&s.status==='succeeded')
 const has=(kind:string)=>run?.needs.some(n=>n.kind===kind)
 const active=new Set(state.packages.filter(p=>p.node).map(p=>p.node!))
 if(!video)active.delete('F01.4')
 for(const [node,needed] of [['F06',planned?has('avatar'):input.use_avatar],['F07',planned?has('animation'):input.use_animation??!input.use_avatar],['F08',planned?has('real'):video]] as const){
  if(!needed&&!run?.steps.some(s=>s.id.split('/')[0]===node&&s.status!=='skipped'))active.delete(node)
 }
 return active
}

export function workflowPackages(state:StudioState):PackageInfo[]{
 if(state.workflow_plan?.stages?.length){
  return state.workflow_plan.stages.flatMap((stage,i)=>{
   const p=state.packages.find(p=>p.node===stage.node)!
   const base={...p,id:p?.id??stage.node,node:stage.node,title:stage.title,description:p?.description??stage.title,outputs:p?.outputs??[],ready:p?.ready??true,members:stage.members,stepNumber:i+1,dependencies:i?[state.workflow_plan!.stages![i-1].node]:[]} as PackageInfo
   if(stage.node!=='F10'||!state.run?.needs.length)return [base]
   const needs=state.run.needs
   const children=needs.map((n,index):PackageInfo=>{
    const source=state.packages.find(p=>p.node===materialNodeID(n).split('/')[0])??base
    const prerequisites=n.kind==='animation'?needs.filter(other=>other.kind==='avatar'&&other.segment_id===n.segment_id).map(materialNodeID):[]
    const segment=state.run?.segments.find(s=>s.id===n.segment_id)
    return {...source,id:`material:${n.id}`,node:materialNodeID(n),materialId:n.id,members:undefined,stepNumber:`7.${index+1}`,title:`${({avatar:'人物视频',animation:'专用动效',real:'实拍素材'} as Record<string,string>)[n.kind]} · ${segment?.chapter||index+1}`,description:n.content,dependencies:prerequisites.length?prerequisites:base.dependencies,outputs:['视频','制作提示词']}
   })
   return [...children,{...base,merge:true,title:'素材汇总与镜头组装',description:'所有视频完成后统一汇总素材、配音与字幕，组装分镜并交给下一步审阅。',dependencies:children.map(p=>p.node!),members:['F09','F10']}]
  })
 }
 const active=plannedNodes(state),all=new Map(state.packages.filter(p=>p.node).map(p=>[p.node!,p]))
 function resolve(id:string,seen=new Set<string>()):string[]{
  if(seen.has(id)||!all.has(id))return []
  if(active.has(id))return [id]
  return all.get(id)!.dependencies.flatMap(dep=>resolve(dep,new Set([...seen,id])))
 }
 function dependsOn(id:string,target:string,seen=new Set<string>()):boolean{
  if(seen.has(id))return false
  return (all.get(id)?.dependencies??[]).some(dep=>dep===target||dependsOn(dep,target,new Set([...seen,id])))
 }
 return state.packages.filter(p=>p.node&&active.has(p.node)).map(p=>{
  const deps=[...new Set(p.dependencies.flatMap(dep=>resolve(dep)))].filter(id=>id!==p.node)
  return {...p,dependencies:deps.filter(dep=>!deps.some(other=>other!==dep&&dependsOn(other,dep)))}
 })
}

export interface ExecutionSummary {
 title:string;detail:string;tone:'neutral'|'running'|'waiting'|'error'|'done';running:boolean
 action?:'start'|'confirm'|'resume'|'retry'|'diagnose'|'refresh'|'proposal';node?:string
 completed:number;total:number
}
export function executionSummary(state:StudioState):ExecutionSummary{
 const run=state.run,activity=state.agent_activity,packages=workflowPackages(state)
 const failed=run&&['failed','submission_unknown','interrupted'].includes(run.status)
 // Historical snapshots stored the first error with the last executed stage.
 const errorStep=failed?(run.error_step_id||run.steps.find(s=>s.status==='failed'&&s.error===run.error)?.id):undefined
 const stage=errorStep||run?.stage
 const retry=run?.steps.find(s=>s.status==='failed'&&s.retry?.exhausted&&(s.id===stage||s.id.startsWith((stage??'')+'/')))?.retry??run?.steps.find(s=>s.id===stage)?.retry
 const rawNode=run?.status==='awaiting_confirmation'?confirmationNode(run.confirmation):stage?.split('/')[0]
 const node=rawNode?stageNode(state,run?.status==='awaiting_confirmation'?rawNode:stage??rawNode):undefined
 const step=packages.find(p=>p.node===node)
 const label=step?`${step.node} ${step.title}`:node??''
 const progress={completed:packages.filter(p=>nodeStatus(state,p.node!)==='done').length,total:packages.length,node}
 const make=(title:string,detail:string,tone:ExecutionSummary['tone'],action?:ExecutionSummary['action'],running=false):ExecutionSummary=>({title,detail,tone,action,running,...progress})
 const audioCompleted=run?.segments.filter(s=>!!s.audio&&s.duration>0).length??0
 const audioSeconds=state.audio_timing?.seconds??run?.segments.reduce((total,s)=>total+(s.audio&&Number.isFinite(s.duration)&&s.duration>0?s.duration:0),0)??0
 if(run?.status==='running'||run?.status==='stopping')return make(run.status==='stopping'?'正在停止制作':run.pause_requested?'已请求暂停，等待当前步骤结束':`正在执行 ${label}`,run.status==='stopping'?'正在保存当前状态。':node==='F04'?`已完成 ${audioCompleted} / ${run.segments.length} 段配音，已完成部分累计 ${audioSeconds.toFixed(2)} 秒。全部段落会连续生成。`:`后台任务持续执行，对话回复结束后仍会继续。${run.target_node&&run.target_node!=='F12'?`本次执行到 ${run.target_node}。`:''}`,'running',undefined,true)
 if(run?.status==='awaiting_confirmation'){
  if(run.confirmation==='shots')return make('等待你确认镜头','请在镜头审阅节点查看每一镜的有声融合预览，可单独检查人物和动效，修改满意后统一确认。','waiting','confirm')
  if(run.confirmation==='final')return make('等待你确认成片','完整播放成片，检查节奏、嘴型、字幕和声音。确认后进入成片交付。','waiting','confirm')
  if(run.confirmation==='script')return make('等待你确认文案','请在画布的文案节点查看或编辑，确认无误后点击「已确认，继续」。','waiting','confirm')
  const ready=run.segments.length>0&&audioCompleted===run.segments.length
  return make(ready?`全部 ${audioCompleted} 段配音已完成`:'配音内容尚未齐全',ready?`整片配音累计 ${audioSeconds.toFixed(2)} 秒。可先试听全部配音再确认，也可点击「直接继续制作」进入后续流程。只需对整批配音选择一次。`:`已完成 ${audioCompleted} / ${run.segments.length} 段，请刷新状态，全部完成后再继续。`,'waiting','confirm')
 }
 if(run?.status==='submission_unknown'){
  if(rawNode==='F05'&&run.error?.includes('model_invalid_json'))return make('素材规划返回格式异常',`素材规划模型已返回内容，但 JSON 不完整或格式无效。视频和动效生成尚未开始。已完成配音已保留。${state.testing_mode?'点击「重新执行并继续」可使用分批规划重试。':'请检查模型输出记录后恢复。'}`,'error',state.testing_mode?'retry':'refresh')
  if(state.testing_mode)return make(`请求异常 · ${label}`,`${run.error||'上次模型请求没有取得可继续的结果。'} 已完成内容已保留。点击「重新执行并继续」会重试失败步骤，并复用可用的已完成内容。`,'error','retry')
  return make('订单状态待核对',`${run.script_confirmed?'文案已确认。':''}${run.error||'供应商提交结果暂不明确。'} 请先核对供应商订单，当前不需要确认文案或配音。刷新只读取已记录状态，不会重新提交生成。`,'error','refresh')
 }
 if(state.proposal&&!state.proposal.applied)return make('修改方案等待确认','新方案尚未执行，核对后应用修改。','waiting','proposal')
 if(run?.status==='failed'&&state.audio_timing?.issue){
  const issue=state.audio_timing.issue
  return make('配音时长读取异常',issue.message,'error','retry')
 }
 if(run?.status==='failed'&&state.audio_timing?.resume_available)return make('时长限制已取消，可以继续制作',`已保留 ${state.audio_timing.completed} 段配音，累计 ${audioSeconds.toFixed(2)} 秒。点击「继续制作」将复用现有配音，进入配音确认流程，无需缩短文案。`,'waiting','retry')
 if(run?.status==='failed'||run?.status==='interrupted')return make(retry?.exhausted?`等待你处理 · ${label}`:run.status==='interrupted'?'制作已中断':rawNode==='F05'?'素材规划失败':`制作异常 · ${label}`,`${run.error||'当前任务未继续，请检查失败步骤后恢复运行。'}${retry?.exhausted?' 已携带错误原因自动重试 3 次，已停止。可先让 Agent 排查，再选择重试、调整或跳过步骤，或手动修改、让 AI 优化提示词。':''}${rawNode==='F05'?' 视频和动效生成尚未开始，已完成配音已保留。':''}`,'error',retry?.exhausted?'diagnose':'retry')
 if(run?.status==='paused'&&run.edits?.material_only&&run.target_node==='F08')return make('单个视频制作已暂停在汇总前','可继续微调各个视频。点击继续制作后，补齐待制作素材并统一汇总，进入镜头审阅。','waiting','resume')
 if(run?.status==='paused')return make('制作已暂停',run.pause_requested?'已按暂停请求停止后续步骤，可继续制作。':`已执行到本次指定步骤 ${run.target_node??node}，后续步骤尚未执行。`,'waiting','resume')
 if(run?.status==='stopped')return make('制作已停止','后续步骤不会继续。已完成内容已保留，可让 Agent 规划后续操作。','neutral','start')
 if(run?.status==='succeeded')return make('视频制作已完成','成片已生成，可在产物中预览或下载。','done')
 if(activity?.status==='running'){
  const tool=state.packages.find(p=>p.tool===activity.tool)?.title??activity.tool
  return make(tool?`Agent 正在调用：${tool}`:'Agent 正在处理需求','尚未提交视频制作任务；当前正在整理需求或调用工具。','running',undefined,true)
 }
 if(activity?.status==='error'||activity?.status==='needs_action')return make('制作尚未启动',activity.detail||'本轮操作未完成，可继续处理制作需求。','error','start')
 if(activity?.status==='stopped')return make('Agent 回复已停止','尚未启动制作任务，已上传素材和已保存需求仍保留。','neutral','start')
 return make('制作尚未启动','当前项目已保存。点击下方按钮，让 Agent 根据已有需求开始制作。','neutral','start')
}
