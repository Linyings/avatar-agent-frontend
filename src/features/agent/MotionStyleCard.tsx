import {useEffect,useRef,useState,type RefObject} from 'react'
import {UnstyledButton} from '@mantine/core'
import {IconCheck} from '@tabler/icons-react'
import {mediaBlob,type MotionStyle} from './studioService'
import styles from './MotionStylePicker.module.css'

function useCardAsset(url:string|undefined,enabled:boolean,attempt:number){
 const [src,setSrc]=useState(''),[error,setError]=useState(false)
 useEffect(()=>{
  setSrc('');setError(false)
  if(!url||!enabled)return
  const controller=new AbortController();let objectURL=''
  mediaBlob(url,controller.signal).then(value=>{
   if(controller.signal.aborted){URL.revokeObjectURL(value);return}
   objectURL=value;setSrc(value)
  }).catch(()=>{if(!controller.signal.aborted)setError(true)})
  return()=>{controller.abort();if(objectURL)URL.revokeObjectURL(objectURL)}
 },[url,enabled,attempt])
 return {src,error}
}

export default function MotionStyleCard({style,selected,playing,root,onSelect}:{style:MotionStyle;selected:boolean;playing:boolean;root:RefObject<HTMLDivElement|null>;onSelect:()=>void}){
 const ref=useRef<HTMLButtonElement>(null),video=useRef<HTMLVideoElement>(null)
 const [visible,setVisible]=useState(false),[attempt,setAttempt]=useState(0),[decodeError,setDecodeError]=useState(false)
 useEffect(()=>{
  if(!ref.current)return
  if(!globalThis.IntersectionObserver){setVisible(true);return}
  const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.1)),{root:root.current,threshold:[0,.1]})
  observer.observe(ref.current);return()=>observer.disconnect()
 },[root])
 const poster=useCardAsset(style.card_poster,visible,attempt)
 const demo=useCardAsset(style.card_preview,visible&&playing,attempt)
 useEffect(()=>{setDecodeError(false)},[demo.src])
 useEffect(()=>{
  const element=video.current
  return()=>{if(element){element.pause();element.removeAttribute('src');element.load()}}
 },[demo.src,decodeError])
 const failed=demo.error||decodeError
 return <UnstyledButton ref={ref} className={styles.card} aria-label={`预览${style.name}`} aria-pressed={selected} onClick={()=>{
  onSelect()
  if(failed){setDecodeError(false);setAttempt(v=>v+1)}
  else if(video.current?.paused)void video.current.play().catch(()=>{})
 }}>
  <div className={styles.poster}>
   {poster.src&&<img src={poster.src} alt={`${style.name}风格示例`}/>}
   {demo.src&&!decodeError&&<video ref={video} src={demo.src} poster={poster.src||undefined} aria-label={`${style.name}效果演示`} autoPlay muted loop playsInline preload="none" onError={()=>setDecodeError(true)}/>}
   {failed&&<span className={styles.mediaHint}>演示加载失败，点击重试</span>}
   {!style.card_preview&&<span className={styles.mediaHint}>{style.card_poster?'参考封面':'预览暂不可用'}</span>}
  </div>
  <div className={styles.cardLabel}><span>{style.name}</span>{selected&&<IconCheck size={15}/>}</div>
 </UnstyledButton>
}
