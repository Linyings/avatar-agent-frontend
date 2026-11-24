import { authenticatedFetch } from '@/features/auth/services/authService'
import type {QualityReport} from './QualityReview'

export interface PackageInfo {
  members?:string[];stepNumber?:number|string;materialId?:string;nativeSegmentId?:string;merge?:boolean
  id: string; version: string; tool: string; title: string; node?: string
  entrypoint: string; description: string; dependencies: string[]; outputs: string[]
  ready: boolean; reason: string
}
export interface MotionStyle {
  id:string; name:string; published:boolean; legacy:boolean; poster?:string
  preview?:string; ratios?:string[]; card_preview?:string; card_poster?:string
  archived?:boolean;description?:string;preview_kind?:string;original_post?:string;preview_page?:string
}
export interface StudioInput {
  speech_mode?:string;voice_reference?:string
  revision: number; title: string; topic: string; script: string; direction: string
  ratio: string; style: string; use_avatar: boolean; photo?: string
  use_animation?: boolean
  assets: StudioAsset[]
  reference_links?: string[]
}
export interface StudioAsset { id: string; name: string; kind: string; duration: number; excluded?:boolean }
export interface Segment { id: string; chapter: string; text: string; audio?: string; native_video?:string; native_prompt?:string; start: number; duration: number }
export interface Shot { id: string; segment_id: string; start: number; end: number; primary: string; layout: string; keyword: string; intent?: string }
export interface Artifact { id: string; name: string; media_type: string }
export interface MaterialNeed {id:string;kind:string;content:string;prompt?:string;segment_id?:string;duration?:number;angle?:string;source_id?:string;source_start?:number}
export interface MaterialDraft {base_run_id:string;need_hash:string;prompt:string;version:string}
export interface MaterialStep {id:string;status:string;seconds:number;started_at?:string;error?:string;attempt?:number;cost_status?:string;production_phase?:string;generation_prompt?:string;prompt_input?:unknown;retry?:{last_error:string;strategy:string;automatic_retries:number;exhausted?:boolean};attempts?:{number:number;status:string;error?:string}[]}
export interface StudioRun {
	audio_quality?:QualityReport;quality_review?:QualityReport
  edits?:{material_only?:string};reused_from?:string
  version?:string
  requirements?:{goal:string;audience:string;key_points:string[];constraints:string[];assumptions:string[]}
  references?:{id:string;kind:string;name:string;status:string;summary:string;limitations?:string}[]
  director?:{summary:string;timing:string;scenes:{id:string;purpose:string;composition:string;visual:string;motion:string;transition:string;sound:string;estimated_duration:number;start:number;end:number;narration:string;avatar_position?:string;avatar_shape?:string}[]}
  id: string; status: string; stage: string; input: StudioInput; script: string
  target_node?:string;updated_at?:string;created_at?:string;completed_at?:string
  script_confirmed?:boolean
	final_confirmed?:string
  confirmation?: string; confirmation_version?: string; pause_requested: boolean
  segments: Segment[]; shots: Shot[]; needs: MaterialNeed[]
  materials: {need_id:string;kind:string;duration:number}[]
  artifacts: Artifact[]; duration: number; error?: string; error_step_id?: string
  steps: MaterialStep[]
}
export interface AgentActivity {status:string;phase:string;tool?:string;detail?:string;turn_id:string;started_at:string;updated_at:string}
export interface PackageProposal {
  id:string; revision:number; package:string; lines:string[]; applied:boolean; createdAt?:string
}
export interface StudioState {
  material_drafts?:Record<string,MaterialDraft>
  testing_mode?:boolean
  audio_timing?:{total:number;completed:number;seconds:number;longest_seconds:number;resume_available?:boolean;issue?:{code:string;message:string}}
  project:{id:string;name:string;input:StudioInput};run:StudioRun|null
  proposal:PackageProposal|null;packages:PackageInfo[]
  styles:MotionStyle[]
  agent_configured:boolean
  workflow_plan?:{nodes:string[];material_plan_pending:boolean;stages?:{node:string;title:string;members:string[]}[]}
  agent_activity?:AgentActivity|null
}

export function requestID():string { return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}` }
export async function studioRequest<T>(path:string, init?:RequestInit):Promise<T> {
  const res=await authenticatedFetch(path,init)
  const body=await res.json().catch(()=>({}))
  if(!res.ok){
    const message=[body?.message,body?.error?.message,body?.error].find(value=>typeof value==='string'&&value.trim())
    throw new Error(message??`请求失败（${res.status}）`)
  }
  return body.data ?? body
}
const json=(body:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
export const materialAction=(project:string,need:string,body:{action:'save'|'improve'|'generate';base_run_id:string;version:string;prompt:string;instruction?:string;request_id?:string})=>
 studioRequest<{draft?:MaterialDraft;run_id?:string;status:string}>(`/api/v1/agent/project/${encodeURIComponent(project)}/materials/${encodeURIComponent(need)}`,json(body))
export async function getStudio(id:string):Promise<StudioState>{
  const state=await studioRequest<StudioState>(`/api/v1/agent/project/${encodeURIComponent(id)}`)
  // Go emits null for invalidated downstream slices in an edited run.
  state.project.input.assets??=[]
  if(state.run){
    state.run.input.assets??=[]
    state.run.steps??=[];state.run.segments??=[];state.run.needs??=[]
    state.run.materials??=[];state.run.shots??=[];state.run.artifacts??=[]
  }
  return state
}
export const getPackages=()=>studioRequest<{packages:PackageInfo[]}>('/api/v1/agent/packages')
export const invokePackage=(projectId:string,id:string,input:Record<string,unknown>={},requestId=requestID())=>
  studioRequest<Record<string,unknown>>(`/api/v1/agent/packages/${encodeURIComponent(id)}/invoke`,json({projectId,input,requestId}))
export const getStyleCatalog=()=>studioRequest<{styles:MotionStyle[]}>('/api/v1/avatar-mvp/catalog')
const fusionDirection='沿用人物参考图，由 AI 生成口播视频；制作所选风格的动效特效，按内容将动效与口播人物分层融合，逐帧渲染最终成片。保留人物身份与视频原声，避免动效遮挡人物面部和字幕。'
// Speech is generated by the video model itself, so a new project never carries
// TTS voice or speed settings.
export const createStudio=(topic:string,ratio='9:16',style='',referenceLinks:string[]=[])=>
  studioRequest<{id:string}>('/api/v1/avatar-mvp/projects',json({title:topic.slice(0,40)||'未命名项目',topic,ratio,style,direction:fusionDirection,use_avatar:true,use_animation:true,speech_mode:'native-video',reference_links:referenceLinks}))
export async function uploadStudioFile(id:string,file:File,kind='photo'){
  const body=new FormData();body.set('file',file);body.set('kind',kind)
  return studioRequest(`/api/v1/avatar-mvp/projects/${id}/assets`,{method:'POST',body})
}
export async function approveGate(run:StudioRun){
 if(run.status!=='awaiting_confirmation'||!['script','audio','shots','final'].includes(run.confirmation??''))throw new Error('当前没有待确认内容，请查看最新制作状态。')
 if(!run.confirmation_version)throw new Error('确认版本不可用，请刷新后重新查看内容。')
 return studioRequest(`/api/v1/avatar-mvp/runs/${run.id}/confirm`,json({kind:run.confirmation,version:run.confirmation_version}))
}
export const saveScriptReview=(run:StudioRun,segments:Pick<Segment,'id'|'chapter'|'text'>[])=>
 studioRequest<StudioRun>(`/api/v1/avatar-mvp/runs/${encodeURIComponent(run.id)}/script-review`,json({version:run.confirmation_version,segments}))
export const applyPackageProposal=(projectId:string,p:PackageProposal)=>studioRequest('/api/v1/agent/confirm',json({projectId,accept:true,proposalId:p.id,revision:p.revision}))
export const assetURL=(id:string,asset:string)=>`/api/v1/avatar-mvp/projects/${id}/assets/${asset}`
export const artifactURL=(run:string,artifact:string)=>`/api/v1/avatar-mvp/runs/${run}/artifacts/${artifact}`
// Artifact IDs are defined by the media pipeline, independently of display names.
export function nodeArtifacts(artifacts:Artifact[],node:'F11'|'F11.1'|'F11.2'|'F12'){
  return artifacts.filter(a=>node!=='F11'?a.id==='video'||a.id==='cover':a.id==='preview'||a.id.startsWith('preview-'))
}
export async function mediaBlob(url:string,signal?:AbortSignal){
  const res=await authenticatedFetch(url,{signal});if(!res.ok)throw new Error(`媒体加载失败（${res.status}）`)
  return URL.createObjectURL(await res.blob())
}
export async function downloadArtifact(run:string,artifact:Artifact){
  const url=await mediaBlob(artifactURL(run,artifact.id));const a=document.createElement('a')
  a.href=url;a.download=artifact.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export const stateLabel=(status?:string)=>({
  pending:'待开始',draft:'草稿',running:'制作中',processing:'制作中',succeeded:'已完成',completed:'已完成',done:'已完成',
  failed:'失败',error:'失败',awaiting_confirmation:'待确认',paused:'已暂停',stopping:'正在停止',stopped:'已停止',interrupted:'已中断',
  submission_unknown:'请求未确认',archived:'已归档',skipped:'无需执行',
}[status??'']??status??'待开始')

export const nativeVideoWorkflow=(state:StudioState)=>(state.run?.input??state.project?.input)?.speech_mode==='native-video'

// Presentation only: keep saved execution IDs and model orders unchanged.
// Retain the familiar stage numbers when the former voice stage joins step 7.
export function workflowStages(state:StudioState){
  const stages=state.workflow_plan?.stages??[]
  const merge=nativeVideoWorkflow(state)&&stages.some(s=>s.node==='F10')
  return stages.flatMap((s,i)=>merge&&s.node==='F04'?[]:[{
    ...s,stepNumber:i+1,members:merge&&s.node==='F10'?[...new Set(['F04',...s.members])]:s.members,
  }])
}

const isNodeStep=(id:string,node:string)=>id===node||id.startsWith(node+'-')||id.startsWith(node+'/')
export function nativeVideoSteps(run:StudioRun,segmentId:string){
  const roots=[`F04/${segmentId}`,...run.needs.filter(n=>n.kind==='avatar'&&n.segment_id===segmentId).map(materialNodeID)]
  return run.steps.filter(s=>roots.some(root=>isNodeStep(s.id,root)))
}
export function nativeVideoArtifact(run:StudioRun,segment:Segment){
  const needs=run.needs.filter(n=>n.kind==='avatar'&&n.segment_id===segment.id)
  return run.artifacts.find(a=>a.id===`native-${segment.id}`)
    ??run.artifacts.find(a=>needs.some(n=>a.id===`material-${n.id}`))
}
export function displayMaterialNodeID(state:StudioState,need:MaterialNeed){
  return nativeVideoWorkflow(state)&&need.kind==='avatar'&&state.run?.segments.some(s=>s.id===need.segment_id)
    ?`F04/${need.segment_id}`:materialNodeID(need)
}

export function nodeStatus(state:StudioState,node:string):string{
  const nativeSegment=nativeVideoWorkflow(state)&&state.run?.segments.find(s=>node===`F04/${s.id}`)
  if(nativeSegment){
    const run=state.run!,steps=nativeVideoSteps(run,nativeSegment.id)
    if(steps.some(s=>s.status==='failed'))return run.status==='submission_unknown'?'submission_unknown':'failed'
    if(steps.some(s=>s.status==='running'))return ['running','stopping'].includes(run.status)?run.status:run.status==='awaiting_confirmation'?'pending':run.status
    if(nativeSegment.native_video&&steps.some(s=>s.id===node&&s.status==='succeeded'))return 'done'
    return 'pending'
  }
  const material=state.run?.needs?.find(n=>materialNodeID(n)===node)
  if(material){
    const run=state.run!,steps=run.steps.filter(s=>s.id===node||s.id.startsWith(node+'-')||s.id.startsWith(node+'/'))
    if(steps.some(s=>s.status==='failed'))return run.status==='submission_unknown'?'submission_unknown':'failed'
    if(steps.some(s=>s.status==='running'))return ['running','stopping'].includes(run.status)?run.status:run.status==='awaiting_confirmation'?'pending':run.status
    return steps.some(s=>s.id===node&&s.status==='succeeded')&&run.materials.some(m=>m.need_id===material.id)?'done':'pending'
  }
  if(node==='F10'&&state.workflow_plan?.stages?.length&&state.run&&(state.run.needs.length||(nativeVideoWorkflow(state)&&state.run.segments.length))){
    const run=state.run,raw={...state,workflow_plan:{...state.workflow_plan,stages:undefined}}
    if(nativeVideoWorkflow(state)&&run.stage==='F04'&&['running','stopping','failed','submission_unknown','interrupted','paused','stopped'].includes(run.status))return run.status
    const assembly=(nativeVideoWorkflow(state)?['F05','F09','F10']:['F09','F10']).map(n=>nodeStatus(raw,n))
    const statuses=[...run.needs.map(n=>nodeStatus(state,materialNodeID(n))),...(nativeVideoWorkflow(state)?run.segments.map(s=>nodeStatus(state,`F04/${s.id}`)):[]),...assembly]
    if(statuses.some(s=>['failed','submission_unknown','interrupted'].includes(s)))return 'failed'
    if(assembly.includes('running'))return 'running'
    return statuses.every(s=>s==='done')?'done':'pending'
  }
  const group=workflowStages(state).find(s=>s.node===node)
  if(group&&group.members.length>1){
    const raw={...state,workflow_plan:{...state.workflow_plan!,stages:undefined}}
    const members=group.members.filter(id=>state.workflow_plan!.nodes.includes(id))
    const statuses=members.map(id=>nodeStatus(raw,id))
    if(state.run?.status==='awaiting_confirmation'&&group.members.includes(confirmationNode(state.run.confirmation)))return 'awaiting_confirmation'
    if(statuses.includes('failed'))return 'failed'
    if(statuses.includes('running'))return 'running'
    return statuses.length&&statuses.every(s=>s==='done'||s==='skipped')?'done':'pending'
  }
  if(node==='F01')return state.project.input.revision>0?'done':'pending'
  const run=state.run;if(!run)return 'pending'
  if(node==='F04'&&state.audio_timing?.issue&&run.status==='failed')return 'failed'
  const steps=run.steps.filter(s=>s.id===node||s.id.startsWith(node+'/'))
  if(steps.some(s=>s.status==='failed'))return 'failed'
  if(steps.some(s=>s.status==='running'))return 'running'
  // A downstream revision reuses confirmed segments without executing F03 again.
  if(node==='F03'&&run.script_confirmed&&run.segments.length)return 'done'
  if(node==='F01.4'&&run.version!=='avatar-workflow/3.0'&&!run.input.assets.some(a=>a.kind==='video'&&!a.excluded))return 'skipped'
  const materialKind=({F06:'avatar',F07:'animation',F08:'real'} as Record<string,string>)[node]
  const expected=node==='F04'?run.segments.map(s=>`${node}/${s.id}`)
    :materialKind?run.needs.filter(n=>n.kind===materialKind).map(n=>`${node}/${n.id}`):[]
  if(expected.some(id=>!steps.some(s=>s.id===id&&s.status==='succeeded')))return 'pending'
  if(materialKind&&!expected.length&&run.steps.some(s=>s.id==='F05'&&s.status==='succeeded'))return 'skipped'
  if(steps.length&&steps.every(s=>s.status==='succeeded'))return 'done'
  return 'pending'
}

export function confirmationNode(kind?:string){return ({script:'F03',audio:'F04',shots:'F11',final:'F11.2'} as Record<string,string>)[kind??'']??''}
export function materialNodeID(need:MaterialNeed){return `${({avatar:'F06',animation:'F07',real:'F08'} as Record<string,string>)[need.kind]}/${need.id}`}
export function stageNode(state:StudioState,node:string){
 if(nativeVideoWorkflow(state)&&state.workflow_plan?.stages?.some(s=>s.node==='F10')){
  const segment=state.run?.segments.find(s=>isNodeStep(node,`F04/${s.id}`))
  if(segment)return `F04/${segment.id}`
 }
 const material=state.workflow_plan?.stages?.length&&state.run?.needs.find(n=>node===materialNodeID(n)||node.startsWith(materialNodeID(n)+'-')||node.startsWith(materialNodeID(n)+'/'))
 if(material)return displayMaterialNodeID(state,material)
 const root=node.split('/')[0]
 return workflowStages(state).find(s=>s.members.includes(root))?.node??root
}
