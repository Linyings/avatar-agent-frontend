import {describe,it,expect} from 'vitest'
import {workflowPackages,executionSummary} from './workflowProgress'
import {canvasPresentation} from './workflowCanvas'
import type {StudioState,PackageInfo} from './studioService'

const stages=[['F01','用户需求整理',['F01']],['F01.2','需求分析',['F01.2']],['F01.4','参考素材分析',['F01.4']],['F01.6','导演稿设计',['F01.6']],['F03','解说文案撰写与确认',['F02','F03']],['F04','TTS 配音与时长校准',['F04']],['F10','镜头与专用动效制作',['F05','F06','F07','F08','F09','F10']],['F11','镜头审阅与修改',['F11']],['F11.1','分层融合与逐帧渲染',['F11.1']],['F11.2','成片预览与修订',['F11.2']],['F12','成片交付',['F12']]] as const
function state():StudioState{
 const input={revision:1,title:'原理',topic:'原理',script:'',direction:'',ratio:'9:16',style:'',voice:'',use_avatar:true,assets:[]}
 const packages=stages.flatMap(s=>s[2].map(node=>({id:node,node,title:node,description:'',dependencies:[],outputs:[],ready:true,version:'3',tool:node,entrypoint:'run',reason:''} as PackageInfo)))
 return {project:{id:'p',name:'p',input},packages,styles:[],voices:[],agent_configured:true,proposal:null,workflow_plan:{nodes:packages.map(p=>p.node!),material_plan_pending:false,stages:stages.map(([node,title,members])=>({node,title,members:[...members]}))},run:{id:'r',version:'avatar-workflow/3.0',status:'awaiting_confirmation',confirmation:'shots',confirmation_version:'v',stage:'F11',input,script:'解释原理',pause_requested:false,duration:2,segments:[{id:'p1',chapter:'原理',text:'解释原理',start:0,duration:2}],shots:[{id:'S1',segment_id:'p1',start:0,end:2,primary:'host',layout:'pip',keyword:'原理'}],needs:[],materials:[],steps:[],artifacts:[{id:'preview-S1',name:'S1有声预览.mp4',media_type:'video/mp4'},{id:'video',name:'成片.mp4',media_type:'video/mp4'}]}}
}
describe('director workflow stages',()=>{
 it('lists text references without requesting image previews and shows pending reference analysis',()=>{const s=state();s.run=null;s.project.input.assets=[{id:'text',name:'reference.md',kind:'text',duration:0}];const p=workflowPackages(s);expect(canvasPresentation(s,p[0]).media).toEqual([]);expect(canvasPresentation(s,p[0]).items).toEqual(['参考文案：reference.md']);expect(canvasPresentation(s,p[2]).text).toContain('待分析 1 份参考资料');expect(canvasPresentation(s,p[2]).progress.total).toBe(1)})
 it('presents eleven stages and groups execution substeps',()=>{const s=state(),p=workflowPackages(s);expect(p).toHaveLength(11);expect(p[6].members).toContain('F07');expect(p[7].dependencies).toEqual(['F10'])})
 it('shows shot approval instead of audio confirmation and keeps delivery clean',()=>{const s=state();expect(executionSummary(s)).toMatchObject({node:'F11',action:'confirm',title:'等待你确认镜头'});const p=workflowPackages(s);expect(canvasPresentation(s,p[7]).media.map(m=>m.name)).toEqual(['S1有声预览.mp4']);expect(canvasPresentation(s,p[10]).media.map(m=>m.name)).toEqual(['成片.mp4'])})
 it('requires final review after rendering and locates a running substep',()=>{const s=state();s.run!.confirmation='final';s.run!.stage='F11.2';expect(executionSummary(s).title).toContain('成片');s.run!.status='running';s.run!.stage='F07/n1';expect(executionSummary(s).node).toBe('F10')})
})
