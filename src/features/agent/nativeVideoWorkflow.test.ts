import {describe,expect,it} from 'vitest'
import {materialFixture} from './materialNodes.fixture'
import {workflowPackages,executionSummary} from './workflowProgress'
import {canvasEdges,canvasPresentation} from './workflowCanvas'
import {nodeStatus,stageNode} from './studioService'

function nativeState(){
 const s=materialFixture()
 s.project.input.speech_mode='native-video'
 s.workflow_plan!.stages=[
  {node:'F01',title:'用户需求整理',members:['F01']},
  {node:'F01.2',title:'需求分析',members:['F01.2']},
  {node:'F01.4',title:'参考素材分析',members:['F01.4']},
  {node:'F01.6',title:'导演稿设计',members:['F01.6']},
  {node:'F03',title:'解说文案撰写与确认',members:['F02','F03']},
  ...s.workflow_plan!.stages!,
 ]
 s.workflow_plan!.nodes.unshift('F01','F01.2','F01.4','F01.6','F02','F03')
 s.run!.stage='F04/p1-chunk-1'
 s.run!.needs=[];s.run!.materials=[];s.run!.artifacts=[]
 s.run!.steps=[{id:'F04/p1',status:'running',seconds:1},{id:'F04/p1-chunk-1',status:'running',seconds:1,generation_prompt:'人物自然讲解原理'}]
 return s
}

describe('native video generation inside production',()=>{
 it('removes the separate voice stage and connects script directly to step 7 without mutating the API snapshot',()=>{
  const s=nativeState(),before=JSON.stringify(s),p=workflowPackages(s)
  expect(p.some(p=>p.node==='F04')).toBe(false)
  const video=p.find(p=>p.node==='F04/p1')!
  expect(video).toMatchObject({stepNumber:'7.1',dependencies:['F03'],title:'数字人视频（含原声） · 开场'})
  expect(p.find(p=>p.node==='F10')?.dependencies).toEqual(['F04/p1'])
  expect(p.find(p=>p.node==='F11')?.stepNumber).toBe(8)
  expect(canvasEdges(p).some(e=>e.source==='F03'&&e.target==='F04/p1')).toBe(true)
  expect(JSON.stringify(s)).toBe(before)
 })
 it('locates the actual video generation and reports voice and picture together',()=>{
  const s=nativeState(),p=workflowPackages(s).find(p=>p.node==='F04/p1')!
  expect(stageNode(s,s.run!.stage)).toBe('F04/p1')
  expect(canvasPresentation(s,p).status).toBe('running')
  expect(nodeStatus(s,'F10')).toBe('pending')
  expect(executionSummary(s)).toMatchObject({node:'F04/p1',running:true})
  expect(executionSummary(s).title).toContain('数字人视频（含原声）')
  expect(executionSummary(s).title).toContain('第 7.1 步')
  expect(executionSummary(s).detail).toContain('声音和画面同步生成')
 })
 it('previews a completed native MP4 before material planning and keeps the same node afterwards',()=>{
  const s=nativeState(),run=s.run!
  run.segments[0].native_video='p1/native.mp4';run.segments[0].audio='p1/audio.wav'
  run.artifacts=[{id:'native-p1',name:'原声人物.mp4',media_type:'video/mp4'}]
  run.steps.forEach(step=>step.status='succeeded');run.stage='F05'
  run.steps.push({id:'F05',status:'running',seconds:0})
  const before=workflowPackages(s).find(p=>p.node==='F04/p1')!
  expect(canvasPresentation(s,before).media).toEqual([{kind:'video',url:'/api/v1/avatar-mvp/runs/r/artifacts/native-p1',name:'原声人物.mp4'}])
  expect(canvasPresentation(s,before).status).toBe('done')
  expect(nodeStatus(s,'F10')).toBe('running')
  const fixture=materialFixture().run!
  run.needs=fixture.needs;run.materials=fixture.materials;run.steps.push(...fixture.steps)
  const after=workflowPackages(s),video=after.find(p=>p.node==='F04/p1')!
  expect(video.id).toBe(before.id)
  expect(video.materialId).toBe('a1')
  expect(after.filter(p=>p.node==='F06/a1')).toHaveLength(0)
  expect(after.find(p=>p.materialId==='m1')?.dependencies).toEqual(['F04/p1'])
  expect(stageNode(s,'F06/a1')).toBe('F04/p1')
  expect(canvasPresentation(s,video).media[0].kind).toBe('video')
 })
 it('shows unknown orders and failed generation on the video node instead of an invisible voice stage',()=>{
  const s=nativeState();s.run!.status='submission_unknown'
  s.run!.steps[1].status='failed';s.run!.steps[1].error='订单状态待确认'
  expect(nodeStatus(s,'F04/p1')).toBe('submission_unknown')
  expect(executionSummary(s)).toMatchObject({node:'F04/p1',action:'refresh'})
  s.run!.status='failed'
  expect(nodeStatus(s,'F04/p1')).toBe('failed')
 })
 it('does not call a playable video complete until alignment succeeds',()=>{
  const s=nativeState();s.run!.segments[0].native_video='p1/native.mp4'
  s.run!.steps[1].status='succeeded'
  expect(nodeStatus(s,'F04/p1')).toBe('running')
  s.run!.status='paused'
  expect(nodeStatus(s,'F04/p1')).toBe('paused')
 })
 it('keeps whole-video timing work and errors visible in production after all segment videos complete',()=>{
  const s=nativeState();s.run!.stage='F04';s.run!.segments[0].native_video='p1/native.mp4'
  s.run!.steps.forEach(step=>step.status='succeeded')
  expect(stageNode(s,'F04')).toBe('F10')
  expect(nodeStatus(s,'F10')).toBe('running')
  s.run!.status='failed';s.audio_timing={total:1,completed:1,seconds:5,longest_seconds:5,issue:{code:'timing',message:'原声时间读取失败'}}
  expect(nodeStatus(s,'F10')).toBe('failed')
  expect(executionSummary(s)).toMatchObject({node:'F10',title:'原声视频时长读取异常'})
 })
 it('projects the whole production stage before segments exist and retains historical TTS stages',()=>{
  const s=nativeState();s.run=null
  const production=workflowPackages(s).find(p=>p.node==='F10')!
  expect(production.dependencies).toEqual(['F03'])
  expect(production.members).toContain('F04')
  expect(production.description).toContain('声音')
  delete s.project.input.speech_mode
  expect(workflowPackages(s).some(p=>p.node==='F04')).toBe(true)
 })
 it('preserves generated native videos when material planning fails',()=>{
  const s=nativeState();s.run!.stage='F05';s.run!.status='failed';s.run!.error='规划失败'
  expect(executionSummary(s).detail).toContain('原声视频已保留')
  expect(executionSummary(s).detail).not.toContain('视频和动效生成尚未开始')
 })
})
