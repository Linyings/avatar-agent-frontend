import {useEffect,useRef,useState,type ReactNode} from 'react'
import {ActionIcon,Button,FileButton,Menu,Modal,Textarea,UnstyledButton} from '@mantine/core'
import {IconCheck,IconFile,IconLink,IconMusic,IconPlus,IconUpload,IconX,IconMovie} from '@tabler/icons-react'
import styles from './Studio.module.css'

export interface HomeFile {id:string;file:File;uploaded:boolean;kind?:string;error?:boolean}
export const isTextFile=(file:File)=>/\.(txt|md|markdown)$/i.test(file.name)&&(!file.type||file.type.startsWith('text/')||file.type==='application/octet-stream')
export const isVideoFile=(file:File)=>file.type.startsWith('video/')||((!file.type||file.type==='application/octet-stream')&&/\.(mp4|mov|webm|mkv|avi|m4v|flv|wmv|mpg|mpeg|3gp)$/i.test(file.name))
export const isAudioFile=(file:File)=>file.type.startsWith('audio/')||((!file.type||file.type==='application/octet-stream')&&/\.(mp3|wav|m4a|aac|flac|ogg|opus|wma|amr)$/i.test(file.name))
// Any still image; the server converts formats other than PNG/JPEG to JPEG.
export const isSupportedImage=(file:File)=>(file.type.startsWith('image/')&&file.type!=='image/svg+xml')||((!file.type||file.type==='application/octet-stream')&&/\.(png|jpe?g|webp|heic|heif|bmp|gif|tiff?|avif)$/i.test(file.name))
export type UploadKind='photo'|'image'|'video'|'audio'|'text'|'file'
// Everything else is kept as an attachment rather than rejected.
export const uploadKindOf=(file:File,portrait=false):UploadKind=>isTextFile(file)?'text':isVideoFile(file)?'video':isAudioFile(file)?'audio':isSupportedImage(file)?(portrait?'photo':'image'):'file'
export const fileLabel=(file:File)=>({text:'参考文案',video:'参考视频',audio:'音频',photo:'图片',image:'图片',file:'附件'})[uploadKindOf(file)]
export const fileIdentity=(file:File)=>JSON.stringify([file.name,file.size,file.type,file.lastModified])

function parseLinks(value:string,existing:string[]){
 const next=[...existing]
 for(const line of value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)){
  let url:URL
  try{url=new URL(line)}catch{throw new Error('请输入完整的 http:// 或 https:// 网页链接')}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||line.length>2048)throw new Error('请输入完整的 http:// 或 https:// 网页链接')
  if(!next.includes(url.href))next.push(url.href)
 }
 if(next.length>20)throw new Error('最多添加 20 个网页链接')
 return next
}

function FilePreview({file}:{file:File}){
 const [url,setURL]=useState('')
 useEffect(()=>{const url=URL.createObjectURL(file);setURL(url);return()=>URL.revokeObjectURL(url)},[file])
 const kind=uploadKindOf(file)
 if(kind==='video')return <><video src={url||undefined} preload="metadata" muted playsInline/><IconMovie className={styles.videoMark} size={21}/></>
 if(kind==='image')return <img src={url||undefined} alt={file.name}/>
 const Icon=kind==='audio'?IconMusic:IconFile
 return <span className={styles.filePreviewLabel}><Icon size={22}/>{kind==='text'?'参考文案':kind==='audio'?'音频':(file.name.split('.').pop()||'附件').toUpperCase().slice(0,6)}</span>
}

interface Props {
 files:HomeFile[];links:string[];primaryId?:string;uploadingId:string|null
 busy:boolean;locked:boolean;avatar:boolean;opened:boolean
 onOpened:(value:boolean)=>void;onFiles:(files:File[])=>void;onLinks:(links:string[])=>void
 onRemove:(id:string)=>void;onPrimary:(id:string)=>void;children:ReactNode
}

export default function HomeAttachments({files,links,primaryId,uploadingId,busy,locked,avatar,opened,onOpened,onFiles,onLinks,onRemove,onPrimary,children}:Props){
 const [dragging,setDragging]=useState(false)
 const [linkOpen,setLinkOpen]=useState(false);const [linkText,setLinkText]=useState('');const [linkError,setLinkError]=useState('')
 const imageReset=useRef<()=>void>(null)
 const addLinks=()=>{try{onLinks(parseLinks(linkText,links));setLinkOpen(false);setLinkText('');setLinkError('')}catch(e){setLinkError((e as Error).message)}}
 const count=files.length+links.length
 return <>
  <div className={styles.composerMain}>
   <div onDragOver={e=>{e.preventDefault();if(!busy)setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!busy)onFiles(Array.from(e.dataTransfer.files))}}>
    <Menu opened={opened} onChange={onOpened} keepMounted withinPortal={false} width={230} position="bottom-start">
     <Menu.Target><UnstyledButton className={styles.attachmentDrop} data-dragging={dragging} aria-label="添加参考素材" disabled={busy}>
      <span className={styles.attachmentPlus}>{dragging?<IconUpload size={18}/>:<IconPlus size={18}/>}</span>
      <strong>{dragging?'松开即可添加素材':'添加图片 / 视频 / 音频 / 文件'}</strong>
      <span>点击选择，或拖入多个文件</span>
      <small>任意格式 · 单个文件 ≤256MB</small>
     </UnstyledButton></Menu.Target>
     <Menu.Dropdown className={styles.attachmentMenu}>
      <FileButton multiple resetRef={imageReset} onChange={files=>{onFiles(files);imageReset.current?.()}}>{props=><Menu.Item {...props} disabled={busy} leftSection={<IconUpload size={16}/>}>上传文件（图片 / 视频 / 音频 / 文档）</Menu.Item>}</FileButton>
      <Menu.Divider/>
      <Menu.Item leftSection={<IconLink size={16}/>} disabled={busy||locked} onClick={()=>{setLinkOpen(true);setLinkError('')}}>添加网页链接</Menu.Item>
      <Menu.Label>不限格式 · 支持多选<br/>图片自动转换；无法识别的文件作为附件保存</Menu.Label>
     </Menu.Dropdown>
    </Menu>
   </div>
   <div className={styles.composerMessage}>{children}</div>
  </div>
  {count>0&&<section className={styles.attachmentSection} aria-label="已添加的参考素材">
   <div className={styles.attachmentHeading}><span>参考素材 <b>{count}</b></span><span>{avatar&&files.some(f=>isSupportedImage(f.file))?'可选择一张主人物图片，其余图片作为参考':'发送后保存到新项目'}</span></div>
   <div className={styles.attachmentTray}>
    {files.map(item=><div className={styles.attachmentCard} key={item.id} data-primary={avatar&&item.id===primaryId}>
     <div className={styles.attachmentPreview}><FilePreview file={item.file}/>
      <ActionIcon className={styles.attachmentRemove} size={20} radius="xl" aria-label={'移除'+item.file.name} disabled={busy||item.uploaded} onClick={()=>onRemove(item.id)}><IconX size={12}/></ActionIcon>
      {avatar&&isSupportedImage(item.file)&&<UnstyledButton className={styles.portraitChoice} data-selected={item.id===primaryId} disabled={busy||locked} aria-label={'设为主人物'+item.file.name} onClick={()=>onPrimary(item.id)}>{item.id===primaryId?<><IconCheck size={10}/>主人物</>:'设为主人物'}</UnstyledButton>}
     </div>
     <div className={styles.attachmentName} title={item.file.name}>{item.file.name}</div>
     <div className={styles.attachmentStatus} data-error={item.error} role="status">{item.uploaded?'已上传':uploadingId===item.id?'上传中…':item.error?'上传失败，可重试':`${fileLabel(item.file)} · ${(item.file.size/1024/1024).toFixed(1)} MB`}</div>
    </div>)}
    {links.map(link=><div className={styles.attachmentCard} key={link}>
     <div className={`${styles.attachmentPreview} ${styles.linkPreview}`}><IconLink size={25}/><span>{new URL(link).hostname}</span><ActionIcon className={styles.attachmentRemove} size={20} radius="xl" aria-label={'移除'+link} disabled={busy||locked} onClick={()=>onLinks(links.filter(value=>value!==link))}><IconX size={12}/></ActionIcon></div>
     <div className={styles.attachmentName} title={link}>{link}</div><div className={styles.attachmentStatus}>网页参考</div>
    </div>)}
   </div>
  </section>}
  <Modal opened={linkOpen} onClose={()=>setLinkOpen(false)} title="添加网页链接" centered classNames={{content:styles.linkModal,header:styles.linkModal}}>
   <Textarea label="网页链接" description="每行一个链接，可一次添加多个" placeholder={'https://example.com/reference\nhttps://example.com/article'} value={linkText} onChange={e=>{setLinkText(e.currentTarget.value);setLinkError('')}} minRows={4} autosize maxRows={8} error={linkError||undefined} className={styles.field}/>
   <div className={styles.actionRow}><Button variant="default" onClick={()=>setLinkOpen(false)}>取消</Button><Button className={styles.primary} disabled={!linkText.trim()} onClick={addLinks}>添加链接</Button></div>
  </Modal>
 </>
}
