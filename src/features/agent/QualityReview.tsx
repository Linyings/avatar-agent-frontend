import {useState} from 'react'
import {Alert,Select} from '@mantine/core'
import {ProtectedMedia} from './StudioShell'
import {artifactURL} from './studioService'
import styles from './Studio.module.css'

export interface QualityReport {
 status:string;human_review?:string
 issues:{code:string;message:string;time:number;shot_id?:string;segment_id?:string;artifact_id?:string}[]
 shots?:{shot_id:string;status?:string;frames:{artifact_id:string;time:number}[]}[]
 limitations?:string[]
}
export default function QualityReview({runId,report,reviewed=false}:{runId:string;report:QualityReport;reviewed?:boolean}){
 const [selected,setSelected]=useState<string|null>(null)
 const current=report.shots?.find(s=>s.shot_id===(selected??report.issues.find(i=>i.shot_id)?.shot_id))??report.shots?.[0]
 return <div className={styles.panel}>
  <h3>制作质量检查</h3>
  <Alert color={report.issues.length?'yellow':'blue'}>{reviewed?'此版本已确认审阅，以下保留生成时的自动检查记录。':'已完成可用的自动检查，尚未完成人工审阅。生成完成不代表画面质量已通过。'}</Alert>
  {report.issues.map((issue,i)=><p key={`${issue.code}-${i}`}><strong>{issue.time.toFixed(2)}s{issue.shot_id?` · ${issue.shot_id}`:issue.segment_id?` · ${issue.segment_id}`:''}</strong>：{issue.message}</p>)}
  {!report.issues.length&&<p>自动检查暂未发现异常，请继续检查人物、字幕、数字画面和衔接。</p>}
  {!!report.shots?.length&&<><Select label="逐镜检查帧" data={report.shots.map(s=>({value:s.shot_id,label:s.shot_id+(s.status==='needs_review'?' · 有待检查问题':'')}))} value={current?.shot_id??null} onChange={setSelected}/><div className={styles.mediaGrid}>{current?.frames.map(frame=><div key={frame.artifact_id}><p>{frame.time.toFixed(2)}s</p><ProtectedMedia kind="image" url={artifactURL(runId,frame.artifact_id)} alt={`${current.shot_id} ${frame.time.toFixed(2)}秒检查帧`}/></div>)}</div></>}
  {!!report.limitations?.length&&<p className={styles.subtle}>{report.limitations.join('；')}</p>}
 </div>
}
