import {studioRequest} from '@/features/agent/studioService'

export type MediaKind='music'|'sfx'|'t2i'|'i2i'|'t2v'|'i2v'|'r2v'|'enhance'|'avatar'
export interface MediaCapabilities {durations?:number[];min_duration?:number;max_duration?:number;ratios?:string[];resolutions?:string[];first_frame:boolean;last_frame:boolean;references?:number;native_audio:boolean;needs_lyrics:boolean}
export interface MediaModel {id:string;name:string;kind:MediaKind;family:string;channel?:string;summary?:string;doc?:string;capabilities:MediaCapabilities}
export interface LabResult {model:string;name:string;family:string;status:string;task_id?:string;sent?:Record<string,unknown>;file?:string;media?:string;seconds:number;cost?:string;error?:string;score?:number;note?:string}
export interface LabRun {id:string;kind:MediaKind;status:string;created_at?:string;request?:{prompt?:string};results:LabResult[]}
export interface LabSummary {model:string;name:string;kind:string;runs:number;success:number;avg_score:number;avg_seconds:number;last_cost?:string}
export interface LabInput {kind:MediaKind;prompt:string;lyrics?:string;images?:string[];video?:string;audio?:string;duration?:number;ratio?:string;resolution?:string;models:string[];confirm:number}

const json=(method:string,body:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
export const getMediaModels=(kind?:MediaKind)=>studioRequest<{models:MediaModel[];defaults:Record<string,string>}>(`/api/v1/avatar-mvp/media/models${kind?`?kind=${kind}`:''}`)
export const listLabRuns=()=>studioRequest<{runs:LabRun[];summary:LabSummary[]}>('/api/v1/admin/model-lab/runs')
export const createLabRun=(input:LabInput)=>studioRequest<LabRun>('/api/v1/admin/model-lab/runs',json('POST',input))
export const getLabRun=(id:string)=>studioRequest<LabRun>(`/api/v1/admin/model-lab/runs/${encodeURIComponent(id)}`)
export const rateLabResult=(id:string,model:string,score:number,note:string)=>studioRequest(`/api/v1/admin/model-lab/runs/${encodeURIComponent(id)}/rate`,json('POST',{model,score,note}))
export const setDefaultModel=(kind:MediaKind,model:string)=>studioRequest<{defaults:Record<string,string>}>('/api/v1/admin/model-lab/defaults',json('PUT',{kind,model}))
export const labFileURL=(id:string,file:string)=>`/api/v1/admin/model-lab/runs/${encodeURIComponent(id)}/files/${encodeURIComponent(file)}`
