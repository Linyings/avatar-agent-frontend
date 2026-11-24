import {ActionIcon} from '@mantine/core'
import {IconX} from '@tabler/icons-react'
import {artifactURL,nativeVideoArtifact,nativeVideoSteps,nodeStatus,stateLabel,type StudioState} from './studioService'
import {ProtectedMedia} from './StudioShell'
import styles from './Studio.module.css'

// Generation starts before material planning creates an editable material need.
// This view only reads that existing job and its original video artifact.
export default function NativeVideoDetail({state,segmentId,onClose}:{state:StudioState;segmentId:string;onClose:()=>void}){
 const run=state.run!,segment=run.segments.find(s=>s.id===segmentId)!
 const node=`F04/${segmentId}`,status=nodeStatus(state,node)
 const artifact=nativeVideoArtifact(run,segment),steps=nativeVideoSteps(run,segmentId)
 return <>
  <div className={styles.inspectorTitle}><div><span className={styles.badge}>第 7 步 · {stateLabel(status)}</span><h2 style={{marginTop:12}}>{run.input.use_avatar?'数字人视频':'原声视频'}（含原声） · {segment.chapter||segment.id}</h2></div><ActionIcon aria-label="返回画布" variant="subtle" onClick={onClose}><IconX size={17}/></ActionIcon></div>
  <div className={styles.panel}><h3>口播文案</h3><p>{segment.text}</p><p>Seedance 同时生成画面和声音，字幕与动效按这段视频的实际时间制作。</p></div>
  <div className={styles.panel}><h3>原声视频</h3>{artifact?<div className={styles.mediaPreview}><ProtectedMedia kind="video" url={artifactURL(run.id,artifact.id)} alt={`${segment.chapter||segment.id} · 原声视频`}/></div>:<p>{status==='running'?'正在生成人物画面和声音，完成后会自动显示视频。':'本段原声视频尚未就绪。'}</p>}
   {segment.native_video&&<p>实际时长 {segment.duration.toFixed(1)} 秒，播放时包含视频原声。</p>}
   {!!steps.length&&<ol className={styles.productionSteps}>{steps.map(s=><li key={s.id}><span>{s.id===node?'视频整理与字幕对齐':'Seedance 生成画面和声音'}</span><strong>{s.status==='running'&&s.production_phase?s.production_phase:stateLabel(s.status)}</strong>{s.error&&<p role="status">{s.error}</p>}</li>)}</ol>}
  </div>
  {steps.some(s=>s.generation_prompt)&&<div className={styles.panel}><details><summary>查看实际提交的完整提示词</summary>{steps.filter(s=>s.generation_prompt).map(s=><pre key={s.id} className={styles.promptRecord}>{s.generation_prompt}</pre>)}</details></div>}
  <p className={styles.subtle}>素材规划完成后，可在此节点修改人物提示词。查看视频不会重新提交生成任务。</p>
 </>
}
