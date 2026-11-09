type NodeReference={node?:string;title:string;members?:string[]}

export function nodeEditPrompt(p:NodeReference):string {
 const contents:Record<string,string>={F01:'制作需求', 'F01.4':'视频素材解读', F02:'完整口播稿',F03:'内容分段',F04:'配音和音色',F05:'素材规划',F06:'人物素材要求',F07:'动效文案和制作要求',F08:'实拍素材选择和片段',F09:'字幕',F10:'分镜布局和文字',F11:'预览画面、字幕和人物位置',F12:'成片画面、字幕和人物位置'}
 return `请先读取当前项目 ${p.node}「${p.title}」的已有内容，帮我修改${contents[p.node??'']??'节点内容'}。修改要求：`
}

export function nodeRerunInput(p:NodeReference):Record<string,unknown> {
 if(!p.node||p.node==='F01')throw new Error('制作需求请使用编辑设置')
 return {from:p.members?.[0]??p.node,target:'F12',changes:`从 ${p.node}「${p.title}」开始，重新执行此步骤及后续步骤。`}
}
