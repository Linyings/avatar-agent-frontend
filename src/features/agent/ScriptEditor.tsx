import {useRef,useState} from 'react'
import {Alert,Button,Modal,Textarea} from '@mantine/core'
import {invokePackage,saveScriptReview,type StudioRun} from './studioService'
import styles from './Studio.module.css'

export default function ScriptEditor({projectId,run,currentRun,onSaved,onClose}:{projectId:string;run:StudioRun;currentRun:StudioRun|null;onSaved:()=>Promise<unknown>|void;onClose:()=>void}){
 const review=run.status==='awaiting_confirmation'&&run.confirmation==='script'
 const initial=run.segments.length?run.segments:[{id:'p1',chapter:'口播文案',text:run.script}]
 const [segments,setSegments]=useState(()=>initial.map(({id,chapter,text})=>({id,chapter,text})))
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const saving=useRef(false)
 const changed=segments.some((segment,index)=>segment.text!==initial[index].text)
 const conflict=currentRun?.id!==run.id||currentRun?.status!==run.status||currentRun?.confirmation_version!==run.confirmation_version||currentRun?.script!==run.script
 const active=['running','stopping','submission_unknown'].includes(currentRun?.status??'')
 const invalid=segments.some(segment=>!segment.text.trim())||segments.reduce((sum,s)=>sum+[...s.text].length,0)>10000
 async function save(){
  if(saving.current||!changed||invalid||conflict||active)return
  saving.current=true;setBusy(true);setError('')
  try{
   if(review)await saveScriptReview(run,segments)
   else if(run.segments.length)await invokePackage(projectId,'avatar.edit-script',{segments:segments.map(({id,text})=>({id,text}))})
   else await invokePackage(projectId,'avatar.edit-node',{node:'F02',changes:'手动编辑口播文案',script:segments[0].text})
   await onSaved();onClose()
  }catch(e){setError((e as Error).message)}finally{saving.current=false;setBusy(false)}
 }
 return <Modal opened onClose={()=>{if(!saving.current)onClose()}} title="编辑口播文案" size={720} centered closeOnClickOutside={false} classNames={{content:styles.scriptEditor,header:styles.scriptEditorHeader}}>
  <p className={styles.subtle}>{review?'修改段落后保存，再回到对话中确认继续制作。':'修改将生成修订方案；在对话中确认应用后，重新制作受影响的内容。'}</p>
  {conflict&&<Alert color="yellow">文案版本已更新，请保留需要的修改，关闭后重新打开最新文案。</Alert>}
  {active&&<Alert color="yellow">当前任务正在执行或等待订单核对，请暂停或处理当前任务后再保存修改。</Alert>}
  <div className={styles.scriptEditorBody}>
   {segments.map((segment,index)=><Textarea key={segment.id} className={styles.field} label={`${index+1}. ${segment.chapter||'段落'}`} aria-label={`第 ${index+1} 段文案`} value={segment.text} disabled={busy} autosize minRows={3} maxRows={9} onChange={event=>{const text=event.currentTarget.value;setSegments(old=>old.map((s,i)=>i===index?{...s,text}:s))}}/>)}
  </div>
  {invalid&&<p className={styles.approvalHint}>每段文案不能为空，总字数不能超过 10000 字。</p>}
  {error&&<Alert color="red" role="alert">{error}</Alert>}
  <div className={styles.scriptEditorActions}><Button variant="default" disabled={busy} onClick={onClose}>取消</Button><Button className={styles.primary} loading={busy} disabled={!changed||invalid||conflict||active||busy} onClick={()=>void save()}>{review?'保存文案':'提交修改方案'}</Button></div>
 </Modal>
}
