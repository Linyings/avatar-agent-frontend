import {Notification,Portal} from '@mantine/core'
import styles from './Studio.module.css'

export default function WorkspaceNotice({message,onClose}:{message:string;onClose:()=>void}){
 if(!message)return null
 return <Portal><div className={styles.floatingNotice} data-workspace-notice>
  <Notification title="操作未完成" color="red" role="alert" onClose={onClose} closeButtonProps={{'aria-label':'关闭提示'}}>{message}</Notification>
 </div></Portal>
}
