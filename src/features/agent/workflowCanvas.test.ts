import {beforeEach,describe,expect,it} from 'vitest'
import type {PackageInfo,StudioState} from './studioService'
import {canvasEdges,canvasPresentation,layoutWorkflow,loadCanvasLayout,saveCanvasLayout,canvasStorageKey} from './workflowCanvas'

const pkg=(node:string,dependencies:string[]=[]):PackageInfo=>({id:'pkg-'+node,node,title:node,dependencies,version:'1',tool:node,entrypoint:node,description:'说明',outputs:[],ready:true,reason:''})
function fixture():StudioState{
 const input={revision:1,title:'示例',topic:'主题文案',script:'草稿文案',direction:'',ratio:'9:16',style:'',voice:'',use_avatar:true,assets:[{id:'photo',name:'人物.png',kind:'photo',duration:0},{id:'excluded',name:'隐藏.png',kind:'image',duration:0,excluded:true}]}
 return {project:{id:'project-a',name:'示例',input},run:{id:'run-a',status:'running',stage:'F04/p2',input,script:'最终文案',pause_requested:false,segments:[{id:'p1',chapter:'开场',text:'第一段',audio:'private/path.wav',start:0,duration:2},{id:'p2',chapter:'正文',text:'第二段',start:2,duration:3}],shots:[],needs:[],materials:[],artifacts:[],duration:5,steps:[{id:'F04/p1',status:'succeeded',seconds:2},{id:'F04/p2',status:'running',seconds:0}]},proposal:null,packages:[],styles:[],voices:[],agent_configured:true}
}
describe('workflow graph',()=>{
 it('shows assembly batch progress and the current phase after materials are ready',()=>{
  const state=fixture();state.run!.stage='F10/batch-002'
  state.run!.steps=[{id:'F10',status:'running',seconds:1},{id:'F10/batch-001',status:'succeeded',seconds:1,production_phase:'组装分段 1/3'}, {id:'F10/batch-002',status:'running',seconds:0,production_phase:'组装分段 2/3 · p2 0–20 秒'}, {id:'F10/batch-003',status:'pending',seconds:0,production_phase:'组装分段 3/3'}]
  const view=canvasPresentation(state,{...pkg('F10'),merge:true})
  expect(view.progress).toEqual({completed:1,total:3})
  expect(view.text).toContain('1 / 3')
  expect(view.text).toContain('组装分段 2/3')
  expect(view.items.some(item=>item.includes('制作中'))).toBe(true)
  state.run!.status='failed';state.run!.steps[2].status='failed';state.run!.steps[2].error='模型输出被截断'
  expect(canvasPresentation(state,{...pkg('F10'),merge:true}).items.join(' ')).toContain('模型输出被截断')
 })
 it('connects manifest dependencies, including branches and merges, without inventing adjacent links',()=>{
  const edges=canvasEdges([pkg('F09',['F06','F07','F08']),pkg('F06',['F05']),pkg('F07',['F05']),pkg('F08',['F05']),pkg('F05',['absent'])])
  expect(edges.map(e=>`${e.source}>${e.target}`).sort()).toEqual(['F05>F06','F05>F07','F05>F08','F06>F09','F07>F09','F08>F09'])
 })
 it('automatically places dependencies before their consumers without overlapping sibling nodes',async()=>{
  const positions=await layoutWorkflow([pkg('F05'),pkg('F06',['F05']),pkg('F07',['F05']),pkg('F08',['F05']),pkg('F09',['F06','F07','F08'])])
  expect(positions.F05.x).toBeLessThan(positions.F06.x)
  expect(positions.F09.x).toBeGreaterThan(positions.F08.x)
  expect(new Set(['F06','F07','F08'].map(id=>positions[id].y)).size).toBe(3)
 })
 it('counts completed segment roots and uses protected audio URLs instead of server file paths',()=>{
  const state=fixture();state.run!.steps.push({id:'F04/p1-chunk',status:'succeeded',seconds:1})
  const voice=canvasPresentation(state,pkg('F04'))
  expect(voice.status).toBe('running')
  expect(voice.progress).toEqual({completed:1,total:2})
  expect(voice.media).toEqual([{kind:'audio',url:'/api/v1/agent/runs/run-a/segments/p1/audio',name:'开场 · 2.0 秒'}])
 })
 it('shows confirmation and interruption instead of a stale running indication',()=>{
  const state=fixture();state.run!.status='awaiting_confirmation';state.run!.confirmation='voice'
  expect(canvasPresentation(state,pkg('F04')).status).toBe('awaiting_confirmation')
  state.run!.status='interrupted';state.run!.confirmation=undefined
  expect(canvasPresentation(state,pkg('F04')).status).toBe('interrupted')
 })
 it('uses actual script and includes only visible assets in input nodes',()=>{
  const state=fixture()
  expect(canvasPresentation(state,pkg('F02')).text).toBe('最终文案')
  expect(canvasPresentation(state,pkg('F01')).media.map(m=>m.name)).toEqual(['人物.png'])
  expect(canvasPresentation(state,pkg('F01')).media[0].url).toBe('/api/v1/avatar-mvp/projects/project-a/assets/photo')
 })
 it('only shows matching material output in the corresponding generation node',()=>{
  const state=fixture();state.run!.needs=[{id:'n1',kind:'avatar',content:'人物'}]
  state.run!.artifacts=[{id:'material-n1',name:'n1.mp4',media_type:'video/mp4'},{id:'preview',name:'预览.mp4',media_type:'video/mp4'}]
  expect(canvasPresentation(state,pkg('F06')).media.map(m=>m.name)).toEqual(['n1.mp4'])
 })
 it('keeps only the finished video and cover in delivery, and segment previews in preview',()=>{
  const state=fixture();state.run!.artifacts=[
   {id:'material-n1',name:'素材.mp4',media_type:'video/mp4'},
   {id:'preview-s1',name:'第一段有声预览.mp4',media_type:'video/mp4'},
   {id:'preview-s2',name:'第二段有声预览.mp4',media_type:'video/mp4'},
   {id:'video',name:'口播成片.mp4',media_type:'video/mp4'},
   {id:'cover',name:'封面.jpg',media_type:'image/jpeg'},
   {id:'audio-p1',name:'配音.wav',media_type:'audio/wav'},
   {id:'project',name:'制作工程.zip',media_type:'application/zip'},
   {id:'other-video',name:'其他中间视频.mp4',media_type:'video/mp4'},
  ]
  expect(canvasPresentation(state,pkg('F12')).media.map(m=>m.name)).toEqual(['口播成片.mp4','封面.jpg'])
  expect(canvasPresentation(state,pkg('F11')).media.map(m=>m.name)).toEqual(['第一段有声预览.mp4','第二段有声预览.mp4'])
  state.run!.artifacts=state.run!.artifacts.filter(a=>a.id!=='video'&&a.id!=='cover')
  expect(canvasPresentation(state,pkg('F12')).media).toEqual([])
 })
})
describe('canvas layout persistence',()=>{
 beforeEach(()=>localStorage.clear())
 it('separates accounts and projects, and saves only coordinates and viewport',()=>{
  const key=canvasStorageKey('user-a','project-a')
  expect(saveCanvasLayout(key,{F01:{x:42,y:17}},{x:10,y:20,zoom:.8})).toBe(true)
  expect(loadCanvasLayout(key)).toEqual({positions:{F01:{x:42,y:17}},viewport:{x:10,y:20,zoom:.8}})
  expect(loadCanvasLayout(canvasStorageKey('user-b','project-a'))).toBeNull()
  expect(loadCanvasLayout(canvasStorageKey('user-a','project-b'))).toBeNull()
 })
 it('ignores corrupt storage and invalid positions while keeping valid nodes',()=>{
  localStorage.setItem('bad','{')
  expect(loadCanvasLayout('bad')).toBeNull()
  localStorage.setItem('mixed',JSON.stringify({version:1,positions:{F01:{x:1,y:2},F02:{x:'bad',y:3}},viewport:{x:0,y:0,zoom:0}}))
  expect(loadCanvasLayout('mixed')).toEqual({positions:{F01:{x:1,y:2}}})
 })
})
