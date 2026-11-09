import {useEffect,useState} from 'react'
import type {StudioState} from './studioService'

export interface ChatLine {id:string;role:'user'|'assistant';content:string;createdAt?:string}
type ChatItem={kind:'message';id:string;message:ChatLine}|{kind:'notice';id:string}

export function useChatTimeline(state:StudioState|null,messages:ChatLine[],loading:boolean):ChatItem[]{
 const run=state?.run,proposal=state?.proposal&&!state.proposal.applied?state.proposal:null
 const activity=!run?state?.agent_activity:null
 const key=state?JSON.stringify([state.project.id,run?.id,run?.status,run?.stage,run?.confirmation_version,run?.pause_requested,proposal?.id,activity?.turn_id,activity?.status,activity?.phase]):''
 const timestamp=proposal?.createdAt??(run?.status==='succeeded'?run.completed_at:undefined)??run?.updated_at??activity?.updated_at
 const [anchor,setAnchor]=useState<{key:string;after:string|null}|null>(null)
 useEffect(()=>{
  if(loading||!key)return
  setAnchor(old=>{
   // Polling and new replies update the existing item without moving it.
   if(old?.key===key)return old
   const time=timestamp?Date.parse(timestamp):NaN
   const index=Number.isFinite(time)?messages.findIndex(m=>!!m.createdAt&&Date.parse(m.createdAt)>time):-1
   return {key,after:(index<0?messages.at(-1):messages[index-1])?.id??null}
  })
 },[key,timestamp,messages,loading])
 const items:ChatItem[]=messages.map(message=>({kind:'message',id:message.id,message}))
 if(!loading&&anchor?.key===key&&key){
  const index=anchor.after===null?0:messages.findIndex(m=>m.id===anchor.after)+1
  items.splice(index,0,{kind:'notice',id:`notice-${key}`})
 }
 return items
}
