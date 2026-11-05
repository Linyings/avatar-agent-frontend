import {useSearchParams} from 'react-router-dom'
import AvatarLegacyPage from './AvatarLegacyPage'
import AvatarWorkflowPage from './AvatarWorkflowPage'
export default function AvatarMvpPage({projectId}:{projectId?:string}){
 const [search]=useSearchParams()
 return search.has('task_id')||search.get('legacy')==='1'?<AvatarLegacyPage projectId={projectId}/>:<AvatarWorkflowPage projectId={projectId}/>
}
