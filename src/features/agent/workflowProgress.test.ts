import {describe,expect,it} from 'vitest'
import {nodeStatus,stageNode,type PackageInfo,type StudioState} from './studioService'
import {workflowPackages,executionSummary} from './workflowProgress'

const dependencies:Record<string,string[]>={F01:[],'F01.4':['F01'],F02:['F01.4'],F03:['F02'],F04:['F03'],F05:['F04'],F06:['F05'],F07:['F05','F06'],F08:['F05'],F09:['F06','F07','F08'],F10:['F09'],F11:['F10'],F12:['F11']}
function fixture():StudioState{
 const input={revision:1,title:'测试',topic:'口播',script:'正文',direction:'',ratio:'9:16',style:'',voice:'',use_avatar:true,assets:[]}
 const packages=Object.entries(dependencies).map(([node,deps])=>({id:node,node,title:node,dependencies:deps,ready:true}) as PackageInfo)
 return {project:{id:'test',name:'test',input},run:null,proposal:null,packages,styles:[],voices:[],agent_configured:true}
}
describe('adaptive workflow and real execution state',()=>{
 it('attributes the reported failure to its material and supports nested motion phases',()=>{
  const s=fixture();s.workflow_plan={nodes:['F07','F10'],material_plan_pending:false,stages:[{node:'F10',title:'组装',members:['F07','F10']}]};
  s.run={id:'run',status:'failed',stage:'F07/last',error:'模型输出被截断',input:s.project.input,script:'',steps:[{id:'F07/first',status:'failed',seconds:1,error:'模型输出被截断'},{id:'F07/last',status:'failed',seconds:1,error:'代码校验失败'}],needs:[{id:'first',kind:'animation',content:'金币'},{id:'last',kind:'animation',content:'历史估值'}],segments:[],materials:[],shots:[],artifacts:[],duration:0,pause_requested:false};
  expect(executionSummary(s).node).toBe('F07/first');
  s.run.error_step_id='F07/first/scene-2';s.run.steps.push({id:'F07/first/scene-2',status:'failed',seconds:1,error:'模型输出被截断'});
  expect(executionSummary(s).node).toBe('F07/first');
  expect(stageNode(s,'F07/first/scene-2')).toBe('F07/first');
  s.run.steps[2].retry={last_error:'模型输出被截断',strategy:'压缩代码',automatic_retries:3,exhausted:true};
  expect(executionSummary(s).action).toBe('diagnose');
  s.run.error_step_id='F07/first';s.run.steps[0].retry={last_error:'模型输出被截断',strategy:'压缩代码',automatic_retries:0};
  expect(executionSummary(s).action).toBe('diagnose');
  s.run.status='running';s.run.steps[0].status='succeeded';s.run.steps[2].status='running';
  expect(nodeStatus(s,'F07/first')).toBe('running');
 });
 it('designs motion after avatar footage while allowing motion-only projects',()=>{
  const s=fixture();s.project.input.use_animation=true;
  expect(workflowPackages(s).find(p=>p.node==='F07')?.dependencies).toEqual(['F06']);
  s.project.input.use_avatar=false;
  expect(workflowPackages(s).find(p=>p.node==='F07')?.dependencies).toEqual(['F05']);
 })
 it('removes irrelevant branches and reconnects dependency edges through hidden nodes',()=>{
  const s=fixture(),p=workflowPackages(s)
  expect(p.map(p=>p.node)).not.toEqual(expect.arrayContaining(['F01.4','F07','F08']))
  expect(p.find(p=>p.node==='F02')?.dependencies).toEqual(['F01'])
  expect(p.find(p=>p.node==='F09')?.dependencies).toEqual(['F06'])
 })
 it('uses confirmed needs and retains existing run inputs while draft is edited',()=>{
  const s=fixture();s.run={id:'run',status:'running',stage:'F08/n1',input:{...s.project.input,assets:[{id:'v1',name:'ref.mp4',kind:'video',duration:1}]},script:'正文',steps:[{id:'F05',status:'succeeded',seconds:1}],needs:[{id:'n1',kind:'real',content:'实际视频'}],segments:[],materials:[],shots:[],artifacts:[],duration:1,pause_requested:false}
  const p=workflowPackages(s).map(p=>p.node)
  expect(p).toContain('F01.4');expect(p).toContain('F08');expect(p).not.toContain('F06');expect(p).not.toContain('F07')
 })
 it('shows not started after a chat reply without a submitted run',()=>{
  const summary=executionSummary(fixture())
  expect(summary.title).toContain('尚未启动');expect(summary.action).toBe('start');expect(summary.running).toBe(false)
 })
 it('separates waiting for approval, target reached, stopped and errors',()=>{
  const s=fixture();s.run={id:'run',status:'awaiting_confirmation',confirmation:'script',stage:'F03',input:s.project.input,script:'正文',steps:[],needs:[],segments:[],materials:[],shots:[],artifacts:[],duration:0,pause_requested:false,target_node:'F12'}
  expect(executionSummary(s)).toMatchObject({action:'confirm',running:false});expect(executionSummary(s).title).toContain('确认文案')
  s.run.status='paused';s.run.target_node='F03';expect(executionSummary(s).detail).toContain('指定步骤');expect(executionSummary(s).action).toBe('resume')
  s.run.status='failed';s.run.error='模型请求超时';expect(executionSummary(s).detail).toContain('模型请求超时');expect(executionSummary(s).action).toBe('retry')
  s.run.status='stopped';expect(executionSummary(s).title).toContain('已停止');expect(executionSummary(s).running).toBe(false)
 })
 it('restores active Agent work after refresh without implying the video started',()=>{
  const s=fixture();s.agent_activity={status:'running',phase:'thinking',turn_id:'turn',started_at:new Date().toISOString(),updated_at:new Date().toISOString()}
  expect(executionSummary(s)).toMatchObject({running:true,action:undefined});expect(executionSummary(s).title).toContain('Agent')
 })
 it('never treats unknown submission as an approval or a safe retry',()=>{
  const s=fixture();s.run={id:'run',status:'submission_unknown',stage:'F04/p1',input:s.project.input,script:'正文',steps:[],needs:[],segments:[],materials:[],shots:[],artifacts:[],duration:0,pause_requested:false,script_confirmed:true}
  expect(executionSummary(s)).toMatchObject({action:'refresh',running:false})
  expect(executionSummary(s).detail).toContain('文案已确认')
 })
 it('allows an explicit retry for unknown submissions in server-enabled testing mode',()=>{
  const s=fixture();s.testing_mode=true;s.run={id:'run',status:'submission_unknown',stage:'F04/p1',input:s.project.input,script:'正文',steps:[],needs:[],segments:[],materials:[],shots:[],artifacts:[],duration:0,pause_requested:false,script_confirmed:true}
  expect(executionSummary(s)).toMatchObject({action:'retry',running:false})
  expect(executionSummary(s).detail).not.toContain('核对供应商订单')
 })
 it('shows continuous paragraph progress and one choice after the complete batch',()=>{
  const s=fixture();s.run={id:'run',status:'running',stage:'F04/p2',input:s.project.input,script:'正文',steps:[],needs:[],segments:[{id:'p1',chapter:'',text:'第一句',audio:'p1/audio.wav',duration:2,start:0},{id:'p2',chapter:'',text:'第二句',duration:0,start:0}],materials:[],shots:[],artifacts:[],duration:0,pause_requested:false}
  expect(executionSummary(s).action).toBeUndefined()
  expect(executionSummary(s).detail).toContain('已完成 1 / 2 段配音')
  s.run.segments[1].audio='p2/audio.wav';s.run.segments[1].duration=2;s.run.status='awaiting_confirmation';s.run.confirmation='audio'
  expect(executionSummary(s)).toMatchObject({title:'全部 2 段配音已完成',action:'confirm',node:'F04'})
  expect(executionSummary(s).detail).toContain('累计 4.00 秒')
 })
 it('explains historical material planning JSON failures without implying video generation failed',()=>{
  const s=fixture();s.testing_mode=true;s.run={id:'run',status:'submission_unknown',stage:'F05',error:'文本模型输出不是本节点需要的JSON（model_invalid_json）；本次调用状态待确认',input:s.project.input,script:'正文',steps:[],needs:[],segments:[],materials:[],shots:[],artifacts:[],duration:94,pause_requested:false}
  const result=executionSummary(s)
  expect(result.title).toContain('素材规划')
  expect(result.detail).toContain('JSON')
  expect(result.detail).toContain('视频和动效生成尚未开始')
  expect(result.title).not.toContain('上次请求未完成')
  expect(result.action).toBe('retry')
 })
 it('retains the actual diagnostic when a testing-mode network request is uncertain',()=>{
  const s=fixture();s.testing_mode=true;s.run={id:'run',status:'submission_unknown',stage:'F07/motion',error:'文本模型连接或响应超时（network_timeout）',input:s.project.input,script:'正文',steps:[],needs:[],segments:[],materials:[],shots:[],artifacts:[],duration:94,pause_requested:false}
  expect(executionSummary(s).detail).toContain('network_timeout')
 })
})
