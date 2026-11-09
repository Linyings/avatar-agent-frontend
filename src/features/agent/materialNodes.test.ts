import {describe,it,expect} from 'vitest'
import {materialFixture} from './materialNodes.fixture'
import {workflowPackages} from './workflowProgress'
import {canvasEdges,canvasPresentation} from './workflowCanvas'
import {nodeStatus,stageNode} from './studioService'

describe('individual video production nodes',()=>{
 it('creates one stable node per video and routes every output into the merge',()=>{
  const s=materialFixture(),p=workflowPackages(s),children=p.filter(p=>p.materialId)
  expect(children.map(p=>p.node)).toEqual(['F06/a1','F07/m1'])
  expect(p.find(p=>p.node==='F10')?.dependencies).toEqual(['F06/a1','F07/m1'])
  expect(canvasEdges(p).some(e=>e.source==='F06/a1'&&e.target==='F07/m1')).toBe(true)
  expect(p.find(p=>p.node==='F11')?.dependencies).toEqual(['F10'])
 })
 it('shows only the selected prompt, video and actual progress, including failed child orders',()=>{
  const s=materialFixture(),p=workflowPackages(s)
  const c=canvasPresentation(s,p.find(p=>p.materialId==='a1')!)
  expect(c.prompt).toBe('正面讲解');expect(c.media.map(m=>m.name)).toEqual(['人物.mp4']);expect(c.status).toBe('done')
  expect(stageNode(s,'F07/m1')).toBe('F07/m1')
  s.run!.status='failed';s.run!.stage='F06/a1-piece1';s.run!.steps[0].status='failed'
  expect(nodeStatus(s,'F06/a1')).toBe('failed')
  expect(stageNode(s,s.run!.stage)).toBe('F06/a1')
 })
 it('keeps merge pending until all videos and assembly finish',()=>{
  const s=materialFixture();s.run!.steps.push({id:'F09',status:'succeeded',seconds:1},{id:'F10',status:'succeeded',seconds:1})
  expect(nodeStatus(s,'F10')).not.toBe('done')
  s.run!.steps[1].status='succeeded';s.run!.materials.push({need_id:'m1',kind:'animation',duration:5})
  expect(nodeStatus(s,'F10')).toBe('done')
 })
 it('only marks the merge as running when assembly itself is executing',()=>{
  const s=materialFixture()
  expect(nodeStatus(s,'F10')).toBe('pending')
  s.run!.steps[1].status='succeeded';s.run!.materials.push({need_id:'m1',kind:'animation',duration:5})
  s.run!.stage='F09';s.run!.steps.push({id:'F09',status:'running',seconds:0})
  expect(nodeStatus(s,'F10')).toBe('running')
 })
})

