import type {StudioState,PackageInfo} from './studioService'

export function materialFixture():StudioState {
 const input={revision:1,title:'演示',topic:'解释原理',script:'',direction:'',ratio:'9:16',style:'mg-flat-vector',voice:'',use_avatar:true,assets:[]}
 const stages=[{node:'F04',title:'配音',members:['F04']},{node:'F10',title:'镜头与专用动效制作',members:['F05','F06','F07','F08','F09','F10']},{node:'F11',title:'镜头审阅',members:['F11']}]
 return {project:{id:'p',name:'演示',input},packages:stages.map(s=>({...s,id:s.node,version:'3',tool:'',entrypoint:'run',description:'',dependencies:[],outputs:[],ready:true,reason:''} as PackageInfo)),proposal:null,styles:[],agent_configured:true,workflow_plan:{nodes:['F04','F05','F06','F07','F09','F10','F11'],material_plan_pending:false,stages},run:{id:'r',status:'running',stage:'F07/m1',input,script:'原理',pause_requested:false,duration:5,segments:[{id:'p1',chapter:'开场',text:'原理',start:0,duration:5}],needs:[{id:'a1',kind:'avatar',segment_id:'p1',content:'人物',prompt:'正面讲解',duration:5},{id:'m1',kind:'animation',segment_id:'p1',content:'结构图',prompt:'逐步展开图形',duration:5}],materials:[{need_id:'a1',kind:'avatar',duration:5}],shots:[],artifacts:[{id:'material-a1',name:'人物.mp4',media_type:'video/mp4'}],steps:[{id:'F06/a1',status:'succeeded',seconds:4},{id:'F07/m1',status:'running',seconds:0}]}}
}

