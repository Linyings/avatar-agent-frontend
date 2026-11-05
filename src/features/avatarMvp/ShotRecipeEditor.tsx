import {Select,Text} from '@mantine/core'

export const shotRecipes=[
 {value:'host-hero',label:'人物主讲'},
 {value:'host-explain',label:'人物＋侧边信息'},
 {value:'visual-hero',label:'动画／素材主画面'},
 {value:'visual-pip',label:'素材＋人物小窗'},
 {value:'compare',label:'对比画面'},
 {value:'steps',label:'步骤流程'},
 {value:'evidence',label:'数据与证据'},
 {value:'summary',label:'总结收束'},
]
export function ShotRecipeEditor({value,onChange}:{value?:string;onChange:(value:string)=>void}){
 return <><Select label="镜头配方" value={value||null} placeholder="按内容自动选择" data={shotRecipes} onChange={v=>{if(v)onChange(v)}}/><Text size="xs" c="dimmed">配方决定构图与信息层级；不会额外生成数字人机位。动画自身已有文字时，不再重复叠卡。</Text></>
}
