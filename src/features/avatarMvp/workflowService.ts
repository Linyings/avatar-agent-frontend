import {authenticatedFetch} from '@/features/auth/services/authService'
export type SourceAsset={id:string;name:string;kind:string;duration:number;excluded:boolean}
export type WorkflowInput={revision:number;title:string;topic:string;script:string;direction:string;style:string;voice:string;ratio:string;use_avatar:boolean;angles:string[];photo?:string;assets:SourceAsset[];subtitle_color?:string;subtitle_scale?:number;subtitle_edits?:Record<string,string>;avatar_position?:string}
export type WorkflowSegment={id:string;chapter:string;text:string;audio?:string;duration:number;start:number}
export type WorkflowArtifact={id:string;name:string;media_type:string}
export type WorkflowRun={id:string;project_id:string;version:string;status:string;stage:string;input:WorkflowInput;script:string;segments:WorkflowSegment[];duration:number;confirmation?:string;confirmation_version?:string;stop_requested:boolean;error?:string;error_type?:string;created_at:string;updated_at:string;steps:{id:string;status:string;seconds:number;started_at?:string;completed_at?:string;attempt:number;provider_task_id?:string;error?:string;error_type?:string;cost_status:string;usage?:Record<string,unknown>}[];events:{id:string;node:string;type:string;message:string;read:boolean}[];needs:{id:string;segment_id:string;kind:string;duration:number;content:string;angle?:string;template?:string;query?:string;prompt?:string;source_id?:string;source_start?:number;description_id?:string}[];artifacts:WorkflowArtifact[];descriptions:{id:string;asset_id:string;start:number;end:number;text:string;coverage:string}[];shots:{id:string;segment_id:string;start:number;end:number;primary:string;overlay?:string;layout:string;card:string;keyword:string;recipe?:string;items?:string[];intent?:string;semantic?:string[];primary_in:number;overlay_in:number}[];operations?:{step:string;scope:string;seconds:number;cost_status:string;usage?:Record<string,unknown>}[]}
export type WorkflowProject={id:string;input:WorkflowInput;runs:{id:string;status:string;created_at:string}[]}
export type WorkflowEdits={base_run_id:string;segments?:WorkflowSegment[];needs?:WorkflowRun['needs'];shots?:WorkflowRun['shots'];descriptions?:WorkflowRun['descriptions'];regenerate_segments?:string[]}
export type WorkflowStyle={id:string;name:string;version:string;published:boolean;legacy?:boolean;source?:string;signature?:string;description?:string;ratios?:string[];reference?:string;prompt?:string;source_download?:string;preview_kind?:string;preview_width?:number;preview_height?:number;production_mode?:string}
export type WorkflowCatalog={version:string;styles:WorkflowStyle[];voices:{id:string;name:string;model:string;sample?:string}[];ratios:string[];video_understanding:boolean;video_provider:string;video_model:string;default_voice:string}
const root=`${import.meta.env.VITE_API_BASE_URL||''}/api/v1/avatar-mvp`
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const res=await authenticatedFetch(root+path,init)
 if(!res.ok){const b=await res.json().catch(()=>({}));throw Object.assign(new Error(b.message||`请求失败（${res.status}）`),{status:res.status})}
 return res.json()
}
const json=(data:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
const normalizeInput=(input:WorkflowInput):WorkflowInput=>({...input,assets:input?.assets||[],angles:input?.angles||[]})
async function runRequest(path:string,init:RequestInit={}):Promise<WorkflowRun>{
 const run=await request<WorkflowRun>(path,init)
 return {...run,input:normalizeInput(run.input),segments:run.segments||[],steps:run.steps||[],events:run.events||[],needs:run.needs||[],artifacts:run.artifacts||[],descriptions:run.descriptions||[],shots:run.shots||[]}
}
async function projectRequest(path:string,init:RequestInit={}):Promise<WorkflowProject>{
 const project=await request<WorkflowProject>(path,init)
 return {...project,input:normalizeInput(project.input),runs:project.runs||[]}
}
export const workflowService={
 catalog:(signal?:AbortSignal)=>request<WorkflowCatalog>('/catalog',{signal}),
 create:(input:WorkflowInput)=>projectRequest('/projects',json(input)),
 project:(id:string,signal?:AbortSignal)=>projectRequest(`/projects/${encodeURIComponent(id)}`,{signal}),
 save:(id:string,input:WorkflowInput)=>projectRequest(`/projects/${encodeURIComponent(id)}`,{...json(input),method:'PATCH'}),
 upload:(id:string,file:File,kind:string)=>{const body=new FormData();body.set('file',file);body.set('kind',kind);return request<SourceAsset>(`/projects/${encodeURIComponent(id)}/assets`,{method:'POST',body})},
 start:(id:string,revision:number,requestId:string,edits?:WorkflowEdits)=>runRequest(`/projects/${encodeURIComponent(id)}/runs`,json({revision,request_id:requestId,edits})),
 run:(id:string,signal?:AbortSignal)=>runRequest(`/runs/${encodeURIComponent(id)}`,{signal}),
 confirm:(id:string,kind:string,version:string,segments?:WorkflowSegment[])=>runRequest(`/runs/${encodeURIComponent(id)}/confirm`,json({kind,version,segments})),
 retry:(id:string)=>runRequest(`/runs/${encodeURIComponent(id)}/retry`,{method:'POST'}),
 stop:(id:string)=>runRequest(`/runs/${encodeURIComponent(id)}/stop`,{method:'POST'}),
 read:(id:string,event:string)=>request(`/runs/${encodeURIComponent(id)}/events/${encodeURIComponent(event)}/read`,{method:'POST'}),
 async artifact(id:string,artifact:string,signal?:AbortSignal):Promise<Blob>{const res=await authenticatedFetch(root+`/runs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifact)}`,{signal});if(!res.ok)throw new Error('产物下载失败');return res.blob()},
 async style(id:string,signal?:AbortSignal):Promise<Blob>{const res=await authenticatedFetch(root+`/catalog/${encodeURIComponent(id)}/preview`,{signal});if(!res.ok)throw new Error('风格预览暂不可用');return res.blob()},
 async stylePoster(id:string,signal?:AbortSignal):Promise<Blob>{const res=await authenticatedFetch(root+`/catalog/${encodeURIComponent(id)}/poster`,{signal});if(!res.ok)throw new Error('静帧暂不可用');return res.blob()},
 async styleResource(id:string,kind:'reference'|'prompt'|'source',signal?:AbortSignal):Promise<Blob>{const res=await authenticatedFetch(root+`/catalog/${encodeURIComponent(id)}/${kind}`,{signal});if(!res.ok)throw new Error('风格资源暂不可用');return res.blob()},
 async voice(id:string,signal?:AbortSignal):Promise<Blob>{const res=await authenticatedFetch(root+`/catalog/voices/${encodeURIComponent(id)}/sample`,{signal});if(!res.ok)throw new Error('试听尚未准备');return res.blob()},
 async asset(project:string,id:string,signal?:AbortSignal):Promise<Blob>{const res=await authenticatedFetch(root+`/projects/${encodeURIComponent(project)}/assets/${encodeURIComponent(id)}`,{signal});if(!res.ok)throw new Error('素材预览暂不可用');return res.blob()},
}
