import type {Edge,Viewport,XYPosition} from '@xyflow/react'
import {artifactURL,assetURL,nodeArtifacts,nodeStatus,confirmationNode,type PackageInfo,type StudioState} from './studioService'

export const NODE_WIDTH=320
export const NODE_HEIGHT=350
export const MIN_ZOOM=.12
export const MAX_ZOOM=2
export type CanvasPositions=Record<string,XYPosition>
export interface CanvasMedia {kind:'image'|'video'|'audio';url:string;name:string}
export interface CanvasPresentation {
 prompt?:string
 status:string;text:string;items:string[];media:CanvasMedia[];progress:{completed:number;total:number}
}

export function canvasEdges(packages:PackageInfo[]):Edge[]{
 const ids=new Set(packages.map(p=>p.node).filter(Boolean))
 return packages.flatMap(p=>p.node?[...new Set(p.dependencies)].filter(id=>ids.has(id)&&id!==p.node).map(source=>({
  id:`${source}->${p.node}`,source,target:p.node!,type:'smoothstep',deletable:false,selectable:false,
 })):[])
}

export async function layoutWorkflow(packages:PackageInfo[]):Promise<CanvasPositions>{
 const {default:ELK}=await import('elkjs/lib/elk.bundled.js')
 const graph=await new ELK().layout({
  id:'workflow',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.spacing.nodeNode':'60','elk.layered.spacing.nodeNodeBetweenLayers':'100','elk.padding':'[top=40,left=40,bottom=40,right=40]'},
  children:packages.filter(p=>p.node).map(p=>({id:p.node!,width:NODE_WIDTH,height:NODE_HEIGHT})),
  edges:canvasEdges(packages).map(e=>({id:e.id,sources:[e.source],targets:[e.target]})),
 })
 return Object.fromEntries((graph.children??[]).map(n=>[n.id,{x:n.x??0,y:n.y??0}]))
}

export function canvasPresentation(state:StudioState,p:PackageInfo):CanvasPresentation{
 const node=p.node!,run=state.run,input=run?.input??state.project.input
 let status=nodeStatus(state,node)
 if(run?.status==='awaiting_confirmation'&&node===confirmationNode(run.confirmation))status='awaiting_confirmation'
 else if(run?.stage.split('/')[0]===node&&['failed','submission_unknown','interrupted','stopped','stopping'].includes(run.status))status=run.status
 else if(status==='running'&&run&&run.status!=='running')status=run.status
 const materialKind:Record<string,string>={F06:'avatar',F07:'animation',F08:'real'}
 const needs=run?.needs.filter(n=>n.kind===materialKind[node])??[]
 const roots=node==='F01.4'?(state.workflow_plan?.stages?.length?['F01.4']:input.assets.filter(a=>a.kind==='video'&&!a.excluded).map(a=>`F01.4/${a.id}`)):node==='F04'?run?.segments.map(s=>`${node}/${s.id}`)??[]
  :materialKind[node]?needs.map(n=>`${node}/${n.id}`):[node]
 const completed=node==='F01'?(input.revision>0?1:0):node==='F03'&&run?.script_confirmed&&run.segments.length?1:roots.filter(id=>run?.steps.some(s=>s.id===id&&s.status==='succeeded')).length
 const result:CanvasPresentation={status,text:p.description,items:[],media:[],progress:{completed,total:roots.length}}
 const artifacts=(predicate:(id:string)=>boolean)=>run?.artifacts.filter(a=>predicate(a.id)).flatMap(a=>{
  const kind=a.media_type.startsWith('video/')?'video':a.media_type.startsWith('audio/')?'audio':a.media_type.startsWith('image/')?'image':null
  return kind?[{kind,url:artifactURL(run.id,a.id),name:a.name} as CanvasMedia]:[]
 })??[]
 if(p.materialId&&run){
  const need=run.needs.find(n=>n.id===p.materialId)!
  const segment=run.segments.find(s=>s.id===need.segment_id)
  const steps=run.steps.filter(s=>s.id===node||s.id.startsWith(node+'-')||s.id.startsWith(node+'/'))
  result.text=need.content;result.prompt=need.prompt||'未设置额外提示词，使用已保存的台词和导演稿。'
  result.media=artifacts(id=>id===`material-${need.id}`)
  result.items=[...steps.filter(s=>s.id===node&&s.production_phase).map(s=>s.production_phase!),...(segment?[`${segment.start.toFixed(1)}–${(segment.start+segment.duration).toFixed(1)} 秒 · ${segment.text}`]:[]),...steps.filter(s=>s.error).map(s=>s.error!)]
  result.progress={completed:result.status==='done'?1:0,total:1}
  return result
 }
 if(p.merge&&run){
  const done=run.needs.filter(n=>run.materials.some(m=>m.need_id===n.id)&&run.steps.some(s=>s.id.endsWith('/'+n.id)&&s.status==='succeeded')).length
  result.text=`${done} / ${run.needs.length} 个视频就绪。所有节点的素材统一汇总后，交给下一步镜头审阅。`
  result.items=run.needs.map(n=>`${run.materials.some(m=>m.need_id===n.id)?'已就绪':'待制作'} · ${n.content}`)
  result.progress={completed:done,total:run.needs.length}
  const batches=run.steps.filter(s=>/^F10\/batch-\d+$/.test(s.id))
  if(batches.length){
   const completed=batches.filter(s=>s.status==='succeeded').length
   const current=batches.find(s=>s.id===run.stage)??batches.find(s=>s.status==='running'||s.status==='failed')
   result.text=`${done} / ${run.needs.length} 个视频就绪，镜头分段组装 ${completed} / ${batches.length}。${current?.production_phase??'分段结果已保存，正在统一汇总。'}`
   const labels:Record<string,string>={succeeded:'已完成',running:'制作中',failed:'失败',pending:'待开始',interrupted:'已中断'}
   result.items=batches.map(s=>`${labels[s.status]??s.status} · ${s.production_phase??s.id}${s.error?' · '+s.error:''}`)
   result.progress={completed,total:batches.length}
  }
  return result
 }
 if(node==='F01'||node==='F01.4'){
  result.text=node==='F01'?input.topic||'描述主题，添加人物照片或参考素材':p.description
  result.media=input.assets.filter(a=>!a.excluded&&a.kind!=='text'&&(node==='F01'||a.kind==='video')).map(a=>({kind:a.kind==='video'?'video':'image',url:assetURL(state.project.id,a.id),name:a.name}))
  if(node==='F01')result.items=input.assets.filter(a=>!a.excluded&&a.kind==='text').map(a=>`参考文案：${a.name}`)
 }else if(node==='F02')result.text=run?.script||input.script||'文案生成后将在这里展示，可滚动阅读完整内容。'
 else if(node==='F03'){
  result.text=run?.segments.length?`${run.segments.length} 个内容段落`:p.description
  result.items=run?.segments.map(s=>`${s.chapter||s.id}：${s.text}`)??[]
 }else if(node==='F04'){
  result.text=run?.segments.length?`${run.segments.length} 段配音 · ${(run.duration||0).toFixed(1)} 秒`:p.description
  result.media=run?.segments.filter(s=>s.audio).map(s=>({kind:'audio',url:`/api/v1/agent/runs/${run.id}/segments/${encodeURIComponent(s.id)}/audio`,name:`${s.chapter||s.id} · ${s.duration.toFixed(1)} 秒`}))??[]
 }else if(node==='F05'){
  result.items=run?.needs.map(n=>n.content)??[]
 }else if(materialKind[node]){
  const ids=new Set(needs.map(n=>`material-${n.id}`))
  result.media=artifacts(id=>ids.has(id));result.items=needs.map(n=>n.content)
 }else if(node==='F09'){
  result.text=run?.materials.length?`${run.materials.length} 份素材已接入`:p.description
  result.media=artifacts(id=>id.startsWith('material-'))
 }else if(node==='F10')result.items=run?.shots.map(s=>`${s.start.toFixed(1)}–${s.end.toFixed(1)}s · ${s.keyword||s.intent||s.id}`)??[]
 else if(node==='F11'||node==='F11.1'||node==='F11.2'||node==='F12'){
  const ids=new Set(nodeArtifacts(run?.artifacts??[],node).map(a=>a.id))
  result.media=artifacts(id=>ids.has(id))
 }
 if(state.workflow_plan?.stages?.length){
  if(node==='F01.2'){
   result.text=run?.requirements?.goal??'分析主题、受众、目标和制作约束。'
   result.items=run?.requirements?[`受众：${run.requirements.audience}`,...(run.requirements.key_points??[]),...(run.requirements.constraints??[])]:[]
  }
  if(node==='F01.4'){
   const count=input.assets.filter(a=>!a.excluded).length+(input.reference_links?.length??0)+(input.script?1:0)
   result.text=run?.references?.length?`${run.references.length} 份参考资料`:count?`待分析 ${count} 份参考资料`:'没有参考素材时自动跳过。'
   result.items=run?.references?.map(r=>`${r.name}：${r.summary}${r.limitations?'（'+r.limitations+'）':''}`)??[]
   result.media=[]
  }
  if(node==='F01.6'){
   result.text=run?.director?.summary??'在写文案前设计全片分镜、画面、动效及融合方式。'
   result.items=run?.director?.scenes.map(s=>`${s.purpose} · ${s.visual} · 动效：${s.motion}${run.director?.timing==='measured'?` · ${s.start.toFixed(1)}–${s.end.toFixed(1)} 秒`:''}`)??[]
  }
  if(node==='F10'){
   result.text='按导演稿制作人物、专用动效并适配融合构图。'
   result.media=artifacts(id=>id.startsWith('material-'))
  }
  if(p.members&&p.members.length>1){const raw={...state,workflow_plan:{...state.workflow_plan!,stages:undefined}};const members=p.members.filter(id=>state.workflow_plan!.nodes.includes(id));result.progress={total:members.length,completed:members.filter(id=>['done','skipped'].includes(nodeStatus(raw,id))).length}}
 }
 return result
}

export function canvasStorageKey(user:string,project:string){return `studio-canvas:v1:${encodeURIComponent(user)}:${encodeURIComponent(project)}`}
const coordinate=(v:unknown):v is XYPosition=>!!v&&typeof v==='object'&&['x','y'].every(k=>typeof (v as Record<string,unknown>)[k]==='number'&&Number.isFinite((v as Record<string,unknown>)[k])&&Math.abs((v as Record<string,number>)[k])<1e7)
export function loadCanvasLayout(key:string):{positions:CanvasPositions;viewport?:Viewport}|null{
 try{
  const data=JSON.parse(localStorage.getItem(key)??'null')
  if(data?.version!==1||!data.positions||typeof data.positions!=='object')return null
  const positions=Object.fromEntries(Object.entries(data.positions).filter(([,value])=>coordinate(value))) as CanvasPositions
  const v=data.viewport
  const zoom=data.viewport?.zoom
  return {positions,...(coordinate(v)&&typeof zoom==='number'&&zoom>=MIN_ZOOM&&zoom<=MAX_ZOOM?{viewport:{x:v.x,y:v.y,zoom}}:{})}
 }catch{return null}
}
export function saveCanvasLayout(key:string,positions:CanvasPositions,viewport:Viewport):boolean{
 try{localStorage.setItem(key,JSON.stringify({version:1,positions,viewport}));return true}catch{return false}
}
