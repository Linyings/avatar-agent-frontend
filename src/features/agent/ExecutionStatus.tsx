import {useEffect,useState} from 'react'
import {Button,Loader} from '@mantine/core'
import {IconAlertCircle,IconCheck,IconClock} from '@tabler/icons-react'
import type {StudioState} from './studioService'
import {executionSummary} from './workflowProgress'
import {ProtectedMedia} from './StudioShell'
import styles from './Studio.module.css'

export default function ExecutionStatus({state,busy,onPrimary,onCurrent,onPause,onStop,syncError}:{state:StudioState;busy:boolean;onPrimary:()=>void;onCurrent:()=>void;onPause?:()=>void;onStop?:()=>void;syncError:string}){
 const summary=executionSummary(state),run=state.run
 const gate=summary.action==='confirm'&&run
 const gateKey=gate?`${run.id}:${run.confirmation}:${run.confirmation_version}`:''
 const [viewedKey,setViewedKey]=useState(''),[cancelledKey,setCancelledKey]=useState('')
 const cancelled=!!gate&&cancelledKey===gateKey
 const audio=run?.confirmation==='audio'
 const shots=run?.confirmation==='shots',final=run?.confirmation==='final'
 const reviewed=!!gate&&!cancelled&&audio&&viewedKey===gateKey
 const reviewReady=!!run?.confirmation_version&&(shots?!!run.shots.length&&run.shots.every(s=>run.artifacts.some(a=>a.id==='preview-'+s.id)):final?['video','cover'].every(id=>run.artifacts.some(a=>a.id===id)):!!run.segments.length&&(audio?run.segments.every(s=>!!s.audio&&s.duration>0):!!run.script.trim()&&run.segments.every(s=>!!s.text.trim())))
 const unavailable=!run?.confirmation_version?'确认版本不可用，请刷新页面后重试。':!reviewReady?'待确认内容尚未齐全，请等待内容加载完成或刷新页面。':''
 function openReview(){setViewedKey(gateKey);setCancelledKey('')}
 function toggleReview(){if(reviewed)setViewedKey('');else openReview()}
 const [now,setNow]=useState(Date.now())
 useEffect(()=>{if(!summary.running)return;setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[summary.running])
 const start=run?.steps.find(s=>s.id===run.stage&&s.status==='running')?.started_at??(run?.status==='running'?run.created_at:state.agent_activity?.started_at)
 const elapsed=start?Math.max(0,Math.floor((now-Date.parse(start))/1000)):0
 const duration=elapsed>=60?`${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`:`${elapsed} 秒`
 const action=({start:'让 Agent 开始制作',resume:'继续后续制作',diagnose:'交给 Agent 排查',retry:state.audio_timing?.resume_available?'继续制作':run?.status==='failed'?'根据报错修复并重试':state.testing_mode?'重新执行并继续':'恢复当前运行',refresh:'刷新订单状态',proposal:'查看修改方案'} as Record<string,string>)[summary.action??'']
 return <section className={styles.executionStatus} data-tone={syncError?'waiting':summary.tone} aria-label="制作状态" data-execution-status tabIndex={-1}>
  <div className={styles.executionInfo}>
   <div className={styles.executionTitle} role="status" aria-live="polite">{summary.running?<Loader size={15}/>:summary.tone==='error'?<IconAlertCircle size={17}/>:summary.tone==='done'?<IconCheck size={17}/>:<IconClock size={17}/>}<strong>{syncError?'状态同步中断':summary.title}</strong>{summary.running&&start&&<span>已运行 {duration}</span>}</div>
   <p>{syncError?`无法获取最新状态，下面保留上次结果。${syncError}`:summary.detail}</p>
   <div className={styles.executionProgress}><span>已完成 {summary.completed} / {summary.total} 个步骤</span><span>{state.workflow_plan?.material_plan_pending?'流程将随素材计划更新':'按当前制作计划执行'}</span></div>
   <div className={styles.executionTrack} aria-label="已完成步骤比例"><i style={{width:`${summary.total?summary.completed/summary.total*100:0}%`}}/></div>
  </div>
  {gate&&<div className={styles.approvalCard}>
   {(shots||final)&&<Button size="compact-xs" variant="subtle" onClick={onCurrent}>{shots?'查看全部镜头预览':'播放完整成片'}</Button>}
   {(cancelled||audio)&&<p className={styles.approvalHint}>{cancelled?'已取消本次确认，制作保持等待，不会继续。':'配音已按段落连续生成。你可以先试听确认，也可以直接继续制作，无需逐段确认。'}</p>}
   {audio&&<Button size="compact-xs" variant="subtle" disabled={busy} onClick={toggleReview} aria-expanded={reviewed}>{cancelled?'重新试听配音':reviewed?'收起配音':'查看并试听配音'}</Button>}
   {!audio&&cancelled&&<Button size="compact-xs" variant="subtle" disabled={busy} onClick={()=>setCancelledKey('')}>继续确认</Button>}
   {reviewed&&<section className={styles.approvalPreview} aria-label="待确认配音">
    {run.segments.map((segment,index)=><div key={segment.id} className={styles.approvalSegment}>
     <strong>{index+1}. {segment.chapter||segment.id}{audio?` · ${segment.duration.toFixed(1)} 秒`:''}</strong>
     <p>{segment.text}</p>
     {audio&&(segment.audio?<ProtectedMedia kind="audio" url={`/api/v1/agent/runs/${run.id}/segments/${encodeURIComponent(segment.id)}/audio`}/>:<span>这段配音尚未生成</span>)}
    </div>)}
    {!run.segments.length&&<p>内容尚未齐全，请刷新状态后查看。</p>}
   </section>}
   {!cancelled&&<div className={styles.executionActions}>
    <Button size="xs" className={styles.primary} loading={busy} disabled={busy||!!syncError||!reviewReady} onClick={onPrimary}>{shots?'全部镜头已确认，开始渲染':final?'成片已确认，交付':audio&&!reviewed?'直接继续制作':'已确认，继续'}</Button>
    <Button size="xs" variant="default" disabled={busy} onClick={()=>{setCancelledKey(gateKey);setViewedKey('')}}>取消</Button>
   </div>}
   {!cancelled&&unavailable&&<p className={styles.approvalHint} role="status">{unavailable}</p>}
  </div>}
  {!gate&&<div className={styles.executionActions}>
   {summary.node&&<Button size="compact-xs" variant="subtle" onClick={onCurrent}>查看当前步骤</Button>}
   {action&&<Button size="xs" className={styles.primary} loading={busy} disabled={!!syncError&&summary.action!=='refresh'} onClick={onPrimary}>{action}</Button>}
   {run?.status==='running'&&<><Button size="xs" variant="light" disabled={busy||!!syncError||run.pause_requested} onClick={onPause}>{run.pause_requested?'等待当前步骤结束':'暂停制作'}</Button><Button size="xs" variant="subtle" color="red" disabled={busy||!!syncError} onClick={onStop}>停止制作</Button></>}
  </div>}
 </section>
}
