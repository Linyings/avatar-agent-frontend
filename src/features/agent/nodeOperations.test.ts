import {describe,expect,it} from 'vitest'
import {nodeEditPrompt,nodeRerunInput} from './nodeOperations'

describe('explicit workflow node operations',()=>{
 it('keeps the F04 start separate from the F12 end',()=>{
  expect(nodeRerunInput({node:'F04',title:'分段配音'})).toEqual({from:'F04',target:'F12',changes:'从 F04「分段配音」开始，重新执行此步骤及后续步骤。'})
 })
 it('uses the node ID and existing project contents in edit requests',()=>{
  for(const node of ['F01','F01.4','F02','F03','F04','F05','F06','F07','F08','F09','F10','F11','F12']){
   const prompt=nodeEditPrompt({node,title:'节点内容'})
   expect(prompt).toContain(node)
   expect(prompt).toContain('读取')
   expect(prompt).toContain('修改要求：')
  }
 })
 it('does not turn the F01 settings node into a generation request',()=>{
  expect(()=>nodeRerunInput({node:'F01',title:'制作需求'})).toThrow()
 })
})
