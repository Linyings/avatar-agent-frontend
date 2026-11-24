import {memo,useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {ActionIcon,Button,Loader,Select,Tooltip,UnstyledButton} from '@mantine/core'
import {IconArrowsMaximize,IconFocus2,IconLayoutDistributeHorizontal,IconMaximize,IconMinimize,IconGripVertical,IconArrowUpRight} from '@tabler/icons-react'
import {applyNodeChanges,Background,BackgroundVariant,Controls,Handle,MarkerType,MiniMap,Panel,Position,ReactFlow,ReactFlowProvider,useReactFlow,useViewport,type Node,type NodeProps,type NodeChange} from '@xyflow/react'
import {useAuth} from '@/features/auth'
import {ProtectedMedia} from './StudioShell'
import {stateLabel,stageNode,type PackageInfo,type StudioState} from './studioService'
import {workflowPackages} from './workflowProgress'
import {canvasEdges,canvasPresentation,canvasStorageKey,layoutWorkflow,loadCanvasLayout,saveCanvasLayout,NODE_HEIGHT,NODE_WIDTH,MIN_ZOOM,MAX_ZOOM,type CanvasMedia,type CanvasPresentation,type CanvasPositions} from './workflowCanvas'
import '@xyflow/react/dist/style.css'
import styles from './WorkflowCanvas.module.css'

type WorkflowNode=Node<{package:PackageInfo;content:CanvasPresentation;open:(id:string)=>void;editScript?:()=>void},'workflow'>

// A long workflow can hold many media files. Fetch each protected preview only
// after it enters the visible viewport (including the node's own scroll area).
function NodeMedia({media}:{media:CanvasMedia}){
 const root=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(false)
 const {zoom}=useViewport();const readable=zoom>=.45
 useEffect(()=>{
  if(!root.current||!readable||visible)return
  if(typeof IntersectionObserver==='undefined'){setVisible(true);return}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}})
  observer.observe(root.current);return()=>observer.disconnect()
 },[readable,visible])
 return <div ref={root} className={styles.media} data-kind={media.kind} aria-label={media.name}>
  <div className={styles.caption}>{media.name}</div>
  <div className={styles.preview}>{visible?<ProtectedMedia kind={media.kind} url={media.url} alt={media.name}/>:<span>放大节点后加载预览</span>}</div>
 </div>
}

const WorkflowCard=memo(function WorkflowCard({data,selected}:NodeProps<WorkflowNode>){
 const {package:p,content:c,open,editScript}=data
 const percent=c.progress.total?Math.round(c.progress.completed/c.progress.total*100):0
 return <article className={styles.node} data-status={c.status} data-selected={selected} data-testid={`workflow-node-${p.node}`}>
  {c.status==='running'&&<div className={styles.runningBadge}><span aria-hidden="true">▶</span>正在执行</div>}
  {p.dependencies.length>0&&<Handle type="target" position={Position.Left} isConnectable={false} className={styles.handle}/>}
  <header className={`${styles.nodeHeader} workflow-node-drag`}><IconGripVertical size={15}/><span className={styles.nodeNumber}>{p.stepNumber??p.node}</span><strong>{p.title}</strong><span className={styles.statusDot}/></header>
  <div className={`${styles.nodeContent} nodrag nopan nowheel`} tabIndex={0} aria-label={`${p.title}内容`}>
   {editScript&&p.node==='F02'?<UnstyledButton className={`${styles.copy} ${styles.editableCopy}`} onClick={editScript} aria-label="编辑口播文案">{c.text}<span className={styles.editHint}>点击编辑文案</span></UnstyledButton>:<p className={styles.copy}>{c.text}</p>}
   {c.media.map(m=><NodeMedia key={m.url} media={m}/>)}
   {c.prompt&&<div className={styles.prompt}><strong>制作提示词</strong><p>{c.prompt}</p><UnstyledButton onClick={()=>open(p.id)}>编辑提示词 / 重新生成</UnstyledButton></div>}
   {c.items.length>0&&<ol className={styles.items}>{c.items.map((item,i)=><li key={i}>{editScript&&p.node==='F03'?<UnstyledButton className={styles.editableCopy} onClick={editScript} aria-label={`编辑第 ${i+1} 段文案`}>{item}</UnstyledButton>:item}</li>)}</ol>}
   {!p.ready&&<div className={styles.unavailable}>{p.reason||'执行前需要补充配置'}</div>}
  </div>
  <footer className={`${styles.nodeFooter} nodrag nopan`}>
   <div className={styles.progressLabel}><span>{stateLabel(c.status)}</span><span>{c.progress.total?`${c.progress.completed} / ${c.progress.total}`:c.status==='skipped'?'无需生成':'等待输入'}</span></div>
   <div role="progressbar" aria-label={`${p.title}完成进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${c.progress.completed} 项完成，共 ${c.progress.total} 项`} className={styles.progress}><i style={{width:`${percent}%`}}/></div>
   <Button size="compact-xs" variant="subtle" fullWidth rightSection={<IconArrowUpRight size={13}/>} onClick={()=>open(p.id)} aria-label={`查看${p.title}详情`}>查看内容与操作</Button>
  </footer>
  <Handle type="source" position={Position.Right} isConnectable={false} className={styles.handle}/>
 </article>
})
const nodeTypes={workflow:WorkflowCard}
const ariaLabels={
 'node.a11yDescription.default':'按方向键移动选中的节点。按 Escape 取消选择。',
 'edge.a11yDescription.default':'制作步骤之间的依赖关系。',
 'controls.ariaLabel':'画布控制','controls.zoomIn.ariaLabel':'放大画布','controls.zoomOut.ariaLabel':'缩小画布',
 'controls.fitView.ariaLabel':'查看完整流程','controls.interactive.ariaLabel':'切换节点拖动','minimap.ariaLabel':'工作流小地图',
 'handle.ariaLabel':'步骤连接点',
}
function Canvas({state,onOpen,onEditScript,storageKey}:{state:StudioState;onOpen:(id:string)=>void;onEditScript?:()=>void;storageKey:string}){
 const flow=useReactFlow<WorkflowNode>();const {zoom}=useViewport()
 const saved=useRef(loadCanvasLayout(storageKey))
 const [nodes,setNodes]=useState<WorkflowNode[]>([]);const nodesRef=useRef(nodes);nodesRef.current=nodes
 const [layingOut,setLayingOut]=useState(true);const ready=useRef(false)
 const [notice,setNotice]=useState('');const [expanded,setExpanded]=useState(false)
 const root=useRef<HTMLDivElement>(null);const layoutRequest=useRef(0)
 const packages=useMemo(()=>workflowPackages(state),[state])
 const topology=JSON.stringify(packages.map(p=>({node:p.node,dependencies:p.dependencies})))
 const layoutPackages=useMemo(()=>JSON.parse(topology) as PackageInfo[],[topology])
 const content=useMemo(()=>new Map(packages.map(p=>[p.node!,canvasPresentation(state,p)])),[state,packages])
 const runningPackages=packages.filter(p=>content.get(p.node!)?.status==='running')
 const current=stageNode(state,state.run?.stage??packages[0]?.node??'F01')
 const edges=useMemo(()=>canvasEdges(packages).map(e=>{
  const status=content.get(e.source)?.status;const running=content.get(e.target)?.status==='running'
  const color=running?'#ffd166':status==='done'||status==='skipped'?'#60bca8':'#475870'
  return {...e,animated:running,style:{stroke:color,strokeWidth:running?3:1.6,...(running?{vectorEffect:'non-scaling-stroke' as const}:{})},markerEnd:{type:MarkerType.ArrowClosed,color,width:18,height:18}}
 }),[packages,content])

 useEffect(()=>{
  setNodes(old=>packages.map((p,i)=>{
   const prior=old.find(n=>n.id===p.node)
   return {...prior,id:p.node!,type:'workflow',position:prior?.position??saved.current?.positions[p.node!]??{x:40+i*(NODE_WIDTH+100),y:40},
    width:NODE_WIDTH,height:NODE_HEIGHT,dragHandle:'.workflow-node-drag',deletable:false,connectable:false,
    ariaLabel:`${p.node} ${p.title}`,data:{package:p,content:content.get(p.node!)!,open:onOpen,editScript:state.run?.script&&['F02','F03'].includes(p.node!)?onEditScript:undefined}}
  }))
 },[packages,content,onOpen,onEditScript,state.run?.script])

 const persist=useCallback((next=flow.getNodes())=>{
  if(!ready.current)return
  const positions=Object.fromEntries(next.map(n=>[n.id,n.position]))
  if(!saveCanvasLayout(storageKey,positions,flow.getViewport()))setNotice('浏览器无法保存布局，本次拖动将在离开后丢失。')
 },[flow,storageKey])
 const settleLayout=useCallback((positions:CanvasPositions,restore:boolean)=>{
  setNodes(old=>old.map(n=>({...n,position:restore&&saved.current?.positions[n.id]?saved.current.positions[n.id]:positions[n.id]??n.position})))
 },[])
 useEffect(()=>{
  let live=true;ready.current=false;setLayingOut(true)
  layoutWorkflow(layoutPackages).then(positions=>{if(live)settleLayout(positions,layoutPackages.every(p=>!!saved.current?.positions[p.node!]))}).catch(()=>{if(live)setNotice('自动排列暂时不可用，可以继续拖动节点。')}).finally(()=>{if(live){ready.current=true;setLayingOut(false)}})
  return()=>{live=false;ready.current=false;layoutRequest.current++}
 },[layoutPackages,settleLayout])

 const initialView=useRef(false)
 useEffect(()=>{
  if(layingOut||!flow.viewportInitialized||!nodes.length||initialView.current)return
  initialView.current=true
  if(saved.current?.viewport)void flow.setViewport(saved.current.viewport)
  else void flow.fitView({nodes:nodes.slice(0,3).map(n=>({id:n.id})),padding:.18,minZoom:.3,maxZoom:.85})
 },[layingOut,flow,nodes])
 const changeNodes=useCallback((changes:NodeChange<WorkflowNode>[])=>{
  const next=applyNodeChanges(changes,nodesRef.current);nodesRef.current=next;setNodes(next)
  if(changes.some(c=>c.type==='position'&&!c.dragging))persist(next)
 },[persist])
 async function arrange(){
  const request=++layoutRequest.current;setLayingOut(true);setNotice('')
  try{
   const positions=await layoutWorkflow(layoutPackages)
   if(request!==layoutRequest.current)return
   settleLayout(positions,false)
   requestAnimationFrame(()=>{void flow.fitView({padding:.12,duration:250}).then(()=>persist())})
  }catch{setNotice('自动排列失败，请稍后重试。')}finally{if(request===layoutRequest.current)setLayingOut(false)}
 }
 function focus(id:string){void flow.fitView({nodes:[{id}],padding:.25,minZoom:.55,maxZoom:.9,duration:250})}
 useEffect(()=>{
  if(!expanded)return
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)}
  const old=document.body.style.overflow;document.body.style.overflow='hidden';window.addEventListener('keydown',escape,true)
  return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',escape,true)}
 },[expanded])
 return <div ref={root} className={styles.canvas} style={{'--workflow-highlight-scale':Math.max(1,1/zoom)} as CSSProperties} data-expanded={expanded} data-testid="workflow-canvas" aria-label="制作工作流无限画布">
  <ReactFlow<WorkflowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changeNodes} onMoveEnd={()=>persist()} onNodeDragStop={()=>persist()}
   nodesDraggable={!layingOut} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
   defaultViewport={saved.current?.viewport??{x:20,y:40,zoom:.7}} colorMode="dark" ariaLabelConfig={ariaLabels} nodeDragThreshold={5}
   panOnDrag={[0,1,2]} selectionKeyCode="Shift" multiSelectionKeyCode="Shift" zoomOnDoubleClick={false}
   onNodeDoubleClick={(_,node)=>{setExpanded(false);onOpen(node.data.package.id)}}
  >
   <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#344256"/>
   <Panel position="top-left" className={styles.toolbar}>
    <Select aria-label="定位制作步骤" placeholder="定位步骤" data={packages.map(p=>({value:p.node!,label:`${p.stepNumber??p.node} ${p.title}`}))} value={null} onChange={id=>{if(id)focus(id)}} size="xs" searchable w={170} comboboxProps={{withinPortal:false}} classNames={{input:styles.select}}/>
    <Tooltip label="按依赖重新排列节点"><Button size="compact-xs" variant="subtle" leftSection={<IconLayoutDistributeHorizontal size={15}/>} onClick={()=>void arrange()} loading={layingOut}>自动排列</Button></Tooltip>
    <Tooltip label="定位当前制作步骤"><ActionIcon variant="subtle" aria-label="定位当前步骤" onClick={()=>{if(current)focus(current)}}><IconFocus2 size={17}/></ActionIcon></Tooltip>
    <Tooltip label="查看完整流程"><ActionIcon variant="subtle" aria-label="查看全部节点" onClick={()=>void flow.fitView({padding:.12,duration:250})}><IconArrowsMaximize size={17}/></ActionIcon></Tooltip>
    <Tooltip label={expanded?'退出大画布':'展开大画布'}><ActionIcon variant="subtle" aria-label={expanded?'退出大画布':'展开大画布'} onClick={()=>setExpanded(v=>!v)}>{expanded?<IconMinimize size={17}/>:<IconMaximize size={17}/>}</ActionIcon></Tooltip>
   </Panel>
   <Panel position="top-right" className={styles.canvasStatus}>
    <span className={styles.counter}>{packages.length} 个节点 · {Math.round(zoom*100)}%</span>
    {runningPackages.length>0&&<div className={styles.runningList} role="status" aria-label="正在执行的步骤">
     {runningPackages.map(p=><UnstyledButton key={p.node} className={styles.runningLocation} aria-label={`定位正在执行的${p.title}`} title={`正在执行 ${p.stepNumber??p.node} · ${p.title}，点击定位`} onClick={()=>focus(p.node!)}>
      <span className={styles.runningLocationLabel}><span aria-hidden="true">▶</span> 正在执行 <IconFocus2 size={15}/></span>
      <strong>{p.stepNumber??p.node} · {p.title}</strong>
     </UnstyledButton>)}
    </div>}
   </Panel>
   <Controls showInteractive={false}/>
   <MiniMap<WorkflowNode> pannable zoomable nodeColor={n=>n.data.content.status==='done'?'#55a994':n.data.content.status==='running'?'#ffd166':'#35475d'} maskColor="#090e18bb" className={styles.minimap}/>
   <Panel position="bottom-center" className={styles.hint}>拖动标题移动节点 · 拖动空白平移 · 滚轮缩放 · Shift 多选</Panel>
   {layingOut&&<Panel position="top-center" className={styles.loading}><Loader size="xs"/>正在排列流程…</Panel>}
   {notice&&<Panel position="bottom-center" className={styles.notice}><span role="status">{notice}</span></Panel>}
  </ReactFlow>
 </div>
}

export default function WorkflowCanvas({state,onOpen,onEditScript}:{state:StudioState;onOpen:(id:string)=>void;onEditScript?:()=>void}){
 const {user}=useAuth();const key=canvasStorageKey(user?.user_id??'anonymous',state.project.id)
 return <ReactFlowProvider key={key}><Canvas state={state} onOpen={onOpen} onEditScript={onEditScript} storageKey={key}/></ReactFlowProvider>
}
