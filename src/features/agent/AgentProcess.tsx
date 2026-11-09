import {useEffect,useRef} from 'react'
import {Loader} from '@mantine/core'
import {IconCheck,IconChevronRight,IconX} from '@tabler/icons-react'
import type {ToolEvent} from './agentService'
import type {PackageInfo} from './studioService'
import styles from './Studio.module.css'

const labels:Record<string,string>={plan_project:'规划制作流程',get_project_state:'检查项目',get_project:'检查项目',read_skill:'读取制作技能'}

export default function AgentProcess({events,busy,packages}:{events:ToolEvent[];busy:boolean;packages:PackageInfo[]}){
 const ref=useRef<HTMLDetailsElement>(null)
 const current=[...events].reverse().find(event=>event.status==='running')
 const running=busy||!!current,failed=events.filter(event=>event.status==='error').length
 const label=(tool:string)=>packages.find(item=>item.tool===tool)?.title??labels[tool]??tool
 useEffect(()=>{if(!running&&ref.current)ref.current.open=false},[running])
 if(!events.length&&!busy)return null
 const summary=running?(current?`正在${label(current.tool)}…`:'正在思考…'):`执行过程 · ${events.length} 项${failed?` · ${failed} 项未完成`:''}`
 return <details ref={ref} className={styles.agentProcess} aria-label="Agent 执行过程" data-agent-process>
  <summary className={styles.processSummary}>
   {running?<Loader size={11}/>:<IconChevronRight size={12} className={styles.processChevron}/>}
   <span>{summary}</span>
  </summary>
  <div className={styles.processDetails}>
   {events.length?<ol>{events.map(event=><li key={event.callId} data-status={event.status}>
    {event.status==='running'?<Loader size={10}/>:event.status==='done'?<IconCheck size={11}/>:<IconX size={11}/>}
    <span>{label(event.tool)} · {event.status==='running'?'执行中':event.status==='done'?'完成':'未完成'}{event.detail?`：${event.detail}`:''}</span>
   </li>)}</ol>:<span>正在整理需求…</span>}
  </div>
 </details>
}
