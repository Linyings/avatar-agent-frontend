import {useEffect,useRef,useState} from 'react'
import {Alert,AspectRatio,Badge,Button,Card,Group,Modal,SimpleGrid,Stack,Text} from '@mantine/core'
import {workflowService,type WorkflowStyle} from './workflowService'

function StyleCard({style:s,selected,disabled,onSelect}:{style:WorkflowStyle;selected:boolean;disabled:boolean;onSelect:()=>void}){
 const [url,setUrl]=useState('');const [poster,setPoster]=useState('');const [error,setError]=useState('');const [open,setOpen]=useState(false)
 const [reference,setReference]=useState('');const [prompt,setPrompt]=useState('');const [busy,setBusy]=useState(false)
 const card=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(false)
 const ref=useRef<HTMLVideoElement>(null);const objects=useRef<string[]>([])
 useEffect(()=>{if(!globalThis.IntersectionObserver){setVisible(true);return}const obs=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{rootMargin:'100px'});if(card.current)obs.observe(card.current);return()=>obs.disconnect()},[s.id])
 useEffect(()=>{const ctrl=new AbortController();const urls:string[]=[];if(s.published&&(visible||open)){
  void workflowService.style(s.id,ctrl.signal).then(b=>{if(!ctrl.signal.aborted){const u=URL.createObjectURL(b);urls.push(u);setUrl(u)}}).catch(()=>{if(!ctrl.signal.aborted)setError('预览加载失败，可刷新重试')})
 }else setUrl('');return()=>{ctrl.abort();urls.forEach(u=>URL.revokeObjectURL(u))}},[s.id,s.published,visible,open])
 useEffect(()=>{const ctrl=new AbortController();let object='';if(s.published)void workflowService.stylePoster(s.id,ctrl.signal).then(b=>{if(!ctrl.signal.aborted){object=URL.createObjectURL(b);setPoster(object)}}).catch(()=>{});return()=>{ctrl.abort();if(object)URL.revokeObjectURL(object)}},[s.id,s.published])
 useEffect(()=>()=>{objects.current.forEach(u=>URL.revokeObjectURL(u))},[])
 useEffect(()=>{const v=ref.current;if(!v||!globalThis.IntersectionObserver)return;const obs=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)void v.play().catch(()=>{});else v.pause()});obs.observe(v);return()=>obs.disconnect()},[url])
 async function resource(kind:'reference'|'prompt'|'source'){
  setBusy(true);setError('');try{const b=await workflowService.styleResource(s.id,kind)
   if(kind==='prompt'){setPrompt(await b.text())}else{const u=URL.createObjectURL(b);objects.current.push(u);if(kind==='reference')setReference(u);else{const a=document.createElement('a');a.href=u;a.download=`${s.id}-source.zip`;a.click()}}
  }catch(e){setError(e instanceof Error?e.message:'加载失败')}finally{setBusy(false)}
 }
 return <Card ref={card} withBorder padding="sm" style={{borderColor:selected?'var(--mantine-color-blue-6)':undefined,borderWidth:selected?2:1}}><Stack gap="xs">
  <Group justify="space-between"><Text fw={700} size="sm">{s.name}</Text>{selected&&<Badge size="xs">已选择</Badge>}</Group>
  <AspectRatio ratio={s.preview_width&&s.preview_height?s.preview_width/s.preview_height:s.legacy?9/16:16/9} mah={s.legacy||(s.preview_height||0)>(s.preview_width||0)?240:undefined}>{url?<video ref={ref} aria-label={`${s.name}原版演示`} src={url} poster={poster} muted loop playsInline preload="metadata" onError={()=>setError('预览加载失败')} style={{width:'100%'}}/>:poster?<img src={poster} alt={s.name}/>:<Text size="xs">{s.published?'预览加载中':'准备中'}</Text>}</AspectRatio>
  {s.preview_kind==='upstream-original'&&<Badge variant="light" size="xs">原版演示</Badge>}
  {s.production_mode==='original-video'&&<Badge variant="light" color="orange" size="xs">原片素材复用</Badge>}
  <Text size="xs" c="dimmed">{s.description||s.signature}</Text>
  <Group gap="xs"><Button size="compact-xs" disabled={disabled||!s.published} variant={selected?'filled':'light'} onClick={onSelect}>选择{s.name}</Button><Button size="compact-xs" variant="subtle" disabled={!s.published} onClick={()=>{setVisible(true);setOpen(true)}}>案例与源码</Button></Group>
  <Modal opened={open} onClose={()=>setOpen(false)} title={s.name} size="xl">
   <Stack><Text fw={700}>原版模板演示</Text><video src={url} poster={poster} controls playsInline style={{width:'100%',maxHeight:440}}/>
    <Text size="sm">{s.description} 演示视频和效果图直接来自 mg-styles-15；本次成片按配音时长使用所选模板，不重新绘制简化图解。原案例的固定图形与文字并非针对任意主题自动生成。</Text>
    <Text size="xs" c="dimmed">来源：mg-styles-15 / {s.source}；版本：{s.version}；比例：{s.ratios?.join('、')||'9:16、16:9、1:1'}。跨比例完整保留原构图并留边；源码渲染中缺失的字体使用开放字体或 Noto 替代，原版预览保持不变。</Text>
    {!s.legacy&&<><Group><Button variant="light" loading={busy} onClick={()=>void resource('reference')}>查看参考原片</Button><Button variant="light" loading={busy} onClick={()=>void resource('prompt')}>查看原提示词</Button><Button variant="light" loading={busy} onClick={()=>void resource('source')}>下载源码与制作包</Button></Group>
     {reference&&<><Text fw={700}>参考原片（用于对照，不是本次项目产物）</Text><video src={reference} controls playsInline style={{width:'100%',maxHeight:440}}/></>}
     {prompt&&<details open><summary>原始制作提示词</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12,maxHeight:360,overflow:'auto'}}>{prompt}</pre></details>}
    </>}
    {error&&<Alert color="red">{error}</Alert>}
   </Stack>
  </Modal>
  {error&&!open&&<Text size="xs" c="red">{error}</Text>}
 </Stack></Card>
}
export default function StyleGallery({styles,value,disabled,onChange}:{styles:WorkflowStyle[];value:string;disabled:boolean;onChange:(id:string)=>void}){
 const native=styles.filter(s=>!s.legacy);const legacy=styles.filter(s=>s.legacy)
 return <Stack gap="sm"><SimpleGrid cols={{base:1,sm:2}}>{native.map(s=><StyleCard key={s.id} style={s} selected={value===s.id} disabled={disabled} onSelect={()=>onChange(s.id)}/>)}</SimpleGrid>
 {legacy.length>0&&<details><summary>旧版简化样式（历史任务兼容）</summary><SimpleGrid cols={2} mt="sm">{legacy.map(s=><StyleCard key={s.id} style={s} selected={value===s.id} disabled={disabled} onSelect={()=>onChange(s.id)}/>)}</SimpleGrid></details>}
 </Stack>
}
